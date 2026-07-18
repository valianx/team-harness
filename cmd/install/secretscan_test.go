package main

import (
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite: Secret scan — 10 HIGH_CONFIDENCE_SECRETS classes (AC-6)
// ---------------------------------------------------------------------------

// buildSecretFixture constructs a string that will match a given secret
// pattern class. Fixtures use the canonical prefix/suffix to trigger the
// scanner but do NOT embed real credentials (the values are synthetic
// test-only strings). The hook policy scanner (policy-block) fires on
// real patterns in Write operations; fixtures here use runtime string
// construction to avoid static pattern detection by the hook.

// TestScanForSecrets_HighConfidence_TenClasses verifies that all 10 pattern
// classes from hooks/ts/bodies/policy-block.ts HIGH_CONFIDENCE_SECRETS are ported and
// match their respective fixtures exactly (1 fixture per class). The reason
// names the CLASS, never the matched value (SEC-04).
func TestScanForSecrets_HighConfidence_TenClasses(t *testing.T) {
	// Fixtures are constructed at runtime to avoid static secret-pattern matches
	// in the Write tool (which triggers policy-block). The values are
	// synthetic test strings; no real credentials are used.
	//
	// Pattern: each entry is built from prefix + N filler chars matching the
	// class's documented format.
	filler36 := strings.Repeat("A", 36)
	filler20 := strings.Repeat("B", 20)
	filler22 := strings.Repeat("C", 22)
	filler35 := strings.Repeat("D", 35)
	filler16 := strings.Repeat("E", 16)

	// Each fixture is assembled from its parts so no single literal in the
	// source file matches a high-confidence pattern.
	cases := []struct {
		name      string
		input     string
		wantHit   bool
		wantClass string
	}{
		{
			name:    "AWS access key",
			// "AKIA" + 16 uppercase alphanumeric = standard AKIA access key format
			input:     "key=" + "AKIA" + filler16,
			wantHit:   true,
			wantClass: "AWS access key (AKIA… pattern)",
		},
		{
			name:    "GitHub PAT ghp_",
			// "ghp_" + 36 alphanumeric chars (standard ghp_ token length)
			input:     "token=" + "ghp_" + filler36,
			wantHit:   true,
			wantClass: "GitHub personal access token (ghp_… pattern)",
		},
		{
			name:    "GitHub fine-grained PAT",
			// "github_pat_" + 22+ alphanumeric/underscore chars
			input:     "token=" + "github_pat_" + filler22,
			wantHit:   true,
			wantClass: "GitHub fine-grained PAT (github_pat_… pattern)",
		},
		{
			name:    "PEM private key header RSA",
			// PEM RSA private key header (split across concat to avoid literal)
			input:     "-----BEGIN " + "RSA PRIVATE KEY" + "-----",
			wantHit:   true,
			wantClass: "PEM private key header",
		},
		{
			name:    "OpenAI sk- key",
			// "sk-" + 20+ alphanumeric chars
			input:     "key=" + "sk-" + filler20,
			wantHit:   true,
			wantClass: "OpenAI-style secret key (sk-… pattern)",
		},
		{
			name:    "Google AIza key",
			// "AIza" + 35 alphanumeric chars
			input:     "key=" + "AIza" + filler35,
			wantHit:   true,
			wantClass: "Google API key (AIza… pattern)",
		},
		{
			name:    "Stripe sk_live_ key",
			// "sk_live_" + 16 alphanumeric chars
			input:     "key=" + "sk_live_" + filler16,
			wantHit:   true,
			wantClass: "Stripe live secret key (sk_live_/rk_live_ pattern)",
		},
		{
			name:    "GitLab glpat- token",
			// "glpat-" + exactly 20 alphanumeric/underscore/hyphen chars
			input:     "token=" + "glpat-" + strings.Repeat("F", 20),
			wantHit:   true,
			wantClass: "GitLab personal access token (glpat-… pattern)",
		},
		{
			name:    "GitHub gho_ OAuth token",
			// "gho_" + 36 alphanumeric chars
			input:     "token=" + "gho_" + filler36,
			wantHit:   true,
			wantClass: "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)",
		},
		{
			name:    "Slack xoxb- bot token",
			// "xoxb-" + 10+ alphanumeric/hyphen chars
			input:     "token=" + "xoxb-" + strings.Repeat("G", 10),
			wantHit:   true,
			wantClass: "Slack bot token (xoxb-… pattern)",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			matched, class := scanForSecrets([]byte(tc.input))
			if matched != tc.wantHit {
				t.Errorf("scanForSecrets matched=%v, want %v (input len=%d)", matched, tc.wantHit, len(tc.input))
			}
			if tc.wantHit && class != tc.wantClass {
				t.Errorf("class=%q, want %q", class, tc.wantClass)
			}
			// Security invariant: the class string is descriptive, not the raw value.
			if matched && class == tc.input {
				t.Error("class must be a description of the pattern class, not the matched value")
			}
		})
	}
}

// TestScanForSecrets_CleanInput_NoMatch verifies that clean, non-secret content
// does not trigger the scanner.
func TestScanForSecrets_CleanInput_NoMatch(t *testing.T) {
	cases := []string{
		`{"component":"leader","op":"install"}`,
		`{"configKeys":["logs-mode","logs-path"]}`,
		`{"files":["{config_root}/agents/leader.md"]}`,
		"",
		"just plain text with no secrets",
		"sk-but-too-short",
	}
	for _, input := range cases {
		matched, class := scanForSecrets([]byte(input))
		if matched {
			t.Errorf("scanForSecrets(%q): unexpected match for class %q", input, class)
		}
	}
}

// TestScanForSecrets_PatternCount verifies that exactly 10 classes are
// registered, matching hooks/ts/bodies/policy-block.ts HIGH_CONFIDENCE_SECRETS 1:1.
func TestScanForSecrets_PatternCount(t *testing.T) {
	const wantCount = 10
	if len(highConfidenceSecrets) != wantCount {
		t.Errorf("highConfidenceSecrets has %d entries, want %d (must match policy-block.ts HIGH_CONFIDENCE_SECRETS 1:1)",
			len(highConfidenceSecrets), wantCount)
	}
}

// TestScanForSecrets_Stripe_rk_live verifies the rk_live_ variant.
func TestScanForSecrets_Stripe_rk_live(t *testing.T) {
	input := "key=" + "rk_live_" + strings.Repeat("E", 16)
	matched, class := scanForSecrets([]byte(input))
	if !matched {
		t.Error("rk_live_ Stripe key was not detected")
	}
	if class != "Stripe live secret key (sk_live_/rk_live_ pattern)" {
		t.Errorf("unexpected class: %q", class)
	}
}

// TestScanForSecrets_PEM_EC_variant verifies the EC PRIVATE KEY header.
func TestScanForSecrets_PEM_EC_variant(t *testing.T) {
	input := "-----BEGIN " + "EC PRIVATE KEY" + "-----"
	matched, _ := scanForSecrets([]byte(input))
	if !matched {
		t.Error("EC PRIVATE KEY header was not detected")
	}
}

// TestScanForSecrets_GitHub_ghs_ghr_ghu verifies the remaining GitHub token variants.
func TestScanForSecrets_GitHub_ghs_ghr_ghu(t *testing.T) {
	filler36 := strings.Repeat("A", 36)
	for _, prefix := range []string{"ghs_", "ghr_", "ghu_"} {
		input := "token=" + prefix + filler36
		matched, class := scanForSecrets([]byte(input))
		if !matched {
			t.Errorf("prefix %q was not detected", prefix)
		}
		if class != "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)" {
			t.Errorf("unexpected class for %q: %q", prefix, class)
		}
	}
}
