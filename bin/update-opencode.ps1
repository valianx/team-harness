# team-harness opencode updater bootstrap (Windows PowerShell)
# Pipeable: iwr https://valianx.github.io/team-harness/update-opencode.ps1 | iex
# Or run from a clone: .\bin\update-opencode.ps1
#
# Flow:
#   1. Cheap VERSION pre-check — avoids an 8 MB binary download when already
#      current (short-circuits with no download).
#   2. Download SHA256SUMS + platform binary; verify fail-closed (exact-field
#      asset-name match with -eq, case-insensitive hash comparison).
#   3. Run: binary update --runtime opencode --scope global $args
#      The Go side re-confirms the three-state delta authoritatively.
#
# AC-9: when the cheap pre-check determines the install is already current,
# the script prints "already current" and exits 0 without downloading.
# AC-10: SHA256 verification mirrors install-opencode.ps1 byte-for-byte.
$ErrorActionPreference = "Stop"

$Repo    = "valianx/team-harness"
$BaseUrl = "https://github.com/$Repo/releases/latest/download"

# Detect arch (Windows-only script; OS is implicitly windows).
$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "amd64" }
    "ARM64" { "arm64" }
    default {
        Write-Host "Error: unsupported architecture '$($env:PROCESSOR_ARCHITECTURE)'."
        Write-Host "  team-harness supports amd64 and arm64 on Windows."
        Write-Host "  See: https://github.com/$Repo/releases"
        exit 1
    }
}

$Asset = "install-windows-$Arch.exe"
$SumsUrl = "$BaseUrl/SHA256SUMS"
$BinUrl  = "$BaseUrl/$Asset"

# ---------------------------------------------------------------------------
# Cheap VERSION pre-check (AC-9).
#
# Resolve the opencode config root: %APPDATA%\opencode (Windows convention).
# Best-effort read of installed_version from .team-harness.json.
# On any uncertainty, fall through to download + the authoritative Go-side
# comparison (which parses JSON robustly and is idempotent).
#
# Skipped when passthrough args are present ($args.Count -gt 0). Flags like
# --opencode-dir point the Go binary at a non-default config root; the
# shell-side check only reads the default global path and would incorrectly
# short-circuit before the binary resolves the correct root from those args.
# ---------------------------------------------------------------------------
if ($args.Count -eq 0) {
$InstalledVersion = ''
$LatestVersion = ''

$AppDataDir = $env:APPDATA
if ($AppDataDir -and $AppDataDir -ne '') {
    $ThJsonPath = Join-Path $AppDataDir "opencode\.team-harness.json"
    if (Test-Path $ThJsonPath) {
        try {
            $ThJson = Get-Content -Raw $ThJsonPath | ConvertFrom-Json
            if ($ThJson.installed_version) {
                $InstalledVersion = [string]$ThJson.installed_version
            }
        } catch {
            # Parse failure — fall through to download path.
            $InstalledVersion = ''
        }
    }
}

try {
    $VersionContent = Invoke-WebRequest -Uri "$BaseUrl/VERSION" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    if ($VersionContent -and $VersionContent.Content) {
        $LatestVersion = $VersionContent.Content.Trim()
    }
} catch {
    # VERSION fetch failed — fall through to download path.
    $LatestVersion = ''
}

if ($InstalledVersion -ne '' -and $LatestVersion -ne '') {
    if ($InstalledVersion -eq $LatestVersion) {
        Write-Host "th update — already current"
        Write-Host "  installed version   $InstalledVersion"
        Write-Host "  latest version      $LatestVersion"
        Write-Host "No action required."
        exit 0
    }

    # Shell-level semver compare: if installed > latest, report installed-ahead.
    # Best-effort (PowerShell arithmetic); Go side is authoritative.
    function Compare-SemVer($a, $b) {
        # Returns 1 when a > b, -1 when a < b, 0 when equal.
        # Non-parseable versions compare as 0 (not-ahead).
        try {
            $partsA = $a.Split('.') | ForEach-Object { [int]$_ }
            $partsB = $b.Split('.') | ForEach-Object { [int]$_ }
            for ($i = 0; $i -lt 3; $i++) {
                $ai = if ($i -lt $partsA.Count) { $partsA[$i] } else { 0 }
                $bi = if ($i -lt $partsB.Count) { $partsB[$i] } else { 0 }
                if ($ai -gt $bi) { return 1 }
                if ($ai -lt $bi) { return -1 }
            }
            return 0
        } catch { return 0 }
    }

    $cmp = Compare-SemVer $InstalledVersion $LatestVersion
    if ($cmp -gt 0) {
        Write-Host "th update — installed ahead"
        Write-Host "  installed version   $InstalledVersion"
        Write-Host "  latest version      $LatestVersion"
        Write-Host "The installed version is newer than the latest release."
        Write-Host "To upgrade, wait for the next release or re-install from GitHub Releases."
        exit 0
    }
}
} # end: $args.Count -eq 0 pre-check guard

# ---------------------------------------------------------------------------
# Download and verify (mirrors install-opencode.ps1 byte-for-byte — AC-10).
# ---------------------------------------------------------------------------
$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    $SumsPath = Join-Path $TmpDir "SHA256SUMS"

    # NOTE: filename must NOT contain "update", "install", "setup", or "patch" —
    # Windows applies an "installer detection" heuristic to executables with those
    # names and forces UAC elevation even when launched via CreateProcess with
    # UseShellExecute=$false. Using a neutral name bypasses the heuristic.
    # See docs/install.md §Windows UAC for context.
    $UpdaterPath = Join-Path $TmpDir "th-opencode-bootstrap.exe"

    # ── Download SHA256SUMS (fail-closed, SEC-003) ─────────────────────────────
    Write-Host "Downloading SHA256SUMS..."
    try {
        Invoke-WebRequest -Uri $SumsUrl -OutFile $SumsPath -UseBasicParsing -TimeoutSec 30
    } catch {
        Write-Host "Error: download failed from $SumsUrl"
        Write-Host "  Check that a release has been tagged at https://github.com/$Repo/releases"
        exit 1
    }

    # ── Download the binary (fail-closed, SEC-003) ─────────────────────────────
    Write-Host "Downloading $Asset from latest release..."
    try {
        Invoke-WebRequest -Uri $BinUrl -OutFile $UpdaterPath -UseBasicParsing -TimeoutSec 120
    } catch {
        Write-Host "Error: download failed from $BinUrl"
        Write-Host "  Releases: https://github.com/$Repo/releases"
        exit 1
    }

    # ── Verify SHA256 checksum (fail-closed, SEC-001 + SEC-002) ───────────────
    #
    # SEC-002: EXACT-FIELD asset-name match using -eq (not Select-String or -match).
    # Split each SHA256SUMS line into fields and compare the name field with exact
    # string equality — the assets share a common prefix so substring match is
    # ambiguous.
    $ExpectedHash = $null
    Get-Content $SumsPath | ForEach-Object {
        $fields = $_ -split '\s+'
        if ($fields.Count -ge 2 -and $fields[1] -eq $Asset) {
            $ExpectedHash = $fields[0]
        }
    }

    # Abort in a distinct branch when no entry matches (never skip verification).
    if ($null -eq $ExpectedHash -or $ExpectedHash -eq '') {
        Write-Host "Error: no SHA256SUMS entry for '$Asset'; refusing to run unverified binary."
        Write-Host "  The release may not include this platform. See: https://github.com/$Repo/releases"
        exit 1
    }

    # SEC-001: case-insensitive normalized hash comparison.
    # Get-FileHash returns uppercase hex; SHA256SUMS (generated by sha256sum on
    # Linux) is lowercase. Normalize BOTH to lowercase before comparing.
    $ActualHash = (Get-FileHash -Algorithm SHA256 -Path $UpdaterPath).Hash.ToLowerInvariant()
    $ExpectedHash = $ExpectedHash.ToLowerInvariant()

    if ($ActualHash -ne $ExpectedHash) {
        Write-Host "Error: checksum verification failed for $Asset."
        Write-Host "  Expected: $ExpectedHash"
        Write-Host "  Got:      $ActualHash"
        Write-Host "  The downloaded file may be corrupt or tampered. Re-run to retry."
        exit 1
    }

    Write-Host "Checksum verified."

    # ── Strip Mark-of-the-Web Zone Identifier ─────────────────────────────────
    Unblock-File -Path $UpdaterPath -ErrorAction SilentlyContinue

    # ── Run the verified binary directly (not piped) ───────────────────────────
    Write-Host "Running updater..."

    $ArgList = "update --runtime opencode --scope global"
    # Forward any extra positional args the operator passed to this script.
    if ($args.Count -gt 0) {
        $ArgList += " $($args -join ' ')"
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $UpdaterPath
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $false
    $psi.Arguments = $ArgList

    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit()
    # Do NOT call 'exit' here — it closes the terminal window when run via
    # 'iwr | iex'. Letting the script end naturally returns to the prompt.
    $LASTEXITCODE = $proc.ExitCode
} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
