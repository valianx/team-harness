@echo off
REM team-harness installer bootstrap (Windows cmd.exe)
REM Usage: curl -fsSL https://valianx.github.io/team-harness/install.cmd -o install.cmd ^&^& install.cmd
REM DEPRECATED: This script is the legacy install path as of v2.33.0.
REM Canonical install: /plugin marketplace add valianx/team-harness && /plugin install th && /th:setup
REM See bin/README.md for details.
setlocal enableextensions

REM Claude Code is installed from its native marketplace. Download the binary
REM only when a native-engine subcommand was requested explicitly. The manifest
REM dispatcher accepts supported flags before the subcommand, for example
REM --runtime codex apply.
set "FORWARD_ARGS=%*"

:inspect_args
if "%~1"=="" goto :native_notice
set "CURRENT_ARG=%~1"
if /i "%~1"=="plan" goto :download
if /i "%~1"=="apply" goto :download
if /i "%~1"=="update" goto :download
if /i "%~1"=="uninstall" goto :download
if /i "%~1"=="--runtime" goto :skip_value
if /i "%~1"=="--scope" goto :skip_value
if /i "%~1"=="--opencode-dir" goto :skip_value
if /i "%~1"=="--codex-dir" goto :skip_value
if /i "%~1"=="--memory-url" goto :skip_value
if /i "%~1"=="--opencode-tier" goto :skip_value
if /i "%~1"=="--force" goto :next_arg
if /i "%~1"=="--non-interactive" goto :next_arg
if /i "%~1"=="--yes" goto :next_arg
if /i "%CURRENT_ARG:~0,10%"=="--runtime=" goto :next_arg
if /i "%CURRENT_ARG:~0,8%"=="--scope=" goto :next_arg
if /i "%CURRENT_ARG:~0,14%"=="--opencode-dir=" goto :next_arg
if /i "%CURRENT_ARG:~0,11%"=="--codex-dir=" goto :next_arg
if /i "%CURRENT_ARG:~0,13%"=="--memory-url=" goto :next_arg
if /i "%CURRENT_ARG:~0,15%"=="--opencode-tier=" goto :next_arg
goto :native_notice

:skip_value
shift
if "%~1"=="" goto :native_notice

:next_arg
shift
goto :inspect_args

:native_notice
echo Claude Code installation is native:
echo   /plugin marketplace add valianx/team-harness
echo   /plugin install th
echo   /th:setup
echo.
echo For opencode or Codex, pass an explicit subcommand (plan, apply, update, or uninstall).
exit /b 0

:download

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

echo DEPRECATED: This script is the legacy install path. 1>&2
echo   Canonical install: /plugin marketplace add valianx/team-harness 1>&2
echo   Then: /plugin install th ^&^& /th:setup  (inside Claude Code) 1>&2
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
"%INSTALLER%" %FORWARD_ARGS%
set EXITCODE=%ERRORLEVEL%

rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
exit /b %EXITCODE%
