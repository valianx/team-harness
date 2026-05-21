# team-harness installer bootstrap (Windows PowerShell)
# Downloads the right prebuilt Go binary from the latest GitHub Release and runs it.
$ErrorActionPreference = "Stop"

$Repo = "valianx/team-harness"

# Find latest release tag.
try {
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    $Latest = $Release.tag_name
} catch {
    Write-Error "Error: could not resolve latest release. Has a release been tagged yet?"
    Write-Host "See: https://github.com/$Repo/releases"
    exit 1
}
if (-not $Latest) {
    Write-Error "Error: could not resolve latest release tag."
    exit 1
}

# Detect arch.
$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "amd64" }
    "ARM64" { "arm64" }
    default {
        Write-Error "Error: unsupported processor architecture '$($env:PROCESSOR_ARCHITECTURE)'."
        exit 1
    }
}

$Asset = "install-windows-${Arch}.exe"
$Url = "https://github.com/$Repo/releases/download/$Latest/$Asset"

$TmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    $InstallerPath = Join-Path $TmpDir "install.exe"
    Write-Host "Downloading $Asset from $Latest..."
    Invoke-WebRequest -Uri $Url -OutFile $InstallerPath -UseBasicParsing

    Write-Host "Running install (you may be prompted for backend choice + API key)..."
    & $InstallerPath @args
    exit $LASTEXITCODE
} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
