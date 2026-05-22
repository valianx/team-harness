@echo off
REM team-harness installer bootstrap (Windows cmd.exe)
REM Usage: curl -fsSL https://valianx.github.io/team-harness/install.cmd -o install.cmd ^&^& install.cmd
setlocal enableextensions

set REPO=valianx/team-harness
set BASE_URL=https://github.com/%REPO%/releases/latest/download

REM Detect arch.
if /i "%PROCESSOR_ARCHITECTURE%"=="AMD64" set ARCH=amd64
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ARCH=arm64
if not defined ARCH (
    echo Error: unsupported arch '%PROCESSOR_ARCHITECTURE%'. 1>&2
    echo   team-harness supports amd64 and arm64 on Windows. 1>&2
    echo   See: https://github.com/%REPO%/releases 1>&2
    exit /b 1
)

set ASSET=install-windows-%ARCH%.exe
set URL=%BASE_URL%/%ASSET%

REM Create a temp dir.
set TMP_DIR=%TEMP%\team-harness-install-%RANDOM%
mkdir "%TMP_DIR%" 1>nul 2>nul
if errorlevel 1 (
    echo Error: could not create temporary directory under %%TEMP%%. 1>&2
    exit /b 1
)
set INSTALLER=%TMP_DIR%\install.exe

echo Downloading %ASSET% from latest release...
curl -fsSL --max-time 120 -o "%INSTALLER%" "%URL%"
if errorlevel 1 (
    echo Error: download failed from %URL% 1>&2
    echo   This usually means: (a) no release has been tagged yet, (b) GitHub is 1>&2
    echo   unreachable from this network, or (c) your firewall blocks github.com. 1>&2
    echo   Releases: https://github.com/%REPO%/releases 1>&2
    rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
    exit /b 1
)

echo Launching installer...
"%INSTALLER%" %*
set EXITCODE=%ERRORLEVEL%

rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
exit /b %EXITCODE%
