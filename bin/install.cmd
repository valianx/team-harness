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
set "SETUP_PENDING="

:inspect_args
set "CURRENT_ARG=%~1"
if not defined CURRENT_ARG set "CURRENT_ARG=__no_argument__"
if /i "%~1"=="setup" goto :setup_action
if defined SETUP_PENDING if /i "%~1"=="models" goto :download
if defined SETUP_PENDING if /i "%~1"=="plan" goto :native_notice
if defined SETUP_PENDING if /i "%~1"=="apply" goto :native_notice
if defined SETUP_PENDING if /i "%~1"=="update" goto :native_notice
if defined SETUP_PENDING if /i "%~1"=="uninstall" goto :native_notice
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
if /i "%~1"=="--worker-models-file" goto :skip_value
if /i "%~1"=="--opencode-cli" goto :skip_value
if /i "%~1"=="--force" goto :next_arg
if /i "%~1"=="--non-interactive" goto :next_arg
if /i "%~1"=="--yes" goto :next_arg
if /i "%~1"=="--dry-run" goto :next_arg
if /i "%CURRENT_ARG:~0,10%"=="--runtime=" goto :next_arg
if /i "%CURRENT_ARG:~0,8%"=="--scope=" goto :next_arg
if /i "%CURRENT_ARG:~0,15%"=="--opencode-dir=" goto :next_arg
if /i "%CURRENT_ARG:~0,12%"=="--codex-dir=" goto :next_arg
if /i "%CURRENT_ARG:~0,13%"=="--memory-url=" goto :next_arg
if /i "%CURRENT_ARG:~0,16%"=="--opencode-tier=" goto :next_arg
if /i "%CURRENT_ARG:~0,21%"=="--worker-models-file=" goto :next_arg
if /i "%CURRENT_ARG:~0,15%"=="--opencode-cli=" goto :next_arg
goto :native_notice

:setup_action
set "SETUP_PENDING=1"
goto :next_arg

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
echo For opencode or Codex, pass plan, apply, update, uninstall, or setup models (OpenCode).
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
set SUMS_URL=%BASE_URL%/SHA256SUMS
set URL=%BASE_URL%/%ASSET%

REM Create a temp dir.
set TMP_DIR=%TEMP%\team-harness-install-%RANDOM%
mkdir "%TMP_DIR%" 1>nul 2>nul
if errorlevel 1 (
    echo Error: could not create temporary directory under %%TEMP%%. 1>&2
    exit /b 1
)
set INSTALLER=%TMP_DIR%\install.exe
set SUMS_PATH=%TMP_DIR%\SHA256SUMS

echo DEPRECATED: This script is the legacy install path. 1>&2
echo   Canonical install: /plugin marketplace add valianx/team-harness 1>&2
echo   Then: /plugin install th ^&^& /th:setup  (inside Claude Code) 1>&2
echo Downloading SHA256SUMS...
curl -fsSL --max-time 30 -o "%SUMS_PATH%" "%SUMS_URL%"
if errorlevel 1 (
    echo Error: download failed from %SUMS_URL% 1>&2
    echo   Releases: https://github.com/%REPO%/releases 1>&2
    rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
    exit /b 1
)
echo Downloading %ASSET% from latest release...
curl -fsSL --max-time 120 -o "%INSTALLER%" "%URL%"
if errorlevel 1 (
    echo Error: download failed from %URL% 1>&2
    echo   This usually means: ^(a^) no release has been tagged yet, ^(b^) GitHub is 1>&2
    echo   unreachable from this network, or ^(c^) your firewall blocks github.com. 1>&2
    echo   Releases: https://github.com/%REPO%/releases 1>&2
    rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
    exit /b 1
)

REM Keep paths in the local environment; never interpolate them as PowerShell code.
powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $expected=$null; Get-Content -LiteralPath $env:SUMS_PATH | ForEach-Object { $fields=$_ -split '\s+'; if ($fields.Count -ge 2 -and $fields[1] -eq $env:ASSET) { $expected=$fields[0] } }; if ([string]::IsNullOrEmpty($expected)) { exit 1 }; $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $env:INSTALLER).Hash; if ($actual -ine $expected) { exit 1 }; exit 0"
if errorlevel 1 (
    echo Error: checksum verification failed for %ASSET%. 1>&2
    rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
    exit /b 1
)
echo Checksum verified.

echo Launching installer...
"%INSTALLER%" %FORWARD_ARGS%
set EXITCODE=%ERRORLEVEL%

rmdir /s /q "%TMP_DIR%" 1>nul 2>nul
exit /b %EXITCODE%
