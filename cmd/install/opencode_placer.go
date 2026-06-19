package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// opencodePlacer implements the Placer interface for the opencode runtime.
// It maps {config_root} to the opencode config root directory and routes
// file writes through the hardened write path (SEC-DR-3).
type opencodePlacer struct {
	configRoot string // absolute path to the opencode config root
}

// newOpencodePlacer creates an opencodePlacer with the resolved config root.
// scope must be "global" or "project". override may be "" (uses scope),
// a path from OPENCODE_CONFIG_DIR, or the --opencode-dir flag value.
func newOpencodePlacer(scope, override string) (*opencodePlacer, error) {
	root, err := opencodeConfigRoot(scope, override)
	if err != nil {
		return nil, err
	}
	return &opencodePlacer{configRoot: root}, nil
}

// newOpencodePlacerAt creates an opencodePlacer at an explicit root.
// Used in tests to point the placer at a t.TempDir().
func newOpencodePlacerAt(configRoot string) *opencodePlacer {
	return &opencodePlacer{configRoot: configRoot}
}

func (p *opencodePlacer) Runtime() string    { return "opencode" }
func (p *opencodePlacer) ConfigRoot() string { return p.configRoot }

// Place resolves the {config_root} token, then writes src to the concrete
// destination using the hardened write path (per-component Lstat reject,
// per-segment mkdir, O_NOFOLLOW leaf on POSIX — SEC-DR-3).
func (p *opencodePlacer) Place(src []byte, templatedDest string, kind string) (string, error) {
	if !strings.HasPrefix(templatedDest, "{config_root}") {
		return "", fmt.Errorf("opencode placer: destination %q must begin with {config_root}", templatedDest)
	}
	concreteDest := p.configRoot + templatedDest[len("{config_root}"):]
	concreteDest = filepath.FromSlash(concreteDest)

	executable := kind == "hook"
	if err := hardenedWriteFile(src, concreteDest, p.configRoot, executable); err != nil {
		return "", fmt.Errorf("opencode placer: write to %q: %w", concreteDest, err)
	}
	return concreteDest, nil
}

// SettingsDocPath returns the opencode.json path (the document holding
// ledger-owned mcp.* config keys for this runtime).
func (p *opencodePlacer) SettingsDocPath() string {
	return filepath.Join(p.configRoot, "opencode.json")
}

// ---------------------------------------------------------------------------
// opencodeConfigRoot: per-OS config-root resolver
// ---------------------------------------------------------------------------

// opencodeConfigRoot resolves the opencode configuration root directory.
//
// Resolution order:
//  1. override — from OPENCODE_CONFIG_DIR env var or --opencode-dir flag.
//  2. scope == "project" — <cwd>/.opencode
//  3. scope == "global" — OS-specific opencode global config dir:
//     Windows:      %APPDATA%\opencode
//     Linux/macOS:  $XDG_CONFIG_HOME/opencode (else ~/.config/opencode)
//
// The resolved path is validated (absolute, no "..", no symlinks).
func opencodeConfigRoot(scope, override string) (string, error) {
	var raw string

	switch {
	case override != "":
		raw = override

	case scope == "project":
		cwd, err := os.Getwd()
		if err != nil {
			return "", fmt.Errorf("opencode config root: cannot get cwd: %w", err)
		}
		raw = filepath.Join(cwd, ".opencode")

	default: // "global"
		var err error
		raw, err = opencodeGlobalConfigDir()
		if err != nil {
			return "", err
		}
	}

	return validateOpencodeConfigRootPath(raw)
}

// opencodeGlobalConfigDir returns the OS-specific global opencode config
// directory (before security validation).
//
//   - Windows:       %APPDATA%\opencode     (NOT %LOCALAPPDATA% — opencode convention)
//   - Linux / macOS: $XDG_CONFIG_HOME/opencode (else ~/.config/opencode)
func opencodeGlobalConfigDir() (string, error) {
	switch runtime.GOOS {
	case "windows":
		appdata := strings.TrimSpace(os.Getenv("APPDATA"))
		if appdata == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", fmt.Errorf("opencode global config: cannot determine APPDATA or home: %w", err)
			}
			// Fallback: APPDATA is typically %USERPROFILE%\AppData\Roaming
			appdata = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appdata, "opencode"), nil

	default: // linux, darwin, etc.
		if xdg := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); xdg != "" && filepath.IsAbs(xdg) {
			return filepath.Join(xdg, "opencode"), nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("opencode global config: cannot determine home directory: %w", err)
		}
		return filepath.Join(home, ".config", "opencode"), nil
	}
}

// validateOpencodeConfigRootPath applies path security checks to a raw
// opencode config root candidate:
//   - expand "~"
//   - clean and reject residual ".."
//   - require absolute
//   - apply containsDotDotSegment guard
//   - run lstatWalkPreResolution (rejects symlinks / reparse points)
func validateOpencodeConfigRootPath(raw string) (string, error) {
	// Expand environment variables (single-pass, SEC-08).
	expanded := os.ExpandEnv(raw)

	// Expand leading "~".
	expanded, err := expandHome(expanded)
	if err != nil {
		return "", fmt.Errorf("opencode config root home expansion: %w", err)
	}

	// Clean and reject residual "..".
	normalized := filepath.Clean(expanded)
	if containsDotDotSegment(normalized) {
		return "", fmt.Errorf("opencode config root contains residual '..' after normalization: %q", normalized)
	}

	// Must be absolute.
	if !filepath.IsAbs(normalized) {
		return "", fmt.Errorf("opencode config root must be absolute, got: %q", normalized)
	}

	// Per-component lstat walk — reject symlinks / reparse points (SEC-DR-3).
	// Note: unlike the data-home resolver, we do NOT apply the ownership check
	// or the exact-0700-mode check here. The opencode config root is a standard
	// user config directory (0755 is normal for ~/.config/opencode); those checks
	// would regress on CI and shared machines (SEC-DR-3-R2).
	if err := lstatWalkNoOwnershipCheck(normalized); err != nil {
		return "", fmt.Errorf("opencode config root SEC-DR-3 check: %w", err)
	}

	return normalized, nil
}

// lstatWalkNoOwnershipCheck walks every ancestor of path (root → leaf),
// rejecting symlinks and reparse points (CWE-59), but NOT checking ownership.
// This is the safe layer from SEC-DR-3-R2: transplant only the symlink/reparse
// rejection, NOT the data-home's current-user-ownership or exact-0700-mode
// checks (which would regress the legitimate claude-code path on CI).
func lstatWalkNoOwnershipCheck(normalized string) error {
	vol := filepath.VolumeName(normalized)
	rest := normalized[len(vol):]

	var acc string
	if vol != "" {
		acc = vol + string(filepath.Separator)
	} else {
		acc = string(filepath.Separator)
	}

	segments := splitSegmentsPath(rest)
	for _, seg := range segments {
		if seg == "" {
			continue
		}
		acc = filepath.Join(acc, seg)
		fi, err := os.Lstat(acc)
		if err != nil {
			if os.IsNotExist(err) {
				// Component does not exist yet — nothing more to check.
				break
			}
			return fmt.Errorf("lstat %q: %w", acc, err)
		}
		// Reject symlinks (SEC-DR-3).
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("path component %q is a symbolic link — refusing (SEC-DR-3)", acc)
		}
		// On Windows, os.Lstat reports reparse points as symlinks in modern Go.
		// The Windows datahome_windows.go hasReparsePoint uses GetFileAttributes
		// for belt-and-suspenders; here lstat's ModeSymlink covers the common case.
	}
	return nil
}

// splitSegmentsPath splits a path string by the OS separator, similar to
// datahome_unix.go:splitSegments but using filepath.Separator for portability.
func splitSegmentsPath(p string) []string {
	var segs []string
	start := 0
	for i := 0; i <= len(p); i++ {
		if i == len(p) || p[i] == '/' || p[i] == '\\' {
			if i > start {
				segs = append(segs, p[start:i])
			}
			start = i + 1
		}
	}
	return segs
}
