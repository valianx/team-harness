# team-harness installer bootstrap (Windows PowerShell)
# Pipeable: irm https://valianx.github.io/team-harness/install.ps1 | iex
# Or run from a clone: .\bin\install.ps1
$ErrorActionPreference = "Stop"

$Repo    = "valianx/team-harness"
$BaseUrl = "https://github.com/$Repo/releases/latest/download"

# Detect arch (Windows-only script; OS is implicitly windows).
$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "amd64" }
    "ARM64" { "arm64" }
    default {
        Write-Host "Error: unsupported arch '$($env:PROCESSOR_ARCHITECTURE)'." -ForegroundColor Red
        Write-Host "  team-harness supports amd64 and arm64 on Windows."
        Write-Host "  See: https://github.com/$Repo/releases"
        exit 1
    }
}

$Asset = "install-windows-$Arch.exe"
$Url   = "$BaseUrl/$Asset"

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    $InstallerPath = Join-Path $TmpDir "install.exe"
    Write-Host "Downloading $Asset from latest release..."
    try {
        Invoke-WebRequest -Uri $Url -OutFile $InstallerPath -UseBasicParsing -TimeoutSec 120
    } catch {
        Write-Host "Error: download failed from $Url" -ForegroundColor Red
        Write-Host "  This usually means: (a) no release has been tagged yet, (b) GitHub is"
        Write-Host "  unreachable from this network, or (c) your firewall blocks github.com."
        Write-Host "  Releases: https://github.com/$Repo/releases"
        exit 1
    }

    Write-Host "Launching installer..."
    # -NoNewWindow forces inheritance of the parent PowerShell console.
    # Without it, running via `irm ... | iex` causes Windows to allocate a new
    # cmd console for the spawned .exe — that window closes on exit, hiding all
    # output. -Wait keeps the bootstrap alive until the child exits; -PassThru
    # returns the process object so we can forward the exit code.
    if ($args.Count -gt 0) {
        $proc = Start-Process -FilePath $InstallerPath -ArgumentList $args -NoNewWindow -Wait -PassThru
    } else {
        $proc = Start-Process -FilePath $InstallerPath -NoNewWindow -Wait -PassThru
    }
    exit $proc.ExitCode
} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
