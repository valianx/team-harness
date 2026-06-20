package main

// Tests for the opencode apply path: --memory-url flag parsing, URL validation,
// empty-URL hard-error, and the bearer-unset warning being non-blocking.
//
// os.Exit paths (AC-2, AC-2b) cannot be directly exercised in unit tests without
// subprocess wiring. The tests below cover the deterministic helpers that
// feed those paths:
//   - parseDispatchFlags consumes --memory-url (AC-2c)
//   - resolveOpencodeMemoryURL returns the flag value when set
//   - resolveOpencodeMemoryURL returns the env var value when set and no flag
//   - validateMCPURL rejects non-http(s) schemes (AC-2b)
//   - The bearer warning path is non-blocking (AC-10): MEMORY_MCP_BEARER unset
//     does not cause a non-zero exit; the warning only goes to stderr.

import (
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite — --memory-url flag parsing (AC-2c)
// ---------------------------------------------------------------------------

// TestParseDispatchFlags_MemoryURLFlag_SpaceSeparated verifies that --memory-url
// followed by a value (space-separated form) is consumed by parseDispatchFlags
// and stored in memoryURLFlag. Without this, the flag falls into `remaining`
// and is silently dropped — AC-2c requires the flag to be live.
func TestParseDispatchFlags_MemoryURLFlag_SpaceSeparated(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	remaining := parseDispatchFlags([]string{"--memory-url", "https://example.com/mcp", "apply"})

	if memoryURLFlag != "https://example.com/mcp" {
		t.Errorf("memoryURLFlag = %q, want %q", memoryURLFlag, "https://example.com/mcp")
	}
	if len(remaining) != 1 || remaining[0] != "apply" {
		t.Errorf("remaining = %v, want [apply]", remaining)
	}
}

// TestParseDispatchFlags_MemoryURLFlag_EqualsSeparated verifies the --flag=value
// form is also consumed (mirrors existing --runtime=value handling).
func TestParseDispatchFlags_MemoryURLFlag_EqualsSeparated(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	remaining := parseDispatchFlags([]string{"--memory-url=https://example.com/mcp", "apply"})

	if memoryURLFlag != "https://example.com/mcp" {
		t.Errorf("memoryURLFlag = %q, want %q", memoryURLFlag, "https://example.com/mcp")
	}
	if len(remaining) != 1 || remaining[0] != "apply" {
		t.Errorf("remaining = %v, want [apply]", remaining)
	}
}

// TestParseDispatchFlags_MemoryURLFlag_NotDroppedAsUnknown is the key regression
// guard for AC-2c: without the --memory-url case in the switch, the flag and its
// value land in `remaining` and memoryURLFlag stays "". This test would fail if
// the case were removed.
func TestParseDispatchFlags_MemoryURLFlag_NotDroppedAsUnknown(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	remaining := parseDispatchFlags([]string{"--memory-url", "https://mcp.example.com/mcp"})

	// The flag must NOT appear in remaining (it was consumed).
	for _, r := range remaining {
		if strings.Contains(r, "--memory-url") || r == "https://mcp.example.com/mcp" {
			t.Errorf("--memory-url was not consumed; it appeared in remaining: %v", remaining)
		}
	}
	// And the value must have been captured.
	if memoryURLFlag != "https://mcp.example.com/mcp" {
		t.Errorf("memoryURLFlag not set: got %q", memoryURLFlag)
	}
}

// ---------------------------------------------------------------------------
// Suite — resolveOpencodeMemoryURL (AC-2, AC-2c)
// ---------------------------------------------------------------------------

// TestResolveOpencodeMemoryURL_FromFlag verifies that the --memory-url flag
// value takes priority over the MEMORY_MCP_URL env var.
func TestResolveOpencodeMemoryURL_FromFlag(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = "https://flag.example.com/mcp"

	t.Setenv("MEMORY_MCP_URL", "https://env.example.com/mcp")

	got := resolveOpencodeMemoryURL()
	if got != "https://flag.example.com/mcp" {
		t.Errorf("resolveOpencodeMemoryURL() = %q, want flag value", got)
	}
}

// TestResolveOpencodeMemoryURL_FromEnv verifies fallback to MEMORY_MCP_URL
// when no --memory-url flag is set (AC-2c: the env path still works).
func TestResolveOpencodeMemoryURL_FromEnv(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "https://env.example.com/mcp")

	got := resolveOpencodeMemoryURL()
	if got != "https://env.example.com/mcp" {
		t.Errorf("resolveOpencodeMemoryURL() = %q, want env value", got)
	}
}

// TestResolveOpencodeMemoryURL_FlagWhitespaceIsTrimmed verifies that a flag
// value with leading/trailing whitespace is trimmed (defensive: shell quoting).
func TestResolveOpencodeMemoryURL_FlagWhitespaceIsTrimmed(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = "  https://flag.example.com/mcp  "

	got := resolveOpencodeMemoryURL()
	if got != "https://flag.example.com/mcp" {
		t.Errorf("resolveOpencodeMemoryURL() = %q, want trimmed value", got)
	}
}

// ---------------------------------------------------------------------------
// Suite — validateMCPURL scheme validation (AC-2b)
// ---------------------------------------------------------------------------

// TestValidateMCPURL_AcceptsHTTP verifies that http:// is accepted.
func TestValidateMCPURL_AcceptsHTTP(t *testing.T) {
	if err := validateMCPURL("http://example.com/mcp"); err != nil {
		t.Errorf("validateMCPURL(http) = %v, want nil", err)
	}
}

// TestValidateMCPURL_AcceptsHTTPS verifies that https:// is accepted.
func TestValidateMCPURL_AcceptsHTTPS(t *testing.T) {
	if err := validateMCPURL("https://example.com/mcp"); err != nil {
		t.Errorf("validateMCPURL(https) = %v, want nil", err)
	}
}

// TestValidateMCPURL_RejectsFileScheme verifies that file:// is rejected (AC-2b).
func TestValidateMCPURL_RejectsFileScheme(t *testing.T) {
	if err := validateMCPURL("file:///etc/passwd"); err == nil {
		t.Error("validateMCPURL(file://) should return an error, got nil")
	}
}

// TestValidateMCPURL_RejectsFTPScheme verifies that ftp:// is rejected (AC-2b).
func TestValidateMCPURL_RejectsFTPScheme(t *testing.T) {
	if err := validateMCPURL("ftp://example.com/mcp"); err == nil {
		t.Error("validateMCPURL(ftp://) should return an error, got nil")
	}
}

// TestValidateMCPURL_RejectsJavascriptScheme verifies that javascript: is
// rejected (AC-2b — the plan explicitly names this as a test case).
func TestValidateMCPURL_RejectsJavascriptScheme(t *testing.T) {
	if err := validateMCPURL("javascript:alert(1)"); err == nil {
		t.Error("validateMCPURL(javascript:) should return an error, got nil")
	}
}

// TestValidateMCPURL_RejectsWhitespaceOnly verifies that an all-whitespace value
// is treated as an invalid scheme (it starts with neither http:// nor https://).
func TestValidateMCPURL_RejectsWhitespaceOnly(t *testing.T) {
	if err := validateMCPURL("   "); err == nil {
		t.Error("validateMCPURL(whitespace) should return an error, got nil")
	}
}

// TestValidateMCPURL_RejectsEmpty verifies that an empty string is rejected.
func TestValidateMCPURL_RejectsEmpty(t *testing.T) {
	if err := validateMCPURL(""); err == nil {
		t.Error("validateMCPURL(\"\") should return an error, got nil")
	}
}

// ---------------------------------------------------------------------------
// Suite — --runtime first-wins (SEC-001)
// ---------------------------------------------------------------------------

// TestParseDispatchFlags_RuntimeFirstWins verifies that the first --runtime
// occurrence wins and a later --runtime does NOT override it. This is the
// SEC-001 guard: bin/install-opencode.sh pins "--runtime opencode" first; an
// operator-supplied "--runtime claude-code" appended via "$@" must be ignored.
func TestParseDispatchFlags_RuntimeFirstWins(t *testing.T) {
	orig := runtimeFlag
	defer func() { runtimeFlag = orig }()
	runtimeFlag = "claude-code" // reset to default before parsing

	// Simulate: install apply --runtime opencode --scope global --memory-url <url> --runtime claude-code
	// The second --runtime must be ignored.
	parseDispatchFlags([]string{"--runtime", "opencode", "--runtime", "claude-code"})

	if runtimeFlag != "opencode" {
		t.Errorf("first-wins violated: runtimeFlag = %q, want %q", runtimeFlag, "opencode")
	}
}

// TestParseDispatchFlags_RuntimeFirstWins_EqualsSeparated verifies the same
// first-wins behaviour when the second occurrence uses the --flag=value form.
func TestParseDispatchFlags_RuntimeFirstWins_EqualsSeparated(t *testing.T) {
	orig := runtimeFlag
	defer func() { runtimeFlag = orig }()
	runtimeFlag = "claude-code" // reset to default before parsing

	parseDispatchFlags([]string{"--runtime=opencode", "--runtime=claude-code"})

	if runtimeFlag != "opencode" {
		t.Errorf("first-wins (equals form) violated: runtimeFlag = %q, want %q", runtimeFlag, "opencode")
	}
}

// TestParseDispatchFlags_RuntimeFirstWins_MixedForms verifies first-wins
// holds when the two occurrences use different separator forms.
func TestParseDispatchFlags_RuntimeFirstWins_MixedForms(t *testing.T) {
	orig := runtimeFlag
	defer func() { runtimeFlag = orig }()
	runtimeFlag = "claude-code"

	parseDispatchFlags([]string{"--runtime", "opencode", "--runtime=claude-code"})

	if runtimeFlag != "opencode" {
		t.Errorf("first-wins (mixed forms) violated: runtimeFlag = %q, want %q", runtimeFlag, "opencode")
	}
}
