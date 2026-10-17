package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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

// importCandidate describes the workspace preference in an existing config.
// The native reapply keeps the complete destination in the original document;
// the trimmed setup form does not import unrelated settings or credentials.
type importCandidate struct {
	workspace workspacePreference
}

func buildImportCandidate(m map[string]json.RawMessage) *importCandidate {
	return &importCandidate{
		workspace: selectWorkspacePreference(m),
	}
}

type workspacePreference struct {
	status       string
	mode         string
	selectedFrom string
	conflict     bool
	reasonCode   string
}

func selectWorkspacePreference(m map[string]json.RawMessage) workspacePreference {
	result := workspacePreference{status: "selected", mode: "local", selectedFrom: "default"}
	canonical, hasCanonical := m["workspace-mode"]
	legacy, hasLegacy := m["logs-mode"]
	if hasCanonical {
		result.selectedFrom = "workspace-mode"
		result.mode = extractStringFromRaw(m, "workspace-mode")
		if hasLegacy {
			var canonicalValue, legacyValue interface{}
			_ = json.Unmarshal(canonical, &canonicalValue)
			_ = json.Unmarshal(legacy, &legacyValue)
			result.conflict = !reflect.DeepEqual(canonicalValue, legacyValue)
		}
		if result.mode != "local" && result.mode != "obsidian" && result.mode != "gpt-space" {
			result.status = "invalid"
			result.mode = ""
			result.reasonCode = "invalid_workspace_mode"
			return result
		}
		if result.conflict {
			result.reasonCode = "selector_conflict"
		}
	} else if hasLegacy {
		result.selectedFrom = "logs-mode"
		result.mode = extractStringFromRaw(m, "logs-mode")
		if result.mode != "local" && result.mode != "obsidian" {
			result.status = "invalid"
			result.mode = ""
			result.reasonCode = "invalid_logs_mode"
		}
	}
	return result
}

func reportWorkspacePreference(m map[string]json.RawMessage) {
	preference := selectWorkspacePreference(m)
	if preference.status == "invalid" {
		fmt.Fprintf(os.Stderr, "workspace: %s: %s is invalid; preferences retained; use /th:setup to correct it\n", preference.reasonCode, preference.selectedFrom)
		return
	}
	var diagnoses []string
	if preference.conflict {
		diagnoses = append(diagnoses, "selector_conflict: workspace-mode and logs-mode disagree; canonical selection retained")
	}
	if destination := workspaceDestinationDiagnosis(m, preference.mode); destination != "" {
		diagnoses = append(diagnoses, destination)
	}
	if len(diagnoses) > 0 {
		fmt.Fprintf(os.Stderr, "workspace: %s; preferences retained; use /th:setup to correct them\n", strings.Join(diagnoses, "; "))
	}
}

func workspaceDestinationDiagnosis(m map[string]json.RawMessage, mode string) string {
	switch mode {
	case "gpt-space":
		_, hasSpace := m["workspace-space-id"]
		_, hasContainer := m["workspace-container-page-id"]
		if !hasSpace || !hasContainer {
			return "incomplete_space_destination: workspace-space-id and workspace-container-page-id are required"
		}
		for _, key := range []string{"workspace-space-id", "workspace-container-page-id"} {
			if !isWorkspaceOpaqueID(extractStringFromRaw(m, key)) {
				return "invalid_space_destination: workspace IDs must be opaque identifiers"
			}
		}
	case "obsidian":
		_, hasPath := m["logs-path"]
		_, hasSubfolder := m["logs-subfolder"]
		if !hasPath || !hasSubfolder {
			return "incomplete_obsidian_destination: logs-path and logs-subfolder are required"
		}
		if !validObsidianBasePath(extractStringFromRaw(m, "logs-path")) ||
			!validObsidianSubfolder(extractStringFromRaw(m, "logs-subfolder")) {
			return "invalid_obsidian_destination: logs-path must be an absolute non-root vault and logs-subfolder a safe relative path"
		}
	}
	return ""
}

func validObsidianBasePath(value string) bool {
	if !filepath.IsAbs(value) || hasControlChar(value) || strings.ContainsAny(value, "*?[]") {
		return false
	}
	parts := strings.FieldsFunc(value, func(char rune) bool {
		return char == '/' || filepath.Separator == '\\' && char == '\\'
	})
	for _, part := range parts {
		if part == ".." {
			return false
		}
	}
	cleaned := filepath.Clean(value)
	if filepath.Dir(cleaned) == cleaned {
		return false
	}
	if home, err := os.UserHomeDir(); err == nil {
		if relative, err := filepath.Rel(home, cleaned); err == nil && relative == "." {
			return false
		}
	}
	return true
}

func validObsidianSubfolder(value string) bool {
	if value == "" || len(value) > 1024 || hasControlChar(value) || strings.ContainsAny(value, `\*?[]{}`) {
		return false
	}
	if len(value) >= 2 && value[1] == ':' &&
		(value[0] >= 'a' && value[0] <= 'z' || value[0] >= 'A' && value[0] <= 'Z') {
		return false
	}
	for _, part := range strings.Split(value, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

func isWorkspaceOpaqueID(value string) bool {
	if len(value) == 0 || len(value) > 256 {
		return false
	}
	for i := 0; i < len(value); i++ {
		char := value[i]
		if char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' {
			continue
		}
		if i > 0 && (char == '_' || char == '-') {
			continue
		}
		return false
	}
	return true
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
//
// "opencode.cost_tier_provider" (#424) is the namespaced, opt-in per-provider
// cost-tiering selection: absent ⇒ model-less baseline; present ⇒ the
// provider whose curated tier map the transform bakes into agent files.
var allowlistedOpencodeKeys = map[string]bool{
	"workspace-mode":              true,
	"logs-mode":                   true,
	"opencode.cost_tier_provider": true,
}

// cfgDerivedKeysWritten enumerates the literal keys writeOpencodeTeamHarnessConfig
// writes from cfg-derived values. Kept in lockstep with allowlistedOpencodeKeys
// and checked by assertCfgDerivedKeysMatchAllowlist so the allowlist stays the
// actual source of truth rather than documentation that can silently drift.
var cfgDerivedKeysWritten = []string{"workspace-mode", "logs-mode", "opencode.cost_tier_provider"}

// assertCfgDerivedKeysMatchAllowlist panics when cfgDerivedKeysWritten and
// allowlistedOpencodeKeys diverge — a developer added or removed a
// cfg-derived key write without updating the allowlist this function's
// contract is documented against (writeOpencodeTeamHarnessConfig's doc
// comment). Fail fast: silently writing a key the allowlist doesn't expect
// (or vice versa) is exactly the mass-assignment risk this allowlist exists
// to prevent.
func assertCfgDerivedKeysMatchAllowlist() {
	if len(cfgDerivedKeysWritten) != len(allowlistedOpencodeKeys) {
		panic(fmt.Sprintf("writeOpencodeTeamHarnessConfig: writes %d cfg-derived keys but allowlistedOpencodeKeys has %d entries — keep them in sync", len(cfgDerivedKeysWritten), len(allowlistedOpencodeKeys)))
	}
	for _, k := range cfgDerivedKeysWritten {
		if !allowlistedOpencodeKeys[k] {
			panic(fmt.Sprintf("writeOpencodeTeamHarnessConfig: writes key %q which is not in allowlistedOpencodeKeys", k))
		}
	}
}

// installerManagedKeys are always overwritten by the installer regardless of
// what the existing file contains (SEC-OC-R4). A forged value from an
// existing config is never accepted for these fields.
var installerManagedKeys = map[string]bool{
	"format_version":    true,
	"installed_version": true,
	"updated_at":        true,
}

func validateTeamHarnessConfigFile(path string) error {
	data, err := readLeafNoFollow(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read .team-harness.json: %w", err)
	}
	_, err = parseTeamHarnessConfig(data)
	return err
}

func parseTeamHarnessConfig(data []byte) (map[string]json.RawMessage, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("existing .team-harness.json is corrupt (cannot parse): %w", err)
	}
	if raw == nil {
		return nil, fmt.Errorf("existing .team-harness.json is corrupt (expected a JSON object)")
	}
	return raw, nil
}

// writeOpencodeTeamHarnessConfig performs an ALLOWLISTED read-merge-write of
// .team-harness.json at path.
//
// Contract:
//   - Load an existing JSON object at path (empty map only if absent).
//   - Overlay only installer-owned keys that cfg sets. Existing workspace and
//     native preference values remain operator-owned and are preserved.
//   - ALWAYS set installer-managed keys (format_version, installed_version,
//     updated_at) from the installer itself — never from the existing file
//     (SEC-OC-R4 mass-assignment defense).
//   - Preserve all other keys byte-for-byte (unknown operator keys survive).
//   - Write the result through the hardened opencodePlacer write path using
//     the placer's ConfigRoot() as the security anchor (SEC-OC-R2).
//
// A timestamped backup of the existing file is created before each write.
func writeOpencodeTeamHarnessConfig(path string, cfg opencodeSetupValues, placer *opencodePlacer) error {
	assertCfgDerivedKeysMatchAllowlist()

	// Read existing JSON — start fresh only when absent.
	existing, readErr := readLeafNoFollow(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return fmt.Errorf("read .team-harness.json: %w", readErr)
	}
	raw := map[string]json.RawMessage{}
	if readErr == nil {
		raw, readErr = parseTeamHarnessConfig(existing)
		if readErr != nil {
			return readErr
		}
	}

	// Remove installer-managed keys from the existing map so we always
	// overwrite them (SEC-OC-R4 mass-assignment defense).
	for k := range installerManagedKeys {
		delete(raw, k)
	}

	preference := selectWorkspacePreference(raw)
	if preference.selectedFrom == "default" {
		mode := cfg.LogsMode
		if mode == "" {
			mode = "local"
		}
		if mode != "local" && mode != "obsidian" {
			return fmt.Errorf("invalid setup logs-mode: expected local or obsidian")
		}
		raw["workspace-mode"] = mustMarshalJSON(mode)
		raw["logs-mode"] = mustMarshalJSON(mode)
	}
	reportWorkspacePreference(raw)

	// Apply the per-provider cost-tiering selection (#424). cfg.CostTierProvider
	// already reflects the resolved precedence (flag > persisted > absent) —
	// write it verbatim; an empty selection clears any prior persisted value
	// so an explicit opt-out (re-run without --opencode-tier and without a
	// prior persisted key) stays absent, matching the baseline contract (AC-7).
	if cfg.CostTierProvider != "" {
		raw["opencode.cost_tier_provider"] = mustMarshalJSON(cfg.CostTierProvider)
	} else {
		delete(raw, "opencode.cost_tier_provider")
	}

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
		if err := hardenedWriteFileMode(existing, bakPath, placer.ConfigRoot(), 0o600); err != nil {
			return fmt.Errorf("backup .team-harness.json before write: %w", err)
		}
	}

	// Serialize and write through the hardened placer path (SEC-OC-R2).
	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal .team-harness.json: %w", err)
	}
	out = append(out, '\n')

	if err := hardenedAtomicWriteSecret(out, path, placer.ConfigRoot()); err != nil {
		return fmt.Errorf("write .team-harness.json: %w", err)
	}
	return nil
}

// refreshManagedConfigKeys performs a managed-key-only update of the
// .team-harness.json at path. Unlike writeOpencodeTeamHarnessConfig it does
// NOT touch operator-controlled keys (workspace mode, destination, or
// any unknown key). It overwrites ONLY the three installer-managed keys:
// format_version, installed_version, updated_at — preserving everything else
// byte-for-byte (SEC-OC-R4 / AC-5 contract).
//
// A timestamped backup of the existing file is written before each change
// through the hardened placer path (SEC-OC-R2 / SEC-01..08 reused).
func refreshManagedConfigKeys(path string, placer *opencodePlacer) error {
	// Read existing JSON — silently start fresh if absent (first-time update
	// after a pre-managed-key install).
	existing, readErr := readLeafNoFollow(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return fmt.Errorf("read .team-harness.json: %w", readErr)
	}
	raw := map[string]json.RawMessage{}
	if readErr == nil {
		raw, readErr = parseTeamHarnessConfig(existing)
		if readErr != nil {
			return readErr
		}
	}
	reportWorkspacePreference(raw)

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
	// fix(config): backup must succeed before the rewrite; if the backup write
	// fails there is no recovery copy, so abort rather than overwriting the
	// config without a safety net.
	if len(existing) > 0 && readErr == nil {
		ts := time.Now().UTC().Format("20060102-150405")
		bakPath := path + ".bak-" + ts
		if err := hardenedWriteFileMode(existing, bakPath, placer.ConfigRoot(), 0o600); err != nil {
			return fmt.Errorf("backup .team-harness.json before update: %w", err)
		}
	}

	// Serialize and write through the hardened placer path (SEC-OC-R2).
	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal .team-harness.json: %w", err)
	}
	out = append(out, '\n')

	if err := hardenedAtomicWriteSecret(out, path, placer.ConfigRoot()); err != nil {
		return fmt.Errorf("write .team-harness.json: %w", err)
	}
	return nil
}

// persistResolvedTierProvider writes the resolved per-provider cost-tiering
// selection (#424) into the opencode.cost_tier_provider key of
// .team-harness.json at path, preserving every other key byte-for-byte.
//
// This exists so `update --opencode-tier <newprovider>` persists the provider
// it just baked into the regenerated agent files. Without it, a later `update`
// run with no flag would resolve the STALE persisted provider (via
// resolveActiveTierProvider's fallback) and silently regenerate files back to
// the old provider.
//
// Deliberately separate from refreshManagedConfigKeys: that function's
// contract (format_version/installed_version/updated_at only — SEC-OC-R4 /
// AC-5) is unchanged for its other callers/keys; this function only ever
// touches the one tiering key. provider == "" clears any persisted value
// (matches the model-less baseline contract in writeOpencodeTeamHarnessConfig).
func persistResolvedTierProvider(path, provider string, placer *opencodePlacer) error {
	existing, readErr := readLeafNoFollow(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return fmt.Errorf("read .team-harness.json: %w", readErr)
	}
	raw := map[string]json.RawMessage{}
	if readErr == nil {
		raw, readErr = parseTeamHarnessConfig(existing)
		if readErr != nil {
			return readErr
		}
	}

	if provider != "" {
		raw["opencode.cost_tier_provider"] = mustMarshalJSON(provider)
	} else {
		delete(raw, "opencode.cost_tier_provider")
	}

	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal .team-harness.json: %w", err)
	}
	out = append(out, '\n')

	if err := hardenedAtomicWriteSecret(out, path, placer.ConfigRoot()); err != nil {
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
