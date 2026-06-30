package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// readExistingMCPServers returns the current mcpServers block from ~/.claude.json,
// or an empty map if the file is absent or malformed.
func readExistingMCPServers() map[string]interface{} {
	data, err := os.ReadFile(claudeJSON)
	if err != nil {
		return map[string]interface{}{}
	}
	var top map[string]interface{}
	if jsonErr := json.Unmarshal(data, &top); jsonErr != nil {
		return map[string]interface{}{}
	}
	servers, ok := top["mcpServers"].(map[string]interface{})
	if !ok {
		return map[string]interface{}{}
	}
	return servers
}

// registerMCPServers merges mcpServers entries into ~/.claude.json, preserving
// all other keys byte-for-byte via json.RawMessage.
//
// It skips the write entirely when nothing would change, so idempotent runs
// produce zero backups and zero file modifications.
//
// Returns the backup path if a write occurred, or "" if the file was untouched.
func registerMCPServers(context7Key string, choice MemoryMCPChoice) string {
	// Read the whole file as a map of raw JSON values so unknown keys are preserved.
	// Abort on malformed JSON: proceeding with an empty map would silently drop
	// every operator key the file already contains.
	raw := map[string]json.RawMessage{}
	if fileData, err := os.ReadFile(claudeJSON); err == nil {
		if jsonErr := json.Unmarshal(fileData, &raw); jsonErr != nil {
			fmt.Fprintf(os.Stderr, "Error: existing ~/.claude.json is not valid JSON; refusing to rewrite — fix or remove it\n")
			os.Exit(1)
		}
	}

	// Extract (or initialise) the mcpServers sub-object.
	mcpRaw := map[string]json.RawMessage{}
	if v, ok := raw["mcpServers"]; ok {
		_ = json.Unmarshal(v, &mcpRaw)
	}

	newMemory := buildMemoryEntry(choice)
	var newContext7 map[string]interface{}
	if context7Key != "" {
		newContext7 = buildContext7Entry(context7Key)
	}

	// Detect whether anything would actually change.
	memoryChanged := newMemory != nil && !rawEntryMatches(mcpRaw["memory"], newMemory)
	context7Changed := newContext7 != nil && !rawEntryMatches(mcpRaw["context7"], newContext7)

	if !memoryChanged && !context7Changed {
		fmt.Println("  ~/.claude.json: no changes needed (mcpServers already match desired state)")
		return ""
	}

	backup := backupClaudeJSON()

	if memoryChanged {
		// Merge: preserve operator-set fields (e.g. `headers.Authorization` Bearer
		// for context-harness-mcp deployments behind auth), overlay only the
		// installer-owned fields (`type` + `url`). Replacing the entire entry
		// would silently drop operator config — see issue valianx/team-harness#15
		// regression notes.
		merged := mergeMCPEntry(mcpRaw["memory"], newMemory)
		encoded, _ := json.Marshal(merged)
		mcpRaw["memory"] = json.RawMessage(encoded)
	}
	if context7Changed {
		merged := mergeMCPEntry(mcpRaw["context7"], newContext7)
		encoded, _ := json.Marshal(merged)
		mcpRaw["context7"] = json.RawMessage(encoded)
	}

	// Write the updated mcpServers back into the top-level map.
	encodedMCP, _ := json.Marshal(mcpRaw)
	raw["mcpServers"] = json.RawMessage(encodedMCP)

	out, _ := json.MarshalIndent(raw, "", "  ")
	out = append(out, '\n')
	if err := writeAtomicSecret(claudeJSON, out); err != nil {
		fmt.Fprintf(os.Stderr, "Error: could not write ~/.claude.json: %v\n", err)
		os.Exit(1)
	}
	return backup
}

// writeAtomicSecret writes payload to path via a temp-file-then-rename for
// atomicity. The temp file is created at 0o600 (os.CreateTemp default) because
// the payload contains bearer tokens and API keys; the mode is preserved
// through the rename, so the live file is also 0o600 on POSIX.
func writeAtomicSecret(path string, payload []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".claude.json.tmp-*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(payload); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("write temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("close temp: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename to dest: %w", err)
	}
	return nil
}

// rawEntryMatches reports whether the existing mcpServers entry already
// satisfies every key in `desired`. Extra keys in `existing` (e.g. operator-set
// `headers.Authorization` Bearer tokens) are tolerated — they survive the install.
// This semantic ("desired ⊆ existing") replaces the previous byte-equality
// comparison, which falsely flagged operator-augmented entries as "changed"
// and triggered a destructive replace.
func rawEntryMatches(existing json.RawMessage, desired map[string]interface{}) bool {
	if existing == nil {
		return false
	}
	var existingMap map[string]interface{}
	if err := json.Unmarshal(existing, &existingMap); err != nil {
		return false
	}
	for k, v := range desired {
		ev, ok := existingMap[k]
		if !ok {
			return false
		}
		a, _ := json.Marshal(v)
		b, _ := json.Marshal(ev)
		if string(a) != string(b) {
			return false
		}
	}
	return true
}

// mergeMCPEntry returns a map that is the existing entry with `desired` keys
// overlaid. Operator-set fields not in `desired` are preserved.
//
// `headers` gets a nested overlay (key-by-key) so existing custom headers
// (e.g. `X-Custom`) survive when `desired` only sets `Authorization`. Without
// this, writing a new bearer would clobber any other operator-set header.
// If `existing` is nil/invalid, the result is just `desired`.
func mergeMCPEntry(existing json.RawMessage, desired map[string]interface{}) map[string]interface{} {
	merged := map[string]interface{}{}
	if existing != nil {
		_ = json.Unmarshal(existing, &merged)
	}
	for k, v := range desired {
		if k == "headers" {
			merged["headers"] = mergeHeaders(merged["headers"], v)
			continue
		}
		merged[k] = v
	}
	return merged
}

// mergeHeaders overlays `desired` headers onto `existing` headers (both
// optional). When one side is nil/invalid the other wins. Both sides are
// JSON map[string]interface{}.
func mergeHeaders(existing, desired interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	if m, ok := existing.(map[string]interface{}); ok {
		for k, v := range m {
			out[k] = v
		}
	}
	if m, ok := desired.(map[string]interface{}); ok {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

// buildMemoryEntry returns the mcpServers.memory dict: always http type.
// When choice.BearerToken is set, the entry includes
// `headers.Authorization: "Bearer <token>"`.
func buildMemoryEntry(choice MemoryMCPChoice) map[string]interface{} {
	entry := map[string]interface{}{
		"type": "http",
		"url":  choice.URL,
	}
	if choice.BearerToken != "" {
		entry["headers"] = map[string]interface{}{
			"Authorization": "Bearer " + choice.BearerToken,
		}
	}
	return entry
}

// buildContext7Entry returns the desired mcpServers.context7 dict for the given API key.
func buildContext7Entry(key string) map[string]interface{} {
	return map[string]interface{}{
		"type": "http",
		"url":  "https://mcp.context7.com/mcp",
		"headers": map[string]interface{}{
			"CONTEXT7_API_KEY": key,
		},
	}
}
