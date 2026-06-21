package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// MCPServerStatus describes what actually happened to one MCP server entry
// during a single registerOpencodeMCP call. The value is determined by
// comparing the desired entry against what was already in opencode.json.
type MCPServerStatus string

const (
	// MCPStatusAdded means the entry was absent and has been written this run.
	MCPStatusAdded MCPServerStatus = "registered"
	// MCPStatusUpdated means the entry was present but differed and has been rewritten.
	MCPStatusUpdated MCPServerStatus = "updated"
	// MCPStatusAlreadyConfigured means the entry was already present and unchanged — nothing was written.
	MCPStatusAlreadyConfigured MCPServerStatus = "already configured"
	// MCPStatusSkipped means no URL/source was provided so the entry was not touched.
	MCPStatusSkipped MCPServerStatus = "skipped"
)

// MCPRegisterOutcome carries the per-server real outcome of a registerOpencodeMCP
// call so that callers can display truthful per-run status in the summary.
type MCPRegisterOutcome struct {
	Memory   MCPServerStatus
	Context7 MCPServerStatus
}

// registerOpencodeMCP merges mcp.memory and mcp.context7 into the opencode.json
// at docPath. The default secret model writes {env:VAR} references (tokenModeEnvRef).
// When called with tokenModeLiteral + a non-empty opencodeMCPSecrets, the literal
// token values are written instead. tokenModeLiteral is reachable from two sites:
//   - the interactive token-import confirm (runTokenImportConfirm), AND
//   - the non-interactive CC→opencode migration path, gated on
//     ccMigration.hasLiteralTokens() (scoped relaxation of SEC-OC-R1,
//     operator-locked at STAGE-GATE-1; see dispatch.go:319-337).
//
// Secret model (default — tokenModeEnvRef):
//   - mcp.memory.headers.Authorization = "{env:MEMORY_MCP_BEARER}"
//   - mcp.context7.headers.CONTEXT7_API_KEY = "{env:CONTEXT7_API_KEY}"
//
// Secret model (literal — tokenModeLiteral):
//   - mcp.memory.headers.Authorization = "Bearer <secrets.MemoryBearer>"
//   - mcp.context7.headers.CONTEXT7_API_KEY = secrets.Context7Key
//
// Preservation contract (mirrors claude_json.go):
//   - Operator-set top-level keys are preserved byte-for-byte.
//   - Operator mcp.<other> servers are preserved.
//   - Headers are merged key-by-key (operator custom headers survive).
//   - An operator-set enabled:false on mcp.memory / mcp.context7 is preserved
//     (a re-apply does NOT silently re-enable a deliberately-disabled server,
//     SEC-DR-6).
//   - Write is skipped entirely when desired ⊆ existing (idempotent, no backup).
//
// Security: the file is ALWAYS written with mode 0o600 — unconditionally on both
// the env-ref and literal paths (AC-12 binding contract from the security assessment).
func registerOpencodeMCP(memURL, context7URL, docPath string, mode tokenMode, secrets opencodeMCPSecrets) (MCPRegisterOutcome, error) {
	outcome := MCPRegisterOutcome{
		Memory:   MCPStatusSkipped,
		Context7: MCPStatusSkipped,
	}

	// Read the whole file as a map of raw JSON values.
	raw := map[string]json.RawMessage{}
	existing, err := os.ReadFile(docPath)
	if err != nil && !os.IsNotExist(err) {
		return outcome, fmt.Errorf("read opencode.json %q: %w", docPath, err)
	}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &raw); err != nil {
			return outcome, fmt.Errorf("parse opencode.json %q: %w", docPath, err)
		}
	}

	// Extract (or initialise) the mcp sub-object.
	mcpRaw := map[string]json.RawMessage{}
	if v, ok := raw["mcp"]; ok {
		_ = json.Unmarshal(v, &mcpRaw)
	}

	// Build desired entries using the caller-supplied token mode. Either entry
	// may be nil when the caller passes an empty URL — the entry is not written.
	newMemory := buildOpencodeMemoryEntry(memURL, mode, secrets)
	newContext7 := buildOpencodeContext7Entry(context7URL, mode, secrets)

	// Determine per-server outcome: distinguish absent (skip) vs unchanged (already
	// configured) vs new/changed (added or updated).
	var memChanged, ctx7Changed bool
	if newMemory != nil {
		alreadyPresent := mcpRaw["memory"] != nil
		matches := opencodeEntryMatches(mcpRaw["memory"], newMemory)
		memChanged = !matches
		if matches {
			outcome.Memory = MCPStatusAlreadyConfigured
		} else if alreadyPresent {
			outcome.Memory = MCPStatusUpdated
		} else {
			outcome.Memory = MCPStatusAdded
		}
	}
	if newContext7 != nil {
		alreadyPresent := mcpRaw["context7"] != nil
		matches := opencodeEntryMatches(mcpRaw["context7"], newContext7)
		ctx7Changed = !matches
		if matches {
			outcome.Context7 = MCPStatusAlreadyConfigured
		} else if alreadyPresent {
			outcome.Context7 = MCPStatusUpdated
		} else {
			outcome.Context7 = MCPStatusAdded
		}
	}

	if !memChanged && !ctx7Changed {
		return outcome, nil // nothing to do — already up-to-date
	}

	// Backup before write (0o600 — contains config adjacent to secrets).
	if len(existing) > 0 {
		ts := time.Now().UTC().Format("20060102-150405")
		bakPath := docPath + ".bak-" + ts
		if err := os.WriteFile(bakPath, existing, 0o600); err != nil {
			return outcome, fmt.Errorf("create backup %q: %w", bakPath, err)
		}
	}

	if memChanged && newMemory != nil {
		merged := opencodeMergeEntry(mcpRaw["memory"], newMemory)
		encoded, _ := json.Marshal(merged)
		mcpRaw["memory"] = json.RawMessage(encoded)
	}
	if ctx7Changed && newContext7 != nil {
		merged := opencodeMergeEntry(mcpRaw["context7"], newContext7)
		encoded, _ := json.Marshal(merged)
		mcpRaw["context7"] = json.RawMessage(encoded)
	}

	encodedMCP, _ := json.Marshal(mcpRaw)
	raw["mcp"] = json.RawMessage(encodedMCP)

	out, _ := json.MarshalIndent(raw, "", "  ")
	out = append(out, '\n')

	ensureDir(filepath.Dir(docPath))
	// fix(sec): AC-12 — opencode.json is always written 0o600, unconditionally
	// on both the env-ref and literal paths. A literal secret in a 0o644 file
	// would be world-readable; 0o600 matches the backup write above.
	if err := os.WriteFile(docPath, out, 0o600); err != nil {
		return outcome, fmt.Errorf("write opencode.json %q: %w", docPath, err)
	}
	return outcome, nil
}

// buildOpencodeMemoryEntry returns the desired mcp.memory entry.
// URL is written literally (not a secret).
//
// On tokenModeEnvRef (default): Authorization = "{env:MEMORY_MCP_BEARER}".
// On tokenModeLiteral: Authorization = "Bearer <secrets.MemoryBearer>" —
// mirrors buildMemoryEntry in claude_json.go (AC-6 / plan patterns).
// Returns nil when url is empty.
func buildOpencodeMemoryEntry(url string, mode tokenMode, secrets opencodeMCPSecrets) map[string]interface{} {
	if url == "" {
		return nil
	}
	var authValue string
	if mode == tokenModeLiteral && secrets.MemoryBearer != "" {
		authValue = "Bearer " + secrets.MemoryBearer
	} else {
		// Default env-ref (SEC-DR-1 preserved for env-ref path).
		authValue = "{env:MEMORY_MCP_BEARER}"
	}
	return map[string]interface{}{
		"type": "remote",
		"url":  url,
		"headers": map[string]interface{}{
			"Authorization": authValue,
		},
		"enabled": true,
	}
}

// buildOpencodeContext7Entry returns the desired mcp.context7 entry.
// Returns nil when url is empty — the caller skips writing the entry.
//
// On tokenModeEnvRef (default): CONTEXT7_API_KEY = "{env:CONTEXT7_API_KEY}".
// On tokenModeLiteral: CONTEXT7_API_KEY = secrets.Context7Key —
// mirrors buildContext7Entry in claude_json.go (AC-6 / plan patterns).
func buildOpencodeContext7Entry(url string, mode tokenMode, secrets opencodeMCPSecrets) map[string]interface{} {
	if url == "" {
		return nil
	}
	var keyValue string
	if mode == tokenModeLiteral && secrets.Context7Key != "" {
		keyValue = secrets.Context7Key
	} else {
		// Default env-ref (SEC-DR-1 preserved for env-ref path).
		keyValue = "{env:CONTEXT7_API_KEY}"
	}
	return map[string]interface{}{
		"type": "remote",
		"url":  url,
		"headers": map[string]interface{}{
			"CONTEXT7_API_KEY": keyValue,
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
