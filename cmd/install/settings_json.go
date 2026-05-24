package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"runtime"
)

// settingsJSON is ~/.claude/settings.json (not ~/.claude.json).
var settingsJSON string

func resolveSettingsJSON() {
	home, _ := os.UserHomeDir()
	settingsJSON = home + "/.claude/settings.json"
}

// registerHooks reads the embedded hooks/config.json, selects the section for
// the current OS, and merges its hook entries into ~/.claude/settings.json.
//
// Merge semantics (per event type, e.g. PreToolUse, Notification):
//   - Each hook entry is identified by its "matcher" field.
//   - Installer-owned matchers are overlaid (replaced if already present).
//   - User-added matchers (not in the embedded config) are preserved.
//
// Non-hook keys in settings.json (e.g. "theme", "autoUpdatesChannel") are
// preserved byte-for-byte via json.RawMessage.
func registerHooks() {
	desired := desiredHooksForOS()
	if desired == nil {
		fmt.Println("  ~/.claude/settings.json: no hook config for this OS")
		return
	}

	raw := map[string]json.RawMessage{}
	if data, err := os.ReadFile(settingsJSON); err == nil {
		_ = json.Unmarshal(data, &raw)
	}

	var existingHooks map[string]json.RawMessage
	if v, ok := raw["hooks"]; ok {
		_ = json.Unmarshal(v, &existingHooks)
	}
	if existingHooks == nil {
		existingHooks = map[string]json.RawMessage{}
	}

	changed := false
	for eventType, desiredEntries := range desired {
		var existing []hookEntry
		if v, ok := existingHooks[eventType]; ok {
			_ = json.Unmarshal(v, &existing)
		}

		merged, didChange := mergeHookEntries(existing, desiredEntries)
		if didChange {
			encoded, _ := json.Marshal(merged)
			existingHooks[eventType] = json.RawMessage(encoded)
			changed = true
		}
	}

	if !changed {
		fmt.Println("  ~/.claude/settings.json: hooks already match desired state")
		return
	}

	encodedHooks, _ := json.Marshal(existingHooks)
	raw["hooks"] = json.RawMessage(encodedHooks)

	out, _ := json.MarshalIndent(raw, "", "  ")
	out = append(out, '\n')
	if err := os.WriteFile(settingsJSON, out, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot write ~/.claude/settings.json: %v\n", err)
		return
	}
	fmt.Println("  ~/.claude/settings.json: hooks updated")
}

// hookEntry matches the JSON shape of a single hook matcher block in settings.json.
type hookEntry struct {
	Matcher string            `json:"matcher"`
	Hooks   []json.RawMessage `json:"hooks"`
}

// mergeHookEntries merges desired entries into existing ones by matcher field.
// Returns the merged list and whether anything changed.
func mergeHookEntries(existing, desired []hookEntry) ([]hookEntry, bool) {
	byMatcher := map[string]int{}
	result := make([]hookEntry, len(existing))
	copy(result, existing)
	for i, e := range result {
		byMatcher[e.Matcher] = i
	}

	changed := false
	for _, d := range desired {
		if idx, ok := byMatcher[d.Matcher]; ok {
			if !hookEntryEquals(result[idx], d) {
				result[idx] = d
				changed = true
			}
		} else {
			result = append(result, d)
			byMatcher[d.Matcher] = len(result) - 1
			changed = true
		}
	}
	return result, changed
}

// hookEntryEquals compares two hookEntry values by JSON serialization.
func hookEntryEquals(a, b hookEntry) bool {
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	return string(ja) == string(jb)
}

// desiredHooksForOS reads the embedded hooks/config.json and returns the hooks
// map for the current OS. Returns nil if the OS is not found in the config.
func desiredHooksForOS() map[string][]hookEntry {
	osKey := map[string]string{
		"windows": "windows",
		"darwin":  "macos",
		"linux":   "linux",
	}[runtime.GOOS]
	if osKey == "" {
		return nil
	}

	data, err := fs.ReadFile(EmbeddedAssets(), "hooks/config.json")
	if err != nil {
		return nil
	}

	var config map[string]json.RawMessage
	if err := json.Unmarshal(data, &config); err != nil {
		return nil
	}

	osRaw, ok := config[osKey]
	if !ok {
		return nil
	}

	var osSection struct {
		Hooks map[string][]hookEntry `json:"hooks"`
	}
	if err := json.Unmarshal(osRaw, &osSection); err != nil {
		return nil
	}

	return osSection.Hooks
}
