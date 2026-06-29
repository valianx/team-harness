package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// claudeCodeTeamHarnessConfigPath returns the path to the Claude Code
// team-harness config file: ~/.claude/.team-harness.json
// (%USERPROFILE%\.claude\.team-harness.json on Windows).
// Uses os.UserHomeDir for cross-platform home-directory resolution.
func claudeCodeTeamHarnessConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude", manifestFilename), nil
}

// importCandidate carries the allowlisted keys read from a detected
// .team-harness.json during migration source detection (CC config or
// opencode-owned re-run). After the trim, only logs-mode is read —
// the removed settings (language, english_learning, clickup, obsidian_tasks)
// are never imported into a new config (AC-7).
type importCandidate struct {
	logsMode string
}

// buildImportCandidate reads the surviving allowlisted key from a raw JSON map.
// MCP URL and secrets are NOT in .team-harness.json and are never read here.
// The removed fields (language, english_learning, clickup, obsidian_tasks) are
// intentionally not extracted — they must not appear in the written config (AC-7).
func buildImportCandidate(m map[string]json.RawMessage) *importCandidate {
	return &importCandidate{
		logsMode: extractStringFromRaw(m, "logs-mode"),
	}
}

// hasControlChar reports whether s contains any character in [\x00-\x1f\x7f].
// This mirrors CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/ from session-start.ts
// (SEC-DR-A). Single definition reused for logs-path and clickup.workspace_id
// validation in applyImportCandidate (SEC-004).
func hasControlChar(s string) bool {
	for _, r := range s {
		if r <= 0x1f || r == 0x7f {
			return true
		}
	}
	return false
}

// isValidISOLang reports whether s is a valid ISO 639-1 two-letter language
// code (exactly 2 lowercase ASCII letters). Mirrors LANG_RE = /^[a-z]{2}$/.
func isValidISOLang(s string) bool {
	if len(s) != 2 {
		return false
	}
	return s[0] >= 'a' && s[0] <= 'z' && s[1] >= 'a' && s[1] <= 'z'
}

// opencodeSettingsConfigPath returns the path to the team-harness config file
// under the opencode config root: <root>/.team-harness.json.
func opencodeSettingsConfigPath(configRoot string) string {
	return filepath.Join(configRoot, manifestFilename)
}

// allowlistedOpencodeKeys is the set of keys in .team-harness.json that the
// opencode interactive install is permitted to write. Keys outside this set
// that already exist in the file are preserved byte-for-byte (CLAUDE.md §5
// single-config-file merge rule). Installer-managed keys are tracked
// separately and are always set by the installer — they are never trusted
// from the existing file (SEC-OC-R4 mass-assignment defense).
//
// The trimmed installer no longer writes language, english_learning, clickup, or
// obsidian_tasks — those keys are excluded from the allowlist (AC-7).
var allowlistedOpencodeKeys = map[string]bool{
	"logs-mode": true,
}

// installerManagedKeys are always overwritten by the installer regardless of
// what the existing file contains (SEC-OC-R4). A forged value from an
// existing config is never accepted for these fields.
var installerManagedKeys = map[string]bool{
	"format_version":    true,
	"installed_version": true,
	"updated_at":        true,
}

// writeOpencodeTeamHarnessConfig performs an ALLOWLISTED read-merge-write of
// .team-harness.json at path.
//
// Contract:
//   - Load existing JSON at path (empty map if absent or unreadable).
//   - Overlay ONLY the keys in allowlistedOpencodeKeys that cfg sets (skip
//     absent optional values such as an empty Language or ClickUpWorkspaceID).
//   - ALWAYS set installer-managed keys (format_version, installed_version,
//     updated_at) from the installer itself — never from the existing file
//     (SEC-OC-R4 mass-assignment defense).
//   - Preserve all other keys byte-for-byte (unknown operator keys survive).
//   - Write the result through the hardened opencodePlacer write path using
//     the placer's ConfigRoot() as the security anchor (SEC-OC-R2).
//
// A timestamped backup of the existing file is created before each write.
func writeOpencodeTeamHarnessConfig(path string, cfg opencodeSetupValues, placer *opencodePlacer) error {
	// Read existing JSON — silently start fresh if absent.
	existing, readErr := os.ReadFile(path)
	raw := map[string]json.RawMessage{}
	if readErr == nil && len(existing) > 0 {
		if err := json.Unmarshal(existing, &raw); err != nil {
			// Corrupt file — start fresh.
			raw = map[string]json.RawMessage{}
		}
	}

	// Remove installer-managed keys from the existing map so we always
	// overwrite them (SEC-OC-R4 mass-assignment defense).
	for k := range installerManagedKeys {
		delete(raw, k)
	}

	// Apply logs-mode — always "local" after the trim (work-logs group removed).
	// Clear any pre-existing obsidian-specific keys when present in the file.
	raw["logs-mode"] = mustMarshalJSON("local")
	delete(raw, "logs-path")
	delete(raw, "logs-subfolder")

	// Set installer-managed keys — always from the installer, never from the
	// existing file (SEC-OC-R4).
	raw["format_version"] = mustMarshalJSON("1")
	raw["installed_version"] = mustMarshalJSON(version)
	raw["updated_at"] = mustMarshalJSON(time.Now().UTC().Format(time.RFC3339))

	// Backup before write — routes through the hardened write path for
	// O_NOFOLLOW + lstat-walk containment (fix(sec): SEC-001).
	if len(existing) > 0 && readErr == nil {
		ts := time.Now().UTC().Format("20060102-150405")
		bakPath := path + ".bak-" + ts
		_ = hardenedWriteFile(existing, bakPath, placer.ConfigRoot(), false)
	}

	// Serialize and write through the hardened placer path (SEC-OC-R2).
	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal .team-harness.json: %w", err)
	}
	out = append(out, '\n')

	if err := hardenedWriteFile(out, path, placer.ConfigRoot(), false); err != nil {
		return fmt.Errorf("write .team-harness.json: %w", err)
	}
	return nil
}

// refreshManagedConfigKeys performs a managed-key-only update of the
// .team-harness.json at path. Unlike writeOpencodeTeamHarnessConfig it does
// NOT touch operator-controlled keys (logs-mode, logs-path, logs-subfolder, or
// any unknown key). It overwrites ONLY the three installer-managed keys:
// format_version, installed_version, updated_at — preserving everything else
// byte-for-byte (SEC-OC-R4 / AC-5 contract).
//
// A timestamped backup of the existing file is written before each change
// through the hardened placer path (SEC-OC-R2 / SEC-01..08 reused).
func refreshManagedConfigKeys(path string, placer *opencodePlacer) error {
	// Read existing JSON — silently start fresh if absent (first-time update
	// after a pre-managed-key install).
	existing, readErr := os.ReadFile(path)
	raw := map[string]json.RawMessage{}
	if readErr == nil && len(existing) > 0 {
		if err := json.Unmarshal(existing, &raw); err != nil {
			// Corrupt file — start fresh (only managed keys will be written).
			raw = map[string]json.RawMessage{}
		}
	}

	// Remove installer-managed keys from the map so we always overwrite them
	// (SEC-OC-R4 mass-assignment defense — same pattern as
	// writeOpencodeTeamHarnessConfig). All other keys are preserved unchanged.
	for k := range installerManagedKeys {
		delete(raw, k)
	}

	// Set installer-managed keys from the binary — never from the existing file.
	raw["format_version"] = mustMarshalJSON("1")
	raw["installed_version"] = mustMarshalJSON(version)
	raw["updated_at"] = mustMarshalJSON(time.Now().UTC().Format(time.RFC3339))

	// Backup before write — routes through the hardened write path.
	if len(existing) > 0 && readErr == nil {
		ts := time.Now().UTC().Format("20060102-150405")
		bakPath := path + ".bak-" + ts
		_ = hardenedWriteFile(existing, bakPath, placer.ConfigRoot(), false)
	}

	// Serialize and write through the hardened placer path (SEC-OC-R2).
	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal .team-harness.json: %w", err)
	}
	out = append(out, '\n')

	if err := hardenedWriteFile(out, path, placer.ConfigRoot(), false); err != nil {
		return fmt.Errorf("write .team-harness.json: %w", err)
	}
	return nil
}

// detectExistingConfig reads and parses the .team-harness.json at path.
// Returns the raw map when the file exists and is valid JSON. Returns nil
// when the file is absent or unreadable (the normal opencode-only case).
func detectExistingConfig(path string) map[string]json.RawMessage {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	if len(data) == 0 {
		return nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(data, &m); err != nil {
		return nil
	}
	return m
}

// mustMarshalJSON marshals v to JSON. Panics on marshaling failure (only
// reachable with non-marshallable types, which cannot occur here).
func mustMarshalJSON(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("mustMarshalJSON: %v", err))
	}
	return json.RawMessage(b)
}

// extractStringFromRaw extracts a string value from a raw JSON map by key.
// Returns "" when the key is absent or the value is not a string.
func extractStringFromRaw(m map[string]json.RawMessage, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	var s string
	if err := json.Unmarshal(v, &s); err != nil {
		return ""
	}
	return s
}

// extractBoolFromRaw extracts a bool value from a raw JSON map by key.
// Returns false when the key is absent or the value is not a bool.
func extractBoolFromRaw(m map[string]json.RawMessage, key string) bool {
	v, ok := m[key]
	if !ok {
		return false
	}
	var b bool
	if err := json.Unmarshal(v, &b); err != nil {
		return false
	}
	return b
}

