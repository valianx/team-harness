package main

import (
	"bytes"
	"fmt"
	"strings"
)

// pollutionKeys are prototype-pollution keys rejected at every object level
// (recursive, SEC-DR-4). Go maps have no prototype chain; this is a parity
// guard and defense-in-depth so the Go transform output never contains them.
var pollutionKeys = map[string]bool{
	"__proto__":   true,
	"constructor": true,
	"prototype":   true,
}

// anthropicPrefix is the provider prefix prepended to bare model names.
const anthropicPrefix = "anthropic/"

// TransformKind identifies the surface a transform applies to.
const (
	TransformKindAgent   = "agent"
	TransformKindCommand = "command"
	TransformKindOther   = ""
)

// TransformError is returned when a source file fails the security gates
// (injection or pollution) or cannot be parsed. The component is failed-closed.
type TransformError struct {
	Reason string
}

func (e *TransformError) Error() string { return e.Reason }

// identityTransform returns src unchanged. Used by the claude-code runtime
// (which does NOT apply the opencode frontmatter transform).
func identityTransform(src []byte, _ string) ([]byte, error) { return src, nil }

// transformToOpencode applies the CC→opencode frontmatter transform to src.
// kind must be "agent", "command", or "" (identity for skill/hook).
//
// Security gates (fail-closed):
//   - injection-form rejection over body, top-level string values,
//     array-item strings, and nested object values (recursive, SEC-DR-4)
//   - prototype-pollution key rejection over every object level (recursive)
//
// Named-key allowlist projection only (no spread/merge of parsed frontmatter).
// Returns transformed bytes, or a *TransformError if the source is rejected.
func transformToOpencode(src []byte, kind string) ([]byte, error) {
	if kind != TransformKindAgent && kind != TransformKindCommand {
		// skills, hooks → identity
		return src, nil
	}

	fm, body, err := parseFrontmatterYAML(src)
	if err != nil {
		return nil, &TransformError{Reason: fmt.Sprintf("parse frontmatter: %v", err)}
	}

	// SEC-DR-4: reject pollution keys recursively before doing anything else.
	if err := rejectPollutionKeysRecursive(fm); err != nil {
		return nil, &TransformError{Reason: err.Error()}
	}

	// SEC-DR-4: reject injection forms in body and frontmatter values (recursive).
	if err := assertNoInjection(fm, body); err != nil {
		return nil, &TransformError{Reason: err.Error()}
	}

	projected := map[string]interface{}{}

	if kind == TransformKindAgent {
		if v, ok := fm["name"]; ok {
			projected["name"] = v
		}
		if v, ok := fm["description"]; ok {
			projected["description"] = v
		}
		if v, ok := fm["model"]; ok {
			projected["model"] = toProviderPrefixedModel(fmt.Sprintf("%v", v))
		}
		// tools: → permission (comma-separated string)
		toolsStr := ""
		if v, ok := fm["tools"]; ok {
			toolsStr = fmt.Sprintf("%v", v)
		}
		projected["permission"] = map[string]interface{}{
			"allow": agentToolsToPermissionAllow(toolsStr),
			"ask":   []string{},
			"deny":  []string{},
		}
		// mode: blanket "subagent" for the GENERIC transform (fixture-bound).
		// The mode-by-role installer layer (orchestrator → primary) is applied
		// as a post-projection step in manifest_registry.go, NOT here, to keep
		// the parity fixture in lockstep with migrate.mjs.
		projected["mode"] = "subagent"
		if v, ok := fm["color"]; ok {
			projected["color"] = v
		}
		// effort: NOT carried forward (S-4) — opencode has no effort field.
		// th-origin marker
		projected["th-origin"] = "opencode"
	} else {
		// command surface
		if v, ok := fm["name"]; ok {
			projected["name"] = v
		}
		if v, ok := fm["description"]; ok {
			projected["description"] = v
		}
		if v, ok := fm["model"]; ok {
			projected["model"] = toProviderPrefixedModel(fmt.Sprintf("%v", v))
		}
		// allowed-tools → permission.allow
		allowedTools := fm["allowed-tools"]
		allowArr := commandAllowedToolsToPermissionAllow(allowedTools)
		if len(allowArr) > 0 || allowedTools != nil {
			projected["permission"] = map[string]interface{}{
				"allow": allowArr,
				"ask":   []string{},
				"deny":  []string{},
			}
		}
		// argument-hint dropped (no opencode equivalent)
		if v, ok := fm["agent"]; ok {
			projected["agent"] = v
		}
		projected["th-origin"] = "opencode"
	}

	return serializeFrontmatterYAML(projected, body), nil
}

// applyModeByRole applies the installer-specific mode-by-role override:
// the orchestrator agent receives mode: primary; all others remain subagent.
// This is layered ON TOP of the generic transform output and is NOT part of
// the transform-conformance.json fixture (which binds only the generic mapping).
func applyModeByRole(src []byte, agentName string) ([]byte, error) {
	if agentName != "orchestrator" {
		// No change needed — generic transform already set mode: subagent.
		return src, nil
	}

	fm, body, err := parseFrontmatterYAML(src)
	if err != nil {
		return nil, fmt.Errorf("applyModeByRole parse: %v", err)
	}
	fm["mode"] = "primary"
	return serializeFrontmatterYAML(fm, body), nil
}

// ---------------------------------------------------------------------------
// Model and permission helpers (mirrors migrate.mjs)
// ---------------------------------------------------------------------------

func toProviderPrefixedModel(bare string) string {
	if bare == "" {
		return bare
	}
	if strings.HasPrefix(bare, anthropicPrefix) {
		return bare
	}
	return anthropicPrefix + bare
}

func agentToolsToPermissionAllow(toolsStr string) []string {
	if toolsStr == "" {
		return []string{}
	}
	parts := strings.Split(toolsStr, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func commandAllowedToolsToPermissionAllow(allowedTools interface{}) []string {
	if allowedTools == nil {
		return []string{}
	}
	switch v := allowedTools.(type) {
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			trimmed := strings.TrimSpace(fmt.Sprintf("%v", item))
			if trimmed != "" {
				out = append(out, trimmed)
			}
		}
		return out
	case string:
		if strings.Contains(v, ",") {
			return agentToolsToPermissionAllow(v)
		}
		// whitespace-separated
		parts := strings.Fields(v)
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if p != "" {
				out = append(out, p)
			}
		}
		return out
	default:
		return []string{}
	}
}

// ---------------------------------------------------------------------------
// Security gates (SEC-DR-4)
// ---------------------------------------------------------------------------

// rejectPollutionKeysRecursive rejects __proto__, constructor, prototype at
// every object level. Mirrors migrate.mjs rejectPollutionKeys, but RECURSIVE.
func rejectPollutionKeysRecursive(obj map[string]interface{}) error {
	for k, v := range obj {
		if pollutionKeys[k] {
			return &TransformError{Reason: fmt.Sprintf("prototype-pollution key detected in frontmatter: %q", k)}
		}
		// Recurse into nested objects.
		if nested, ok := v.(map[string]interface{}); ok {
			if err := rejectPollutionKeysRecursive(nested); err != nil {
				return err
			}
		}
	}
	return nil
}

// assertNoInjection checks both body and frontmatter values (recursive) for
// injection forms using byte-exact matches identical to migrate.mjs.
func assertNoInjection(fm map[string]interface{}, body string) error {
	if form := detectInjectionForm(body); form != "" {
		return &TransformError{Reason: fmt.Sprintf("shell-injection form detected in body: %s", form)}
	}
	return checkFrontmatterValuesForInjection(fm)
}

// detectInjectionForm checks a string for the two documented injection forms.
// Returns a non-empty description when found, empty string when clean.
// Byte-exact matches — NOT regex — to prevent regex-based divergence from
// migrate.mjs (lines 298–305).
func detectInjectionForm(text string) string {
	// (a) Inline form: bang immediately followed by backtick.
	if strings.Contains(text, "!\x60") {
		return "inline-injection (bang-backtick)"
	}
	// (b) Fenced form: three backticks followed by bang.
	if strings.Contains(text, "\x60\x60\x60!") {
		return "fenced-injection (triple-backtick-bang)"
	}
	return ""
}

// checkFrontmatterValuesForInjection recurses over obj checking every string
// value and every string item in arrays. Matches migrate.mjs:322-346.
func checkFrontmatterValuesForInjection(obj map[string]interface{}) error {
	for k, value := range obj {
		switch v := value.(type) {
		case string:
			if form := detectInjectionForm(v); form != "" {
				return &TransformError{
					Reason: fmt.Sprintf("shell-injection form detected in frontmatter key %q: %s", k, form),
				}
			}
		case []interface{}:
			for _, item := range v {
				if s, ok := item.(string); ok {
					if form := detectInjectionForm(s); form != "" {
						return &TransformError{
							Reason: fmt.Sprintf("shell-injection form detected in frontmatter array %q: %s", k, form),
						}
					}
				}
			}
		case map[string]interface{}:
			if err := checkFrontmatterValuesForInjection(v); err != nil {
				return err
			}
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter parser / serializer
// ---------------------------------------------------------------------------
// This is a purposefully small parser for the specific subset of YAML used in
// agent/command frontmatter:
//   - scalar strings (bare, single-quoted, double-quoted)
//   - integer / boolean scalars
//   - comma-separated strings (tools:)
//   - simple arrays (allowed-tools: [a, b] or - item form)
//   - nested objects (permission: {allow: [...], ask: [], deny: []})
//
// This does NOT attempt to be a general YAML parser. Fields not matching a
// known pattern are passed through as raw strings.

// parseFrontmatterYAML extracts the YAML frontmatter block from src.
// Returns the parsed key-value map, the body (everything after the closing ---),
// and any parse error.
func parseFrontmatterYAML(src []byte) (map[string]interface{}, string, error) {
	s := string(src)

	// Must start with a YAML fence.
	if !strings.HasPrefix(s, "---\n") && !strings.HasPrefix(s, "---\r\n") {
		// No frontmatter — treat as empty frontmatter + full body.
		return map[string]interface{}{}, s, nil
	}

	// Find the closing fence.
	var closeFence string
	var start int
	if strings.HasPrefix(s, "---\r\n") {
		start = 5
		closeFence = "\r\n---"
	} else {
		start = 4
		closeFence = "\n---"
	}

	rest := s[start:]
	closeIdx := strings.Index(rest, closeFence)
	if closeIdx < 0 {
		return nil, "", fmt.Errorf("unclosed YAML frontmatter (no closing ---)")
	}

	yamlBlock := rest[:closeIdx]
	afterClose := rest[closeIdx+len(closeFence):]

	// Skip the newline immediately after the closing fence.
	body := ""
	if strings.HasPrefix(afterClose, "\r\n") {
		body = afterClose[2:]
	} else if strings.HasPrefix(afterClose, "\n") {
		body = afterClose[1:]
	} else {
		body = afterClose
	}

	fm, err := parseYAMLBlock(yamlBlock)
	if err != nil {
		return nil, "", err
	}

	return fm, body, nil
}

// parseYAMLBlock parses a simple YAML mapping block (the content between ---
// fences). Handles:
//   - bare strings: key: value
//   - quoted strings: key: "value" or key: 'value'
//   - block sequences: key:\n  - item\n  - item
//   - flow sequences: key: [a, b, c]
//   - nested flow mappings: key: {k: v, k: v}
func parseYAMLBlock(block string) (map[string]interface{}, error) {
	result := map[string]interface{}{}
	lines := strings.Split(block, "\n")

	i := 0
	for i < len(lines) {
		line := lines[i]

		// Skip blank lines and YAML comments.
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			i++
			continue
		}

		// Check if this is a continuation of a block sequence (starts with spaces + '-').
		// Block sequences are consumed by the preceding key handler.
		if strings.HasPrefix(trimmed, "-") && !strings.Contains(trimmed, ":") {
			// Orphan dash — skip (shouldn't happen in well-formed frontmatter).
			i++
			continue
		}

		// Look for "key: value" pattern.
		colonIdx := strings.Index(line, ":")
		if colonIdx < 0 {
			i++
			continue
		}

		key := strings.TrimSpace(line[:colonIdx])
		rawValue := line[colonIdx+1:]

		// If the value portion (after trimming) is empty, look ahead for a
		// block sequence (lines starting with "  -").
		if strings.TrimSpace(rawValue) == "" {
			// Collect block sequence items.
			var items []interface{}
			for i+1 < len(lines) {
				nextTrimmed := strings.TrimSpace(lines[i+1])
				if strings.HasPrefix(nextTrimmed, "-") {
					item := strings.TrimSpace(strings.TrimPrefix(nextTrimmed, "-"))
					item = unquoteYAML(item)
					items = append(items, item)
					i++
				} else {
					break
				}
			}
			if items != nil {
				result[key] = items
			} else {
				result[key] = ""
			}
			i++
			continue
		}

		// Parse the value.
		value := strings.TrimSpace(rawValue)
		result[key] = parseYAMLValue(value)
		i++
	}

	return result, nil
}

// parseYAMLValue parses a scalar, flow sequence, or flow mapping from a YAML value string.
func parseYAMLValue(s string) interface{} {
	// Flow mapping: {key: val, key: val}
	if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
		inner := s[1 : len(s)-1]
		return parseFlowMapping(inner)
	}
	// Flow sequence: [a, b, c]
	if strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]") {
		inner := s[1 : len(s)-1]
		return parseFlowSequence(inner)
	}
	// Quoted string.
	return unquoteYAML(s)
}

// parseFlowMapping parses the interior of a YAML flow mapping: "k: v, k: v".
func parseFlowMapping(s string) map[string]interface{} {
	result := map[string]interface{}{}
	// Split by comma, but be aware of nested [] inside values.
	parts := splitFlowItems(s)
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		colonIdx := strings.Index(part, ":")
		if colonIdx < 0 {
			continue
		}
		k := strings.TrimSpace(part[:colonIdx])
		v := strings.TrimSpace(part[colonIdx+1:])
		result[k] = parseYAMLValue(v)
	}
	return result
}

// parseFlowSequence parses the interior of a YAML flow sequence: "a, b, c".
func parseFlowSequence(s string) []interface{} {
	if strings.TrimSpace(s) == "" {
		return []interface{}{}
	}
	parts := splitFlowItems(s)
	out := make([]interface{}, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, unquoteYAML(p))
	}
	return out
}

// splitFlowItems splits a comma-separated flow-sequence interior, respecting
// nested brackets so "allow: [a, b], ask: []" splits correctly.
func splitFlowItems(s string) []string {
	var parts []string
	depth := 0
	start := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '[', '{':
			depth++
		case ']', '}':
			depth--
		case ',':
			if depth == 0 {
				parts = append(parts, s[start:i])
				start = i + 1
			}
		}
	}
	parts = append(parts, s[start:])
	return parts
}

// unquoteYAML removes surrounding single or double quotes from a YAML value.
func unquoteYAML(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') ||
			(s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// serializeFrontmatterYAML serializes projected (ordered keys) + body back
// into a frontmatter document. Uses a deterministic key order that matches
// the output expected by the conformance fixture.
func serializeFrontmatterYAML(fm map[string]interface{}, body string) []byte {
	// Deterministic key order (matches migrate.mjs's named-key projection order).
	keyOrder := []string{
		"name", "description", "model", "permission", "mode",
		"color", "agent", "th-origin",
	}

	var buf bytes.Buffer
	buf.WriteString("---\n")

	written := map[string]bool{}
	for _, k := range keyOrder {
		v, ok := fm[k]
		if !ok {
			continue
		}
		writeYAMLKeyValue(&buf, k, v)
		written[k] = true
	}
	// Write any remaining keys not in the order list (e.g. custom fields).
	for k, v := range fm {
		if !written[k] {
			writeYAMLKeyValue(&buf, k, v)
		}
	}

	buf.WriteString("---\n")
	buf.WriteString(body)
	return buf.Bytes()
}

// writeYAMLKeyValue writes a single YAML key: value line or block.
func writeYAMLKeyValue(buf *bytes.Buffer, key string, value interface{}) {
	switch v := value.(type) {
	case string:
		buf.WriteString(key + ": " + v + "\n")
	case map[string]interface{}:
		// Inline flow mapping for "permission" objects.
		buf.WriteString(key + ": ")
		writeFlowMapping(buf, v)
		buf.WriteString("\n")
	case []interface{}:
		// Inline flow sequence.
		buf.WriteString(key + ": ")
		writeFlowSequence(buf, v)
		buf.WriteString("\n")
	case []string:
		buf.WriteString(key + ": ")
		writeFlowSequenceStrings(buf, v)
		buf.WriteString("\n")
	default:
		buf.WriteString(fmt.Sprintf("%s: %v\n", key, v))
	}
}

// writeFlowMapping serializes a map as a YAML flow mapping {k: v, ...}.
// For the "permission" object, the canonical key order is allow, ask, deny.
func writeFlowMapping(buf *bytes.Buffer, m map[string]interface{}) {
	buf.WriteString("{")
	keyOrder := []string{"allow", "ask", "deny"}
	written := map[string]bool{}
	first := true
	for _, k := range keyOrder {
		v, ok := m[k]
		if !ok {
			continue
		}
		if !first {
			buf.WriteString(", ")
		}
		first = false
		buf.WriteString(k + ": ")
		writeFlowValue(buf, v)
		written[k] = true
	}
	for k, v := range m {
		if written[k] {
			continue
		}
		if !first {
			buf.WriteString(", ")
		}
		first = false
		buf.WriteString(k + ": ")
		writeFlowValue(buf, v)
	}
	buf.WriteString("}")
}

// writeFlowValue writes a value as a flow-style YAML value.
func writeFlowValue(buf *bytes.Buffer, v interface{}) {
	switch val := v.(type) {
	case []interface{}:
		writeFlowSequence(buf, val)
	case []string:
		writeFlowSequenceStrings(buf, val)
	case string:
		buf.WriteString(val)
	default:
		buf.WriteString(fmt.Sprintf("%v", val))
	}
}

func writeFlowSequence(buf *bytes.Buffer, items []interface{}) {
	buf.WriteString("[")
	for i, item := range items {
		if i > 0 {
			buf.WriteString(", ")
		}
		buf.WriteString(fmt.Sprintf("%v", item))
	}
	buf.WriteString("]")
}

func writeFlowSequenceStrings(buf *bytes.Buffer, items []string) {
	buf.WriteString("[")
	for i, item := range items {
		if i > 0 {
			buf.WriteString(", ")
		}
		buf.WriteString(item)
	}
	buf.WriteString("]")
}
