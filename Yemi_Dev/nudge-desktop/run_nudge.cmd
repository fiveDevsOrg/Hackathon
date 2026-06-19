@echo off
REM ===========================================================================
REM  Nudge OS launcher
REM  - cd to this script's own directory
REM  - create .venv on first run (py launcher, falling back to python)
REM  - install runtime deps once, then reuse the venv on later runs
REM  - launch the app with pythonw.exe (no console window), forwarding all args
REM ===========================================================================

REM (1) Always operate from the folder this script lives in.
cd /d "%~dp0"

REM Pick a Python launcher: prefer the "py" launcher, fall back to "python".
set "PYLAUNCH=py -3"
where py >nul 2>nul
if errorlevel 1 set "PYLAUNCH=python"

REM (2) Create the virtual environment on first run, otherwise just activate it.
if not exist ".venv\Scripts\activate.bat" (
    echo [Nudge] Creating virtual environment...
    %PYLAUNCH% -m venv .venv
    if errorlevel 1 (
        echo [Nudge] ERROR: failed to create virtual environment.
        pause
        exit /b 1
    )
    call ".venv\Scripts\activate.bat"
    echo [Nudge] Installing dependencies...
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [Nudge] ERROR: dependency installation failed.
        pause
        exit /b 1
    )
) else (
    call ".venv\Scripts\activate.bat"
)

REM (3) Launch the app detached from the console, forwarding any extra args.
start "" ".venv\Scripts\pythonw.exe" nudge_desktop.py %*
