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
func registerMCPServers(context7Key string, kg KGBackendChoice) string {
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

	newMemory := buildMemoryEntry(kg)
	var newContext7 map[string]interface{}
	if context7Key != "" {
		newContext7 = buildContext7Entry(context7Key)
	}

	// Detect whether anything would actually change.
	memoryChanged := newMemory != nil && !rawEntryMatches(mcpRaw["memory"], newMemory)
	memoryRemoved := kg.Skipped && mcpRaw["memory"] != nil
	context7Changed := newContext7 != nil && !rawEntryMatches(mcpRaw["context7"], newContext7)

	if !memoryChanged && !memoryRemoved && !context7Changed {
		fmt.Println("  ~/.claude.json: no changes needed (mcpServers already match desired state)")
		return ""
	}

	backup := backupClaudeJSON()

	if memoryChanged {
		encoded, _ := json.Marshal(newMemory)
		mcpRaw["memory"] = json.RawMessage(encoded)
	} else if memoryRemoved {
		delete(mcpRaw, "memory")
		warnMemorySkipped()
	}
	if context7Changed {
		encoded, _ := json.Marshal(newContext7)
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

// rawEntryMatches checks whether a json.RawMessage encodes the same value as
// the provided Go map (after a marshal/unmarshal round-trip for normalisation).
func rawEntryMatches(existing json.RawMessage, desired map[string]interface{}) bool {
	if existing == nil {
		return false
	}
	var existingMap map[string]interface{}
	if err := json.Unmarshal(existing, &existingMap); err != nil {
		return false
	}
	desiredBytes, _ := json.Marshal(desired)
	existingBytes, _ := json.Marshal(existingMap)
	return string(desiredBytes) == string(existingBytes)
}

// buildMemoryEntry returns the desired mcpServers.memory dict, or nil when the
// entry should be omitted (skipped backend).
func buildMemoryEntry(kg KGBackendChoice) map[string]interface{} {
	if kg.Skipped {
		return nil
	}
	if kg.Backend == "context-harness" && kg.URL != "" {
		return map[string]interface{}{
			"type": "http",
			"url":  kg.URL,
		}
	}
	// Default: memory (stdio ChromaDB)
	kgPath := filepath.Join(claudeDir, "knowledge-graph")
	return map[string]interface{}{
		"type":    "stdio",
		"command": "uv",
		"args":    []string{"run", "--directory", toSlash(kgPath), "python", "-m", "server"},
		"env":     map[string]interface{}{},
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

func warnMemorySkipped() {
	fmt.Println()
	fmt.Println("  [warn] No 'memory' MCP entry written. To complete setup later:")
	fmt.Println("    - Deploy context-harness-mcp (see https://github.com/valianx/context-harness-mcp)")
	fmt.Println("    - Re-run this installer, OR")
	fmt.Println(`    - Manually add to ~/.claude.json under mcpServers:`)
	fmt.Println(`      "memory": { "type": "http", "url": "https://<your-render-url>/mcp" }`)
}
