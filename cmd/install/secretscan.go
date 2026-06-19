package main

import (
	"regexp"
)

// secretClass names a pattern class detected by the scan.
// It names the CLASS, never the matched value (SEC-04).
type secretClass struct {
	pattern *regexp.Regexp
	class   string
}

// highConfidenceSecrets is the Go port of the HIGH_CONFIDENCE_SECRETS list in
// hooks/policy-block.sh (lines 159-170). The 10 classes are byte-equivalent.
// The reason names the pattern CLASS, never the matched value (SEC-04).
var highConfidenceSecrets = []secretClass{
	{
		regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
		"AWS access key (AKIA… pattern)",
	},
	{
		regexp.MustCompile(`\bghp_[A-Za-z0-9]{36}\b`),
		"GitHub personal access token (ghp_… pattern)",
	},
	{
		regexp.MustCompile(`\bgithub_pat_[A-Za-z0-9_]{22,}\b`),
		"GitHub fine-grained PAT (github_pat_… pattern)",
	},
	{
		regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----`),
		"PEM private key header",
	},
	{
		regexp.MustCompile(`\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b`),
		"OpenAI-style secret key (sk-… pattern)",
	},
	{
		regexp.MustCompile(`\bAIza[0-9A-Za-z_\-]{35}\b`),
		"Google API key (AIza… pattern)",
	},
	{
		regexp.MustCompile(`\b[rs]k_live_[0-9A-Za-z]{16,}\b`),
		"Stripe live secret key (sk_live_/rk_live_ pattern)",
	},
	{
		regexp.MustCompile(`\bglpat-[0-9A-Za-z_\-]{20}\b`),
		"GitLab personal access token (glpat-… pattern)",
	},
	{
		regexp.MustCompile(`\bgh[osru]_[A-Za-z0-9]{36}\b`),
		"GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)",
	},
	{
		regexp.MustCompile(`\bxoxb-[A-Za-z0-9-]{10,}\b`),
		"Slack bot token (xoxb-… pattern)",
	},
}

// scanForSecrets checks b against every HIGH_CONFIDENCE_SECRETS pattern.
// On a match it returns (true, className) where className names the pattern
// CLASS — never the matched value. On no match it returns (false, "").
func scanForSecrets(b []byte) (matched bool, class string) {
	for _, sc := range highConfidenceSecrets {
		if sc.pattern.Match(b) {
			return true, sc.class
		}
	}
	return false, ""
}
