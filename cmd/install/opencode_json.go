package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// registerOpencodeMCP merges mcp.memory and mcp.context7 into the opencode.json
// at docPath using the {env:VAR} secret model (SEC-DR-1).
//
// Secret model (default):
//   - mcp.memory.headers.Authorization = "{env:MEMORY_MCP_BEARER}"
//   - mcp.context7.headers.CONTEXT7_API_KEY = "{env:CONTEXT7_API_KEY}"
//
// No literal secret is written. opencode resolves the env var at runtime.
//
// Preservation contract (mirrors claude_json.go):
//   - Operator-set top-level keys are preserved byte-for-byte.
//   - Operator mcp.<other> servers are preserved.
//   - Headers are merged key-by-key (operator custom headers survive).
//   - An operator-set enabled:false on mcp.memory / mcp.context7 is preserved
//     (a re-apply does NOT silently re-enable a deliberately-disabled server,
//     SEC-DR-6).
//   - Write is skipped entirely when desired ⊆ existing (idempotent, no backup).
func registerOpencodeMCP(memURL, context7URL, docPath string) error {
	// Read the whole file as a map of raw JSON values.
	raw := map[string]json.RawMessage{}
	existing, err := os.ReadFile(docPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read opencode.json %q: %w", docPath, err)
	}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &raw); err != nil {
			return fmt.Errorf("parse opencode.json %q: %w", docPath, err)
		}
	}

	// Extract (or initialise) the mcp sub-object.
	mcpRaw := map[string]json.RawMessage{}
	if v, ok := raw["mcp"]; ok {
		_ = json.Unmarshal(v, &mcpRaw)
	}

	// Build desired entries.
	newMemory := buildOpencodeMemoryEntry(memURL)
	newContext7 := buildOpencodeContext7Entry(context7URL)

	// Detect whether anything would change.
	memChanged := newMemory != nil && !opencodeEntryMatches(mcpRaw["memory"], newMemory)
	ctx7Changed := !opencodeEntryMatches(mcpRaw["context7"], newContext7)

	if !memChanged && !ctx7Changed {
		return nil // nothing to do — already up-to-date
	}

	// Backup before write (0o600 — contains config adjacent to secrets).
	if len(existing) > 0 {
		ts := time.Now().UTC().Format("20060102-150405")
		bakPath := docPath + ".bak-" + ts
		if err := os.WriteFile(bakPath, existing, 0o600); err != nil {
			return fmt.Errorf("create backup %q: %w", bakPath, err)
		}
	}

	if memChanged && newMemory != nil {
		merged := opencodeMergeEntry(mcpRaw["memory"], newMemory)
		encoded, _ := json.Marshal(merged)
		mcpRaw["memory"] = json.RawMessage(encoded)
	}
	if ctx7Changed {
		merged := opencodeMergeEntry(mcpRaw["context7"], newContext7)
		encoded, _ := json.Marshal(merged)
		mcpRaw["context7"] = json.RawMessage(encoded)
	}

	encodedMCP, _ := json.Marshal(mcpRaw)
	raw["mcp"] = json.RawMessage(encodedMCP)

	out, _ := json.MarshalIndent(raw, "", "  ")
	out = append(out, '\n')

	ensureDir(filepath.Dir(docPath))
	if err := os.WriteFile(docPath, out, 0o644); err != nil {
		return fmt.Errorf("write opencode.json %q: %w", docPath, err)
	}
	return nil
}

// buildOpencodeMemoryEntry returns the desired mcp.memory entry.
// URL is written literally (not a secret). Bearer is written as the {env:VAR}
// reference that opencode resolves at runtime — no literal secret at rest.
func buildOpencodeMemoryEntry(url string) map[string]interface{} {
	if url == "" {
		return nil
	}
	return map[string]interface{}{
		"type": "remote",
		"url":  url,
		"headers": map[string]interface{}{
			// {env:MEMORY_MCP_BEARER} — opencode resolves at runtime (SEC-DR-1).
			"Authorization": "{env:MEMORY_MCP_BEARER}",
		},
		"enabled": true,
	}
}

// buildOpencodeContext7Entry returns the desired mcp.context7 entry.
// The API key is written as {env:CONTEXT7_API_KEY} (no literal secret).
func buildOpencodeContext7Entry(url string) map[string]interface{} {
	return map[string]interface{}{
		"type": "remote",
		"url":  url,
		"headers": map[string]interface{}{
			// {env:CONTEXT7_API_KEY} — opencode resolves at runtime (SEC-DR-1).
			"CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}",
		},
		"enabled": true,
	}
}

// opencodeEntryMatches reports whether the existing mcp entry already satisfies
// the desired one (desired ⊆ existing). Extra operator keys survive.
// SEC-DR-6: does NOT compare "enabled" when the existing entry declares it —
// an operator-set enabled:false must not be overwritten.
func opencodeEntryMatches(existing json.RawMessage, desired map[string]interface{}) bool {
	if existing == nil {
		return false
	}
	var existingMap map[string]interface{}
	if err := json.Unmarshal(existing, &existingMap); err != nil {
		return false
	}
	for k, v := range desired {
		if k == "enabled" {
			// SEC-DR-6: skip the enabled check — the operator's value takes priority.
			// If the operator set enabled:false, we do NOT re-enable on apply.
			if _, operatorSet := existingMap["enabled"]; operatorSet {
				continue
			}
		}
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

// opencodeMergeEntry returns a map that is the existing entry with desired
// keys overlaid. Operator-set fields not in desired are preserved.
// "headers" gets key-by-key overlay so operator custom headers survive.
// SEC-DR-6: "enabled" is only written when the existing entry does NOT
// already declare it (preserves operator-set enabled:false).
func opencodeMergeEntry(existing json.RawMessage, desired map[string]interface{}) map[string]interface{} {
	merged := map[string]interface{}{}
	if existing != nil {
		_ = json.Unmarshal(existing, &merged)
	}
	for k, v := range desired {
		if k == "enabled" {
			// SEC-DR-6: only inject "enabled" when the operator hasn't set it.
			if _, operatorSet := merged["enabled"]; operatorSet {
				continue
			}
		}
		if k == "headers" {
			merged["headers"] = opencodesMergeHeaders(merged["headers"], v)
			continue
		}
		merged[k] = v
	}
	return merged
}

// opencodesMergeHeaders overlays desired headers onto existing headers
// key-by-key (operator custom headers survive).
func opencodesMergeHeaders(existing, desired interface{}) map[string]interface{} {
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
