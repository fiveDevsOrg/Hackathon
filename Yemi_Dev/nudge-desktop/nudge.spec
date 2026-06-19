# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for Nudge OS — the Windows PyQt5 desktop copilot.
#
# Build (one-dir, windowed) from the project root:
#
#     pyinstaller nudge.spec --noconfirm
#
# Output lands in:  dist/NudgeOS/NudgeOS.exe
#
# Notes
# -----
# * This is a one-DIR build (EXE + COLLECT), not one-file, so the
#   bundled assets/ and the many native PyQt5/uiautomation/comtypes
#   DLLs sit beside the executable for fast, reliable startup.
# * Several runtime dependencies are *lazy-imported* deep inside
#   functions (e.g. screen capture, UI automation, input simulation,
#   text-to-speech). PyInstaller's static analysis never sees those
#   imports, so they are listed explicitly in `hiddenimports` below —
#   omitting them produces a binary that runs until the moment a
#   feature fires, then fails with ModuleNotFoundError.
# * tkinter is excluded: the app is pure PyQt5 and pulling in Tk only
#   bloats the bundle.

# This spec is evaluated by PyInstaller as plain Python, so we can read
# the product name straight from version.py without importing it (which
# would require the project deps to already be importable here).
try:
    _ns = {}
    with open('version.py', 'r', encoding='utf-8') as _vf:
        exec(_vf.read(), _ns)
    APP_NAME = 'NudgeOS'  # executable name kept ASCII / space-free
    DISPLAY_NAME = _ns.get('__appname__', 'Nudge OS')
except Exception:
    # Never let a spec-time hiccup break the build; fall back to constants.
    APP_NAME = 'NudgeOS'
    DISPLAY_NAME = 'Nudge OS'


# Modules that are imported lazily at runtime and therefore invisible to
# PyInstaller's import graph. Keep this list in sync with the deep
# `import ...` statements scattered through nudge_desktop.py.
hidden_imports = [
    'anthropic',                  # Claude SDK (off-thread API calls)
    'mss',                        # fast screen capture
    'PIL',                        # Pillow (image handling)
    'PIL.Image',
    'uiautomation',               # Windows UI Automation tree walking
    'comtypes',                   # COM bridge used by uiautomation
    'comtypes.stream',            # often missed sub-module of comtypes
    'pynput',                     # input listening / simulation
    'pynput.mouse',
    'pynput.keyboard',
    'pynput.mouse._win32',        # platform backend, resolved at runtime
    'pynput.keyboard._win32',
    'pyttsx3',                    # offline text-to-speech
    'pyttsx3.drivers',
    'pyttsx3.drivers.sapi5',      # Windows SAPI5 voice backend
]

# Data files bundled alongside the executable. The app looks up its icon
# under an "assets" directory relative to the bundle root.
datas = [
    ('assets/nudge.ico', 'assets'),
]

# Packages we deliberately leave out to keep the bundle lean.
excludes = [
    'tkinter',
]


block_cipher = None


a = Analysis(
    ['nudge_desktop.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,        # one-dir: binaries collected by COLLECT
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,                # windowed GUI app — no console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/nudge.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name=APP_NAME,
)
