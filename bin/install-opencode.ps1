# team-harness opencode installer bootstrap (Windows PowerShell)
# Pipeable: iwr https://valianx.github.io/team-harness/install-opencode.ps1 | iex
# Or run from a clone: .\bin\install-opencode.ps1
# NOT deprecated — this is the live opencode install path for Windows.
#
# The downloaded binary is verified against the published SHA256SUMS before
# it runs (fail-closed SHA256 verify: exact-field asset match, case-insensitive
# hash comparison, -UseBasicParsing on both downloads). See README.md §Security.
$ErrorActionPreference = "Stop"

# A script loaded with `iwr | iex` runs in the caller's session.  Preserve the
# child status there without terminating that session; a script invoked from a
# file still returns the native exit code to its PowerShell host.
$script:ThBootstrapInvokedFromFile =
    -not [string]::IsNullOrEmpty($MyInvocation.MyCommand.Path) -and
    $MyInvocation.InvocationName -ne "."

function ConvertTo-NativeArgument {
    param([AllowNull()][AllowEmptyString()][string]$Value)

    if ($null -eq $Value) { $Value = "" }
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }

    # ProcessStartInfo.ArgumentList is unavailable on Windows PowerShell 5.1.
    # This is the CommandLineToArgvW quoting rule used by the fallback below:
    # backslashes before quotes are doubled, and trailing backslashes inside a
    # quoted argument are doubled so the closing quote remains literal.
    $quoted = '"'
    $backslashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq [char]92) {
            $backslashes++
            continue
        }
        if ($character -eq [char]34) {
            $quoted += [string]::new([char]92, ($backslashes * 2) + 1) + '"'
            $backslashes = 0
            continue
        }
        $quoted += [string]::new([char]92, $backslashes) + $character
        $backslashes = 0
    }
    return $quoted + [string]::new([char]92, $backslashes * 2) + '"'
}

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

$Asset    = "install-windows-$Arch.exe"
$SumsUrl  = "$BaseUrl/SHA256SUMS"
$BinUrl   = "$BaseUrl/$Asset"

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    # NOTE: filename must NOT contain "install", "setup", "update", or "patch" —
    # Windows applies an "installer detection" heuristic to executables with those
    # names and forces UAC elevation even when launched via CreateProcess with
    # UseShellExecute=$false. Using a neutral name bypasses the heuristic.
    # See docs/install.md §Windows UAC for context.
    $SumsPath    = Join-Path $TmpDir "SHA256SUMS"
    $InstallerPath = Join-Path $TmpDir "th-opencode-bootstrap.exe"

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
        Invoke-WebRequest -Uri $BinUrl -OutFile $InstallerPath -UseBasicParsing -TimeoutSec 120
    } catch {
        Write-Host "Error: download failed from $BinUrl"
        Write-Host "  This usually means: (a) no release has been tagged yet, (b) GitHub is"
        Write-Host "  unreachable from this network, or (c) your firewall blocks github.com."
        Write-Host "  Releases: https://github.com/$Repo/releases"
        exit 1
    }

    # ── Verify SHA256 checksum (fail-closed, SEC-001 + SEC-002) ───────────────
    #
    # SEC-002: EXACT-FIELD asset-name match.
    # Split each SHA256SUMS line into fields (<hash>  <name>).
    # The assets share a common prefix (install-windows-amd64.exe vs
    # install-windows-arm64.exe), so a substring match would be ambiguous.
    # Compare the name field with exact string equality (-eq), not -match or
    # Select-String which are substring/regex operations.
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
    $ActualHash = (Get-FileHash -Algorithm SHA256 -Path $InstallerPath).Hash.ToLowerInvariant()
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
    # Invoke-WebRequest tags downloads with a Zone.Identifier ADS marking them
    # as "from internet." Without stripping, SmartScreen / Defender can interfere
    # with execution in some user environments. Unblock-File is a no-op when the
    # ADS does not exist; -ErrorAction SilentlyContinue makes the call safe on
    # older PowerShell versions where the cmdlet behaves differently.
    Unblock-File -Path $InstallerPath -ErrorAction SilentlyContinue

    # ── Run the verified binary directly (not piped) ───────────────────────────
    # Use .NET ProcessStartInfo directly with UseShellExecute=$false to avoid
    # Start-Process's ShellExecuteEx path, which triggers UAC mediation when the
    # working directory is protected or the executable carries Mark-of-the-Web.
    # With UseShellExecute=$false and no stream redirection, the child inherits
    # the parent PowerShell console — same window, all output visible, and the
    # TUI interactive prompts receive real stdin input.
    # Cross-compatible with PowerShell 5.1 and 7.x.
    Write-Host "Launching installer..."

    # Build argv as individual values. ArgumentList preserves these values on
    # PowerShell 7; the serializer below preserves them on PowerShell 5.1.
    $childArgs = @("apply", "--runtime", "opencode", "--scope", "global")
    # Append --memory-url when MEMORY_MCP_URL is set (pass via argv, not env,
    # to avoid the value appearing in shell history).
    if ($env:MEMORY_MCP_URL -and $env:MEMORY_MCP_URL -ne '') {
        $childArgs += @("--memory-url", [string]$env:MEMORY_MCP_URL)
    }
    # Forward any extra positional args the operator passed to this script.
    if ($args.Count -gt 0) {
        $childArgs += @($args | ForEach-Object { [string]$_ })
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $InstallerPath
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $false
    if ($null -ne $psi.GetType().GetProperty("ArgumentList")) {
        foreach ($argument in $childArgs) {
            [void]$psi.ArgumentList.Add([string]$argument)
        }
    } else {
        $psi.Arguments = (($childArgs | ForEach-Object {
            ConvertTo-NativeArgument ([string]$_)
        }) -join " ")
    }

    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit()
    $code = [int]$proc.ExitCode
    $global:LASTEXITCODE = $code
    if ($script:ThBootstrapInvokedFromFile) { exit $code }
} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
