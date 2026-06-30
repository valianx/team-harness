package main

import (
	"fmt"
	"path/filepath"
	"strings"
)

// Placer abstracts WHERE a component's files land, what {config_root} resolves
// to, and WHICH config document holds the ledger-owned configKeys.
//
// Phase 3 ships exactly ONE implementation: claudeCodePlacer, which maps
// {config_root} → ~/.claude and SettingsDocPath() → ~/.claude/.team-harness.json.
//
// The Phase-4 seam: a future runtime adapter implements this interface to
// place transformed assets under the target runtime's config root and to point
// SettingsDocPath at the runtime's settings document. NO Phase-4 placement
// code is written in Phase 3. The Phase-4 adapter satisfies:
//
//	Runtime()         → the target runtime identifier (e.g. "opencode")
//	ConfigRoot()      → the runtime's config root directory
//	Place(...)        → places transformed assets under the config root
//	SettingsDocPath() → the runtime's settings document path
//
// NOTE: SettingsDocPath() is the document that holds the ledger-owned
// configKeys (logs-mode, logs-path, logs-subfolder, clickup.workspace_id, …).
// It is the ONLY document uninstall rewrites to delete owned keys. For
// claude-code this is ~/.claude/.team-harness.json. This is NOT ~/.claude.json
// — operator-owned keys (MCP bearer, context7 API key) live in that document
// and are never touched by uninstall. See the two-config-file model in
// 01-plan.md § "The two-config-file model (C-1)".
type Placer interface {
	// Runtime identifies the target runtime. "claude-code" in Phase 3.
	Runtime() string

	// ConfigRoot returns the {config_root} expansion, e.g. ~/.claude for
	// claude-code. Templates in Emits.Files use this token.
	ConfigRoot() string

	// Place resolves the templated destination path, creates any required parent
	// directories, and writes src bytes to the concrete destination. It returns
	// the concrete destination path.
	Place(src []byte, templatedDest string, kind string) (concreteDest string, err error)

	// SettingsDocPath returns the absolute path of the settings document that
	// holds the ledger-owned configKeys. For claude-code this is
	// ~/.claude/.team-harness.json (manifestFilename joined with claudeDir).
	// Uninstall rewrites this document read-merge-write to delete owned keys.
	// ~/.claude.json is NEVER opened by uninstall.
	SettingsDocPath() string
}

// claudeCodePlacer is the Phase-3 proving target. It maps {config_root} to
// ~/.claude (claudeDir) and delegates file writes to writeBytesToDest.
type claudeCodePlacer struct {
	configRoot string // absolute path to ~/.claude (claudeDir)
}

// newClaudeCodePlacer creates a claudeCodePlacer backed by claudeDir.
func newClaudeCodePlacer() *claudeCodePlacer {
	return &claudeCodePlacer{configRoot: claudeDir}
}

// newClaudeCodePlacerAt creates a claudeCodePlacer with a custom configRoot.
// Used in tests to point the placer at a t.TempDir().
func newClaudeCodePlacerAt(configRoot string) *claudeCodePlacer {
	return &claudeCodePlacer{configRoot: configRoot}
}

func (p *claudeCodePlacer) Runtime() string { return "claude-code" }

func (p *claudeCodePlacer) ConfigRoot() string { return p.configRoot }

// Place resolves {config_root} → p.configRoot, creates parent directories,
// and writes src bytes to the resolved destination path.
func (p *claudeCodePlacer) Place(src []byte, templatedDest string, kind string) (string, error) {
	if !strings.HasPrefix(templatedDest, "{config_root}") {
		return "", fmt.Errorf("placer: destination %q must begin with {config_root}", templatedDest)
	}
	concreteDest := p.configRoot + templatedDest[len("{config_root}"):]
	concreteDest = filepath.FromSlash(concreteDest)

	executable := kind == "hook"
	if err := hardenedWriteFile(src, concreteDest, p.configRoot, executable); err != nil {
		return "", fmt.Errorf("placer: write to %q: %w", concreteDest, err)
	}
	return concreteDest, nil
}

// SettingsDocPath returns ~/.claude/.team-harness.json — the document holding
// ledger-owned configKeys. This is the same path as manifestPath() in
// manifest.go (claudeDir + manifestFilename), verified as the correct target
// for the two-config-file uninstall model.
func (p *claudeCodePlacer) SettingsDocPath() string {
	return filepath.Join(p.configRoot, manifestFilename)
}

// resolveTemplatedPath expands the {config_root} token in a templated path
// using the placer's ConfigRoot(). Returns the concrete filesystem path.
func resolveTemplatedPath(templated string, placer Placer) string {
	if strings.HasPrefix(templated, "{config_root}") {
		suffix := templated[len("{config_root}"):]
		return filepath.Join(placer.ConfigRoot(), filepath.FromSlash(suffix))
	}
	return templated
}
