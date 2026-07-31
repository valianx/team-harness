package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// codexPlacer installs managed Codex project or user configuration. Plugin
// installation remains marketplace-owned and is intentionally not emulated by
// copying files into the Codex config root.
type codexPlacer struct {
	configRoot string
}

func newCodexPlacer(scope, override string) (*codexPlacer, error) {
	root, err := codexConfigRoot(scope, override)
	if err != nil {
		return nil, err
	}
	return &codexPlacer{configRoot: root}, nil
}

func newCodexPlacerAt(root string) *codexPlacer { return &codexPlacer{configRoot: root} }
func (p *codexPlacer) Runtime() string          { return "codex" }
func (p *codexPlacer) ConfigRoot() string       { return p.configRoot }

func (p *codexPlacer) Place(src []byte, templatedDest string, kind string) (string, error) {
	if !strings.HasPrefix(templatedDest, "{config_root}") {
		return "", fmt.Errorf("codex placer: destination %q must begin with {config_root}", templatedDest)
	}
	dest := filepath.FromSlash(p.configRoot + templatedDest[len("{config_root}"):])
	if err := hardenedWriteFile(src, dest, p.configRoot, kind == "hook"); err != nil {
		return "", fmt.Errorf("codex placer: write to %q: %w", dest, err)
	}
	return dest, nil
}

func (p *codexPlacer) SettingsDocPath() string {
	return filepath.Join(p.configRoot, manifestFilename)
}

func codexConfigRoot(scope, override string) (string, error) {
	var raw string
	switch {
	case override != "":
		raw = override
	case scope == "project":
		cwd, err := os.Getwd()
		if err != nil {
			return "", fmt.Errorf("codex config root: cannot get cwd: %w", err)
		}
		raw = filepath.Join(cwd, ".codex")
	case scope == "global":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("codex global config: cannot determine home: %w", err)
		}
		raw = filepath.Join(home, ".codex")
	default:
		return "", fmt.Errorf("codex config root: unsupported scope %q (want global|project)", scope)
	}
	// Reuse the hardened absolute/no-symlink validation shared with opencode,
	// then apply the Codex-specific blast-radius guard. An explicit
	// --codex-dir must identify a config directory, never an entire filesystem
	// or volume root where a manifest mistake could fan out across the machine.
	return validateCodexConfigRootPath(raw)
}

func validateCodexConfigRootPath(raw string) (string, error) {
	normalized, err := validateOpencodeConfigRootPath(raw)
	if err != nil {
		return "", err
	}
	if isFilesystemRoot(normalized) {
		return "", fmt.Errorf("codex config root must not be a filesystem or volume root: %q", normalized)
	}
	return normalized, nil
}

// isFilesystemRoot handles POSIX '/', Windows drive roots (C:\\), and UNC
// share roots on platforms where filepath.VolumeName recognizes them. The
// filepath.Dir equality check is intentionally retained for volume roots:
// unlike a string-prefix test it follows the host platform's path semantics.
func isFilesystemRoot(path string) bool {
	clean := filepath.Clean(path)
	return filepath.Dir(clean) == clean
}
