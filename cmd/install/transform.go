package main

import (
	"bytes"
	"fmt"
	"sort"
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

// aliasToConcreteModel maps the three CC bare alias names to their current
// concrete opencode model ids. Pinned at release time from models.dev;
// installed configs stay fresh via the on-demand /th:update-models runtime path.
// Map content must stay byte-identical to ALIAS_TO_CONCRETE_MODEL in migrate.mjs.
var aliasToConcreteModel = map[string]string{
	"opus":   "claude-opus-4-6",
	"sonnet": "claude-sonnet-4-6",
	"haiku":  "claude-haiku-4-5",
}

// ---------------------------------------------------------------------------
// Per-provider cost tiering (opt-in, additive — issue #424)
// ---------------------------------------------------------------------------
//
// The model-less baseline above is the default for every opencode install.
// When the operator opts into tiering for a provider (--opencode-tier /
// opencode.cost_tier_provider), the transform instead BAKES a concrete
// provider/model-id derived from each agent's CC source tier. This section is
// the Go half of a three-site invariant: providerTierFamily and
// providerTierConcrete must stay byte-identical to PROVIDER_TIER_FAMILY /
// PROVIDER_TIER_CONCRETE in tools/harness-migrate/migrate.mjs and to the
// embedded copy in skills/update-models/SKILL.md (locked by a structural
// parity test — see tier_test.go).

// ccModelAliasToTier maps a CC agent's source model: alias to its cost tier
// label. The tier label set (default/medium/low) is provider-agnostic; a
// provider's curated family map below resolves a tier label to a concrete
// model family.
var ccModelAliasToTier = map[string]string{
	"opus":   "default",
	"sonnet": "medium",
	"haiku":  "low",
}

// tierOrder is the cost ordering from most to least expensive. Used by the
// ragged-tier fallback (AC-3): a provider generation that does not expose a
// given tier resolves to the nearest CHEAPER neighbor, never a previous
// generation's more expensive tier.
var tierOrder = []string{"default", "medium", "low"}

// providerTierFamily is the curated, ragged provider→tier→model-family map.
// A provider entry may omit a tier when its current generation does not
// expose one; resolveFamilyForTier applies the nearest-cheaper-neighbor
// fallback. Anthropic is the only launch provider (#424 scope).
var providerTierFamily = map[string]map[string]string{
	"anthropic": {
		"default": "claude-opus",
		"medium":  "claude-sonnet",
		"low":     "claude-haiku",
	},
}

// providerTierConcrete is the release-time pin: provider→tier→concrete model
// id. Used by the installer to bake a model: line without a network call;
// /th:update-models resolves the live equivalent post-install.
var providerTierConcrete = map[string]map[string]string{
	"anthropic": {
		"default": "claude-opus-4-6",
		"medium":  "claude-sonnet-4-6",
		"low":     "claude-haiku-4-5",
	},
}

// resolveFamilyForTier resolves the model family for (provider, tier),
// applying the nearest-cheaper-neighbor fallback when the provider's curated
// map omits that tier (AC-3). Returns ok=false when the provider is unknown
// or has no entry at or below the requested tier.
func resolveFamilyForTier(provider, tier string) (string, bool) {
	return resolveTierMap(providerTierFamily, provider, tier)
}

// resolveConcreteForTier resolves the pinned concrete model id for
// (provider, tier), applying the same nearest-cheaper-neighbor fallback as
// resolveFamilyForTier so the family and concrete-id results stay aligned.
func resolveConcreteForTier(provider, tier string) (string, bool) {
	return resolveTierMap(providerTierConcrete, provider, tier)
}

// resolveTierMap walks tierOrder from tier downward (cheaper) until it finds
// a populated entry in tiers[provider]. When no cheaper tier is populated
// either, it falls back to the nearest MORE expensive tier as a last resort
// — this is the "worst case one model serves all tiers" guarantee (AC-3): a
// provider with only its most expensive tier curated still serves every tier
// request rather than leaving medium/low unresolved. Shared by
// resolveFamilyForTier and resolveConcreteForTier so both stay aligned on the
// same fallback rule.
func resolveTierMap(tiers map[string]map[string]string, provider, tier string) (string, bool) {
	byTier, ok := tiers[provider]
	if !ok {
		return "", false
	}
	startIdx := -1
	for i, t := range tierOrder {
		if t == tier {
			startIdx = i
			break
		}
	}
	if startIdx < 0 {
		return "", false
	}
	// Prefer the nearest cheaper neighbor (toward the end of tierOrder).
	for i := startIdx; i < len(tierOrder); i++ {
		if v, ok := byTier[tierOrder[i]]; ok {
			return v, true
		}
	}
	// No cheaper option exists — fall back to the nearest more expensive tier.
	for i := startIdx - 1; i >= 0; i-- {
		if v, ok := byTier[tierOrder[i]]; ok {
			return v, true
		}
	}
	return "", false
}

// resolveTieredModel resolves the provider-prefixed concrete model id to bake
// for an agent whose CC source model: value is sourceModelAlias (e.g. "opus").
// Returns ok=false when the source alias is unrecognized (e.g. the agent
// omits model: or already carries a concrete id) — callers fall back to the
// model-less baseline output in that case.
func resolveTieredModel(provider, sourceModelAlias string) (string, bool) {
	canonical := strings.TrimPrefix(sourceModelAlias, anthropicPrefix)
	tier, ok := ccModelAliasToTier[canonical]
	if !ok {
		return "", false
	}
	concrete, ok := resolveConcreteForTier(provider, tier)
	if !ok {
		return "", false
	}
	return provider + "/" + concrete, true
}

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
		// model: intentionally NOT emitted. opencode agents are model-less so the
		// whole harness follows the operator's runtime /model pick on ANY provider
		// (primary inherits the global model; subagents inherit the invoking primary).
		// This avoids provider lock-in and ProviderModelNotFoundError from baked ids.
		// Per-provider cost tiering is a future additive step (see
		// docs/opencode-model-config.md); toProviderPrefixedModel is retained for it.
		// tools: → permission object {key: "allow"} with mapped lowercase opencode keys.
		// MCP tools and unrecognized tokens are dropped. Write+Edit deduplicate to "edit".
		toolsStr := ""
		if v, ok := fm["tools"]; ok {
			toolsStr = fmt.Sprintf("%v", v)
		}
		projected["permission"] = agentToolsToOpencodePermission(toolsStr)
		// mode: blanket "subagent" for the GENERIC transform (fixture-bound).
		// The mode-by-role installer layer (lider → primary) is applied
		// as a post-projection step in manifest_registry.go, NOT here, to keep
		// the parity fixture in lockstep with migrate.mjs.
		projected["mode"] = "subagent"
		// color: map CC color names → opencode named enums; pass through valid values.
		// Unknown colors are dropped (omitted) to avoid emitting an invalid field.
		if v, ok := fm["color"]; ok {
			if mapped, ok := ccColorToOpencode(fmt.Sprintf("%v", v)); ok {
				projected["color"] = mapped
			}
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
		// model: intentionally NOT emitted (model-less; see the agent-surface note above).
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

// transformToOpencodeTiered applies the generic, fixture-bound
// transformToOpencode AND bakes a concrete model: line for provider, derived
// from the agent's CC source model: tier. Used only when the operator has
// opted into per-provider cost tiering (provider non-empty) — the model-less
// default path (transformToOpencode) is untouched by this function (AC-5).
//
// kind values other than TransformKindAgent (commands, skills, hooks) are not
// tiered — opencode commands/skills/hooks carry no model: field — so this
// function returns the generic transform output unchanged for those kinds.
func transformToOpencodeTiered(src []byte, kind, provider string) ([]byte, error) {
	transformed, err := transformToOpencode(src, kind)
	if err != nil {
		return nil, err
	}
	if kind != TransformKindAgent {
		return transformed, nil
	}

	fm, _, err := parseFrontmatterYAML(src)
	if err != nil {
		return nil, &TransformError{Reason: fmt.Sprintf("parse frontmatter: %v", err)}
	}
	sourceModel, _ := fm["model"].(string)
	concrete, ok := resolveTieredModel(provider, sourceModel)
	if !ok {
		// No tier mapping for this agent's source model (omitted, or already a
		// concrete id) — fall back to the model-less baseline output.
		return transformed, nil
	}

	return insertModelLine(transformed, concrete), nil
}

// insertModelLine inserts a "model: <id>" line immediately before the
// "permission:" line of an already-projected agent frontmatter block.
//
// A textual insertion is used (instead of a parse/modify/reserialize
// round-trip) because re-parsing transformed already lost the orderedPermission
// type that preserves the source tools: order — a generic
// map[string]interface{} round-trip would re-emit permission keys sorted
// alphabetically instead of in source order. The agent projection always
// emits a permission: line (even {} for an empty tools list), so this anchor
// is reliable for every TransformKindAgent output.
func insertModelLine(transformed []byte, concrete string) []byte {
	marker := []byte("\npermission:")
	idx := bytes.Index(transformed, marker)
	if idx < 0 {
		// No permission: line found (should not happen for agent kind) — leave
		// output unchanged rather than risk corrupting it.
		return transformed
	}
	out := make([]byte, 0, len(transformed)+len(concrete)+8)
	out = append(out, transformed[:idx]...)
	out = append(out, []byte("\nmodel: "+concrete)...)
	out = append(out, transformed[idx:]...)
	return out
}

// applyModeByRole applies the installer-specific mode-by-role override:
// the lider agent (the top-level coordinator) receives mode: primary; all
// others — including orquestador, the task-scoped execution engine — remain
// subagent. This is layered ON TOP of the generic transform output and is NOT
// part of the transform-conformance.json fixture (which binds only the generic
// mapping).
func applyModeByRole(src []byte, agentName string) ([]byte, error) {
	if agentName != "lider" {
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
	// Strip any existing prefix to get the canonical bare form.
	canonical := bare
	if strings.HasPrefix(bare, anthropicPrefix) {
		canonical = bare[len(anthropicPrefix):]
	}
	// Resolve bare alias to concrete model id; pass concrete ids through unchanged.
	if concrete, ok := aliasToConcreteModel[canonical]; ok {
		return anthropicPrefix + concrete
	}
	return anthropicPrefix + canonical
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

// ccToolToOpencodePermKey maps a CC tool name to its opencode permission key.
// Returns the mapped key and ok=true when the tool has a valid mapping.
// MCP tools (mcp__*) and unrecognized tokens return ("", false) and are dropped.
// Write and NotebookEdit both map to "edit" — callers must dedup the result set.
func ccToolToOpencodePermKey(cc string) (string, bool) {
	switch cc {
	case "Read":
		return "read", true
	case "Edit":
		return "edit", true
	case "Write":
		return "edit", true
	case "NotebookEdit":
		return "edit", true
	case "Bash":
		return "bash", true
	case "Glob":
		return "glob", true
	case "Grep":
		return "grep", true
	case "Task":
		return "task", true
	case "WebFetch":
		return "webfetch", true
	case "WebSearch":
		return "websearch", true
	default:
		// MCP tools (mcp__*) and any future unknown tool name are dropped.
		return "", false
	}
}

// ccColorToOpencode maps a CC color name to an opencode named enum.
// Already-valid opencode enum values and hex colors pass through unchanged.
// Unknown values are dropped (return "", false) — safer than emitting an invalid color.
func ccColorToOpencode(cc string) (string, bool) {
	// Pass through already-valid opencode enum values.
	switch cc {
	case "primary", "secondary", "accent", "success", "warning", "error", "info":
		return cc, true
	}
	// Pass through valid hex colors (#rrggbb, case-insensitive).
	if len(cc) == 7 && cc[0] == '#' {
		allHex := true
		for _, c := range cc[1:] {
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
				allHex = false
				break
			}
		}
		if allHex {
			return cc, true
		}
	}
	// Map CC color names → opencode named enums.
	switch cc {
	case "green":
		return "success", true
	case "red":
		return "error", true
	case "yellow", "orange":
		return "warning", true
	case "cyan", "blue", "teal":
		return "info", true
	case "purple", "magenta", "pink":
		return "accent", true
	default:
		// Unknown color — drop to avoid emitting an invalid value.
		return "", false
	}
}

// orderedPermission holds a PermissionRuleConfig (key→"allow") with
// deterministic key order preserved from the source tools: field.
type orderedPermission struct {
	keys   []string
	values map[string]string
}

// agentToolsToOpencodePermission converts a CC tools comma-string to an
// ordered opencode permission object of the form {key: "allow"}.
// Write+Edit collapse to a single "edit" key (dedup preserving first occurrence).
// MCP tools and unrecognized tokens are silently dropped.
func agentToolsToOpencodePermission(toolsStr string) orderedPermission {
	perm := orderedPermission{values: map[string]string{}}
	for _, raw := range strings.Split(toolsStr, ",") {
		token := strings.TrimSpace(raw)
		if token == "" {
			continue
		}
		key, ok := ccToolToOpencodePermKey(token)
		if !ok {
			continue
		}
		if _, exists := perm.values[key]; !exists {
			perm.values[key] = "allow"
			perm.keys = append(perm.keys, key)
		}
	}
	return perm
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
	// Sort for deterministic output — Go map iteration is random.
	var remaining []string
	for k := range fm {
		if !written[k] {
			remaining = append(remaining, k)
		}
	}
	sort.Strings(remaining)
	for _, k := range remaining {
		writeYAMLKeyValue(&buf, k, fm[k])
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
	case orderedPermission:
		// Agent permission object: emit as a YAML flow mapping {key: value, ...}.
		// Flow form is valid YAML, round-trips through our parser, and is byte-stable
		// across the applyModeByRole re-serialization pass (block form would require
		// parser support for nested block mappings, which parseFrontmatterYAML lacks).
		buf.WriteString(key + ": {")
		for i, k := range v.keys {
			if i > 0 {
				buf.WriteString(", ")
			}
			buf.WriteString(k + ": " + v.values[k])
		}
		buf.WriteString("}\n")
	case map[string]interface{}:
		// Detect opencode-format permission objects (keys like read/edit/bash) vs
		// command-format permission objects (has "allow" key with an array value).
		// Opencode permission → block form; command permission → flow form.
		if key == "permission" && !isCommandPermissionMap(v) {
			writeFlowPermissionMap(buf, key, v)
		} else {
			buf.WriteString(key + ": ")
			writeFlowMapping(buf, v)
			buf.WriteString("\n")
		}
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

// isCommandPermissionMap returns true when m is a command-surface permission object
// (has an "allow" key), as opposed to an opencode agent permission object (keys
// like read, edit, bash whose values are the string "allow").
func isCommandPermissionMap(m map[string]interface{}) bool {
	_, hasAllow := m["allow"]
	return hasAllow
}

// writeFlowPermissionMap emits an opencode agent permission object as a YAML
// flow mapping {key: value, ...}. Keys are emitted in sorted order for
// deterministic output across applyModeByRole round-trips.
// An empty map emits {}.
func writeFlowPermissionMap(buf *bytes.Buffer, key string, m map[string]interface{}) {
	buf.WriteString(key + ": {")
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for i, k := range keys {
		if i > 0 {
			buf.WriteString(", ")
		}
		buf.WriteString(k + ": " + fmt.Sprintf("%v", m[k]))
	}
	buf.WriteString("}\n")
}

// writeFlowMapping serializes a map as a YAML flow mapping {k: v, ...}.
// For the "permission" object, the canonical key order is allow, ask, deny.
// Remaining keys are emitted in sorted order for deterministic output.
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
	// Remaining keys in sorted order for deterministic output.
	var remaining []string
	for k := range m {
		if !written[k] {
			remaining = append(remaining, k)
		}
	}
	sort.Strings(remaining)
	for _, k := range remaining {
		if !first {
			buf.WriteString(", ")
		}
		first = false
		buf.WriteString(k + ": ")
		writeFlowValue(buf, m[k])
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
