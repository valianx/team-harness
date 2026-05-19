package main

import (
	"encoding/json"
	"fmt"
	"os"
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
	raw := map[string]json.RawMessage{}
	if fileData, err := os.ReadFile(claudeJSON); err == nil {
		_ = json.Unmarshal(fileData, &raw)
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
		// would silently drop operator config — see issue valianx/claude-dev-team#15
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
	if err := os.WriteFile(claudeJSON, out, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "Error: could not write ~/.claude.json: %v\n", err)
		os.Exit(1)
	}
	return backup
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
// overlaid. Operator-set fields not in `desired` (notably `headers`) are
// preserved. If `existing` is nil/invalid, the result is just `desired`.
func mergeMCPEntry(existing json.RawMessage, desired map[string]interface{}) map[string]interface{} {
	merged := map[string]interface{}{}
	if existing != nil {
		_ = json.Unmarshal(existing, &merged)
	}
	for k, v := range desired {
		merged[k] = v
	}
	return merged
}

// buildMemoryEntry returns the mcpServers.memory dict: always http type.
func buildMemoryEntry(choice MemoryMCPChoice) map[string]interface{} {
	return map[string]interface{}{
		"type": "http",
		"url":  choice.URL,
	}
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
