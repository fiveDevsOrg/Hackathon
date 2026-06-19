"""
autostart.py — Windows run-at-login support for Nudge OS.

Uses the stdlib `winreg` module to register (or remove) Nudge OS under the
per-user "Run" key so the app launches automatically when the user signs in.

Public API:
    set_autostart(enabled: bool) -> bool
    is_autostart() -> bool

Both functions are defensive: every registry interaction is wrapped in
try/except and they never raise. They return a boolean indicating success
(set_autostart) or current state (is_autostart). This honours the app's
never-crash guarantee.
"""

import os
import sys

# winreg is Windows-only and part of the stdlib. Import defensively so that
# importing this module never blows up on a non-Windows platform.
try:
    import winreg  # type: ignore
except Exception:  # pragma: no cover - non-Windows fallback
    winreg = None  # type: ignore


# Registry location for per-user run-at-login entries.
_RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"

# The value name we register under. Kept stable so set/is/remove all agree.
_VALUE_NAME = "NudgeOS"


def _nudge_script_path() -> str:
    """
    Resolve the absolute path to nudge_desktop.py, which lives next to this
    file in the same directory.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "nudge_desktop.py")


def _build_launch_command() -> str:
    """
    Construct the command line written into the Run key.

    Frozen (e.g. PyInstaller .exe):
        "<sys.executable>"

    Source (running under a Python interpreter):
        "<pythonw.exe next to sys.executable>" "<abspath of nudge_desktop.py>"

    pythonw.exe is preferred so the app starts without a console window. If a
    sibling pythonw.exe cannot be found we fall back to sys.executable.
    """
    is_frozen = bool(getattr(sys, "frozen", False))

    if is_frozen:
        # The frozen executable IS the launcher; no script argument needed.
        return '"{0}"'.format(sys.executable)

    # Running from source: prefer pythonw.exe (no console) sitting next to the
    # current interpreter, falling back to sys.executable if it's absent.
    exe_dir = os.path.dirname(sys.executable)
    pythonw = os.path.join(exe_dir, "pythonw.exe")
    launcher = pythonw if os.path.exists(pythonw) else sys.executable

    return '"{0}" "{1}"'.format(launcher, _nudge_script_path())


def set_autostart(enabled: bool) -> bool:
    """
    Enable or disable launching Nudge OS at user login.

    enabled=True  -> writes the NudgeOS value into the Run key.
    enabled=False -> deletes the NudgeOS value (ignoring "not found").

    Returns True on success, False on any error. Never raises.
    """
    if winreg is None:
        # Not on Windows (or winreg unavailable): nothing we can do.
        return False

    try:
        # Open the per-user Run key for writing. KEY_SET_VALUE is sufficient
        # for both SetValueEx and DeleteValue operations.
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            _RUN_KEY_PATH,
            0,
            winreg.KEY_SET_VALUE,
        )
    except Exception:
        return False

    try:
        if enabled:
            command = _build_launch_command()
            winreg.SetValueEx(key, _VALUE_NAME, 0, winreg.REG_SZ, command)
        else:
            # Remove the entry. Tolerate the value already being absent.
            try:
                winreg.DeleteValue(key, _VALUE_NAME)
            except FileNotFoundError:
                pass
            except OSError:
                # Some Windows builds raise a generic OSError for a missing
                # value; treat that as already-disabled rather than failure.
                pass
        return True
    except Exception:
        return False
    finally:
        # Always release the registry handle.
        try:
            winreg.CloseKey(key)
        except Exception:
            pass


def is_autostart() -> bool:
    """
    Report whether Nudge OS is currently registered to run at login.

    Returns True if the NudgeOS value exists in the Run key, False otherwise
    (including any error or non-Windows environment). Never raises.
    """
    if winreg is None:
        return False

    key = None
    try:
        # Read-only access is enough to query the value.
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            _RUN_KEY_PATH,
            0,
            winreg.KEY_QUERY_VALUE,
        )
        value, _value_type = winreg.QueryValueEx(key, _VALUE_NAME)
        # Consider any non-empty string value as "enabled".
        return bool(value)
    except FileNotFoundError:
        return False
    except Exception:
        return False
    finally:
        if key is not None:
            try:
                winreg.CloseKey(key)
            except Exception:
                pass
