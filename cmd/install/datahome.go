package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// ResolveDataHome returns the absolute, security-verified path to the
// team-harness data directory.  The five-branch resolution order is:
//
//  1. TEAM_HARNESS_DATA_HOME — explicit canonical override.
//  2. TH_DATA_HOME — explicit short alias.
//  3. Runtime-native config root (Claude Code detected via CLAUDE_DATA_DIR or
//     the presence of ~/.claude).
//  4. OS-default user data dir (XDG / Library / LOCALAPPDATA).
//  5. ~/.team-harness — final fallback.
//
// Every candidate produced by any branch is fed through a single
// branch-agnostic security pipeline (SEC-01/02/03/08) before being returned.
// On any security failure the function returns a non-nil error (fail-closed).
//
// Memoization: the resolved path is cached after the FIRST successful call.
// Errors are NEVER cached, so a transient failure does not poison the session.
// The cache is process-scoped; it does NOT survive an in-process environment
// change — callers in a long-lived process (e.g. the Phase-4 TS runtime once
// ported to Go) that mutate relevant env vars must call [ResetDataHomeCache]
// before the next resolution.
var (
	dataHomeCacheMu sync.Mutex
	dataHomeCache   string // non-empty means cached
)

// ResetDataHomeCache clears the memoised result so the next call to
// ResolveDataHome re-evaluates the environment.  Exposed for tests and for
// long-lived runtimes that change env vars in-process.
func ResetDataHomeCache() {
	dataHomeCacheMu.Lock()
	defer dataHomeCacheMu.Unlock()
	dataHomeCache = ""
}

// ResolveDataHome resolves, secures, and returns the data-home path.
func ResolveDataHome() (string, error) {
	dataHomeCacheMu.Lock()
	if dataHomeCache != "" {
		cached := dataHomeCache
		dataHomeCacheMu.Unlock()
		return cached, nil
	}
	dataHomeCacheMu.Unlock()

	candidate, err := resolveCandidate()
	if err != nil {
		return "", fmt.Errorf("data-home resolution: %w", err)
	}

	verified, err := secureAndVerify(candidate)
	if err != nil {
		return "", fmt.Errorf("data-home security: %w", err)
	}

	dataHomeCacheMu.Lock()
	dataHomeCache = verified
	dataHomeCacheMu.Unlock()

	return verified, nil
}

// OpenStateFile opens (or creates) a state file called name directly under the
// verified data-home root.  It is opened with O_NOFOLLOW (Unix) / the
// reparse-point-rejecting equivalent (Windows) and mode 0600.  A symlink at
// the target path is refused at the syscall — never silently followed.
//
// This helper is exported so Phase-3 (ledger) and Phase-4 (TS runtime) consumers
// inherit the O_NOFOLLOW guarantee rather than re-implementing it.
func OpenStateFile(name string) (*os.File, error) {
	root, err := ResolveDataHome()
	if err != nil {
		return nil, err
	}
	return openStateFilePlatform(root, name)
}

// ---------------------------------------------------------------------------
// Branch resolution — platform-neutral
// ---------------------------------------------------------------------------

// resolveCandidate picks the first matching branch (highest priority wins)
// and returns the raw, unexpanded candidate path.
func resolveCandidate() (string, error) {
	// Branch 1: TEAM_HARNESS_DATA_HOME
	if v := strings.TrimSpace(os.Getenv("TEAM_HARNESS_DATA_HOME")); v != "" {
		return v, nil
	}

	// Branch 2: TH_DATA_HOME (short alias)
	if v := strings.TrimSpace(os.Getenv("TH_DATA_HOME")); v != "" {
		return v, nil
	}

	// Branch 3: runtime-native config root (Claude Code detection)
	if p, ok := claudeCodeRoot(); ok {
		return filepath.Join(p, "team-harness"), nil
	}

	// Branch 4: OS-default user data dir
	if p, ok := osDefaultDataDir(); ok {
		return p, nil
	}

	// Branch 5: ~/.team-harness fallback
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	return filepath.Join(home, ".team-harness"), nil
}

// claudeCodeRoot detects the Claude Code config directory.
// Returns the directory path and true when a Claude Code root is found.
// The probe is ordered and the first match wins.
func claudeCodeRoot() (string, bool) {
	// Probe 1: explicit env var (set by the Claude Code runtime or tests)
	if v := strings.TrimSpace(os.Getenv("CLAUDE_DATA_DIR")); v != "" {
		return v, true
	}

	// Probe 2: presence of the well-known ~/.claude directory
	home, err := os.UserHomeDir()
	if err != nil {
		return "", false
	}
	claudeDir := filepath.Join(home, ".claude")
	if fi, err := os.Lstat(claudeDir); err == nil && fi.IsDir() {
		return claudeDir, true
	}

	return "", false
}

// osDefaultDataDir returns the OS-default user data directory for team-harness.
//
//   - Linux / BSD : $XDG_DATA_HOME/team-harness (else ~/.local/share/team-harness)
//   - macOS       : ~/Library/Application Support/team-harness
//   - Windows     : %LOCALAPPDATA%\team-harness (else %APPDATA%\team-harness)
func osDefaultDataDir() (string, bool) {
	switch runtime.GOOS {
	case "windows":
		if v := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); v != "" {
			return filepath.Join(v, "team-harness"), true
		}
		if v := strings.TrimSpace(os.Getenv("APPDATA")); v != "" {
			return filepath.Join(v, "team-harness"), true
		}
		return "", false

	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", false
		}
		return filepath.Join(home, "Library", "Application Support", "team-harness"), true

	default: // Linux, BSD, etc.
		if v := strings.TrimSpace(os.Getenv("XDG_DATA_HOME")); v != "" && filepath.IsAbs(v) {
			return filepath.Join(v, "team-harness"), true
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", false
		}
		return filepath.Join(home, ".local", "share", "team-harness"), true
	}
}

// ---------------------------------------------------------------------------
// Branch-agnostic security pipeline
// ---------------------------------------------------------------------------

// secureAndVerify runs the branch-agnostic security pipeline on a raw candidate
// string and, on success, returns the verified canonical path with the data-home
// directory created (or confirmed) and secured.
//
// Pipeline order (load-bearing — do not reorder; see pseudocode in 01-plan.md):
//
//  1. Single-pass expansion via os.ExpandEnv (SEC-08: pinned, no recursive mapping).
//  2. Normalize with filepath.Clean + reject residual ".." (SEC-08 early sanity).
//  3. Require absolute path.
//  4. Per-component os.Lstat walk on the PRE-resolution path: reject any
//     symlinked / reparse-point / non-current-user-owned ancestor (SEC-01).
//     This walk runs BEFORE EvalSymlinks — a post-resolve Lstat is vacuous.
//  5. EvalSymlinks — ONLY to derive the canonical path to open; NOT the
//     security check (a post-resolve Lstat always reports "not a symlink").
//  6. Create-or-verify the directory with O_NOFOLLOW open + fstat on the fd
//     for BOTH branches (SEC-02, CWE-367).
//  7. Set/verify 0700 (Unix) / restrictive DACL (Windows) on the open fd
//     (SEC-03); fail-closed on any mismatch — no silent chmod-correct.
//
// SEC-08 note: os.ExpandEnv is the ONLY permitted expander.  It expands each
// $VAR in one pass and leaves any $VAR that appears inside an expanded value as
// a literal — it cannot recurse.  Using os.Expand with a recursive mapping, or
// calling os.ExpandEnv twice, would re-open the traversal attack surface this
// guard closes.  The effective traversal defence is the Lstat walk + O_NOFOLLOW
// handle (steps 4–6); the residual-".." reject (step 2) is an early sanity
// check, not the sole barrier.
func secureAndVerify(raw string) (string, error) {
	// Step 1: single-pass $VAR expansion (SEC-08).
	// SECURITY REQUIREMENT: os.ExpandEnv — never os.Expand with a recursive
	// mapping, never double-expansion (os.ExpandEnv(os.ExpandEnv(s))).
	expanded := os.ExpandEnv(raw)

	// Expand a leading "~" to the home directory (single-pass, not recursive).
	expanded, err := expandHome(expanded)
	if err != nil {
		return "", fmt.Errorf("home expansion: %w", err)
	}

	// Step 2: normalize and reject residual "..".
	normalized := filepath.Clean(expanded)
	if containsDotDotSegment(normalized) {
		return "", fmt.Errorf("path contains residual '..' after normalization: %q", normalized)
	}

	// Step 3: must be absolute.
	if !filepath.IsAbs(normalized) {
		return "", fmt.Errorf("data-home must be an absolute path, got: %q", normalized)
	}

	// Step 4: per-component Lstat walk on the PRE-resolution path (SEC-01).
	// This rejects symlinks, reparse points, and non-current-user ancestors
	// BEFORE EvalSymlinks is called.  A post-resolve Lstat would be dead code
	// because EvalSymlinks produces a path with no symlink components.
	if err := lstatWalkPreResolution(normalized); err != nil {
		return "", fmt.Errorf("SEC-01 pre-resolution path check: %w", err)
	}

	// Step 5: derive the canonical path to open.
	// EvalSymlinks is used ONLY here — it derives the real path, it is NOT the
	// security check (that was step 4).  For a clean path that passed the Lstat
	// walk, canonical == normalized.
	var canonical string
	if fi, statErr := os.Lstat(normalized); statErr == nil && fi.IsDir() {
		// Directory exists — resolve to canonical form.
		canonical, err = filepath.EvalSymlinks(normalized)
		if err != nil {
			return "", fmt.Errorf("cannot resolve canonical path %q: %w", normalized, err)
		}
	} else {
		// Directory does not exist yet — canonical = normalized (will be created).
		canonical = normalized
	}

	// Steps 6 & 7: platform-specific create/verify with O_NOFOLLOW + fchmod.
	if err := createAndSecureDir(canonical); err != nil {
		return "", err
	}

	return canonical, nil
}

// expandHome replaces a leading "~" with the current user's home directory.
// The expansion is single-pass: "~" is substituted once, not re-expanded.
func expandHome(p string) (string, error) {
	if !strings.HasPrefix(p, "~") {
		return p, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot expand '~': %w", err)
	}
	if p == "~" {
		return home, nil
	}
	// Accept "~/" or "~\" (Windows).
	rest := p[1:]
	if len(rest) > 0 && (rest[0] == '/' || rest[0] == '\\') {
		return filepath.Join(home, rest[1:]), nil
	}
	// "~something" without separator: not a home-relative path.
	return p, nil
}

// containsDotDotSegment reports whether any component of the cleaned path is
// still "..".  filepath.Clean already collapses resolvable ".." segments; this
// catches leading ".." that Clean cannot resolve (e.g. "../../etc/passwd").
func containsDotDotSegment(p string) bool {
	vol := filepath.VolumeName(p)
	rest := p[len(vol):]
	for _, seg := range strings.Split(rest, string(filepath.Separator)) {
		if seg == ".." {
			return true
		}
	}
	return false
}
