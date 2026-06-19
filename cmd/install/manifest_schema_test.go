package main

import (
	"encoding/json"
	"os"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite: Manifest parse/validate (AC-1)
// ---------------------------------------------------------------------------

// wellFormedModule returns a valid ModuleManifest for testing.
func wellFormedModule() ModuleManifest {
	return ModuleManifest{
		SchemaVersion:  1,
		Module:         "core-agents",
		Description:    "Core agents",
		DefaultInstall: "always",
		Components:     []string{"orchestrator-agent"},
	}
}

// wellFormedComponent returns a valid ComponentManifest for testing.
// Source = "agents/orchestrator.md" which exists in the embedded FS.
func wellFormedComponent() ComponentManifest {
	return ComponentManifest{
		SchemaVersion:  1,
		Component:      "orchestrator-agent",
		Module:         "core-agents",
		Kind:           "agent",
		Source:         "agents/orchestrator.md",
		Cost:           "high",
		Stability:      "stable",
		DefaultInstall: true,
		Emits: OwnershipTags{
			Files:      []string{"{config_root}/agents/orchestrator.md"},
			ConfigKeys: []string{"logs-mode"},
		},
	}
}

// TestParseModuleManifest_WellFormed verifies that a valid module manifest
// round-trips through parse without error.
func TestParseModuleManifest_WellFormed(t *testing.T) {
	data, err := json.Marshal(wellFormedModule())
	if err != nil {
		t.Fatal(err)
	}
	got, err := parseModuleManifest(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Module != "core-agents" {
		t.Errorf("Module=%q, want core-agents", got.Module)
	}
}

// TestParseModuleManifest_UnknownField verifies that unknown fields are rejected
// (DisallowUnknownFields).
func TestParseModuleManifest_UnknownField(t *testing.T) {
	raw := `{"schemaVersion":1,"module":"m","description":"d","defaultInstall":"always","components":["c"],"unknownField":"oops"}`
	if _, err := parseModuleManifest([]byte(raw)); err == nil {
		t.Error("expected error for unknown field, got nil")
	}
}

// TestParseComponentManifest_UnknownField verifies strict parsing for components.
func TestParseComponentManifest_UnknownField(t *testing.T) {
	raw := `{"schemaVersion":1,"component":"c","module":"m","kind":"agent","source":"agents/orchestrator.md","cost":"low","stability":"stable","defaultInstall":false,"emits":{"files":[],"configKeys":[]},"extra":"oops"}`
	if _, err := parseComponentManifest([]byte(raw)); err == nil {
		t.Error("expected error for unknown field, got nil")
	}
}

// TestValidateManifests_SchemaVersionTwo verifies that schemaVersion:2 is refused.
func TestValidateManifests_SchemaVersionTwo(t *testing.T) {
	m := wellFormedModule()
	m.SchemaVersion = 2
	err := validateModuleManifest(m)
	if err == nil {
		t.Error("expected validation error for schemaVersion:2, got nil")
	}
}

// TestValidateManifests_ComponentSchemaVersionTwo verifies component schemaVersion:2 refusal.
func TestValidateManifests_ComponentSchemaVersionTwo(t *testing.T) {
	c := wellFormedComponent()
	c.SchemaVersion = 2
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected validation error for component schemaVersion:2, got nil")
	}
}

// TestValidateManifests_DanglingComponentRef verifies that a module referencing
// a non-existent component produces a validation error.
func TestValidateManifests_DanglingComponentRef(t *testing.T) {
	m := wellFormedModule()
	m.Components = []string{"missing-component"}
	// component manifest has orchestrator-agent, not missing-component
	c := wellFormedComponent()
	err := validateManifests([]ModuleManifest{m}, []ComponentManifest{c}, nil)
	if err == nil {
		t.Error("expected error for dangling component reference, got nil")
	}
}

// TestValidateManifests_OutOfEnumKind verifies that invalid kind is rejected.
func TestValidateManifests_OutOfEnumKind(t *testing.T) {
	c := wellFormedComponent()
	c.Kind = "widget" // not agent|skill|hook
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected error for invalid kind, got nil")
	}
}

// TestValidateManifests_OutOfEnumCost verifies that invalid cost is rejected.
func TestValidateManifests_OutOfEnumCost(t *testing.T) {
	c := wellFormedComponent()
	c.Cost = "extreme"
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected error for invalid cost, got nil")
	}
}

// TestValidateManifests_OutOfEnumStability verifies that invalid stability is rejected.
func TestValidateManifests_OutOfEnumStability(t *testing.T) {
	c := wellFormedComponent()
	c.Stability = "unknown"
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected error for invalid stability, got nil")
	}
}

// TestValidateManifests_EmitsFilesNonConfigRoot verifies SEC-05: file path
// that does not start with {config_root} is rejected.
func TestValidateManifests_EmitsFilesNonConfigRoot(t *testing.T) {
	c := wellFormedComponent()
	c.Emits.Files = []string{"/home/user/.claude/agents/orchestrator.md"} // absolute, no token
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected error for Emits.Files entry not starting with {config_root}, got nil")
	}
}

// TestValidateManifests_EmitsConfigKeyReservedNamespace verifies C-1: a component
// cannot own an mcpServers key.
func TestValidateManifests_EmitsConfigKeyReservedNamespace(t *testing.T) {
	c := wellFormedComponent()
	c.Emits.ConfigKeys = []string{"mcpServers.memory"}
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected error for reserved mcpServers configKey, got nil")
	}
}

// TestValidateManifests_EmitsConfigKeyStructuralPattern verifies SEC-05: a configKey
// with '=' is rejected by the structural pattern.
func TestValidateManifests_EmitsConfigKeyStructuralPattern(t *testing.T) {
	c := wellFormedComponent()
	c.Emits.ConfigKeys = []string{"my-key=somevalue"}
	moduleMap := map[string]ModuleManifest{"core-agents": wellFormedModule()}
	if err := validateComponentManifest(c, moduleMap, nil); err == nil {
		t.Error("expected error for configKey with '=', got nil")
	}
}

// TestValidateManifests_WellFormed verifies end-to-end validation succeeds for
// a well-formed module + component pair.
func TestValidateManifests_WellFormed(t *testing.T) {
	m := wellFormedModule()
	c := wellFormedComponent()
	// Pass nil FS to skip source-existence check (no embedded FS in this test context).
	if err := validateManifests([]ModuleManifest{m}, []ComponentManifest{c}, nil); err != nil {
		t.Errorf("unexpected validation error: %v", err)
	}
}

// TestValidateManifests_FromJSONFixtures loads the JSON fixtures from testdata/
// and validates the well-formed pair succeeds.
func TestValidateManifests_FromJSONFixtures(t *testing.T) {
	modData, err := os.ReadFile("testdata/module-valid.json")
	if err != nil {
		t.Fatalf("read module fixture: %v", err)
	}
	compData, err := os.ReadFile("testdata/component-valid.json")
	if err != nil {
		t.Fatalf("read component fixture: %v", err)
	}
	archData, err := os.ReadFile("testdata/component-architect.json")
	if err != nil {
		t.Fatalf("read architect fixture: %v", err)
	}

	m, err := parseModuleManifest(modData)
	if err != nil {
		t.Fatalf("parse module: %v", err)
	}
	c1, err := parseComponentManifest(compData)
	if err != nil {
		t.Fatalf("parse component: %v", err)
	}
	c2, err := parseComponentManifest(archData)
	if err != nil {
		t.Fatalf("parse architect: %v", err)
	}

	// Skip source-existence check (nil FS) since these fixtures reference real
	// embedded files only available in a full build.
	if err := validateManifests([]ModuleManifest{m}, []ComponentManifest{c1, c2}, nil); err != nil {
		t.Errorf("fixture validation error: %v", err)
	}
}

// TestValidateManifests_OutOfEnumDefaultInstall verifies that invalid
// module.defaultInstall is rejected.
func TestValidateManifests_OutOfEnumDefaultInstall(t *testing.T) {
	m := wellFormedModule()
	m.DefaultInstall = "yes"
	if err := validateModuleManifest(m); err == nil {
		t.Error("expected error for invalid defaultInstall, got nil")
	}
}

// TestValidateManifests_DuplicateComponentID verifies that duplicate component
// IDs in the same manifest set are rejected.
func TestValidateManifests_DuplicateComponentID(t *testing.T) {
	m := wellFormedModule()
	m.Components = []string{"orchestrator-agent", "orchestrator-agent"}
	if err := validateModuleManifest(m); err == nil {
		t.Error("expected error for duplicate component id in module, got nil")
	}
}

// ---------------------------------------------------------------------------
// SEC-DR-2: leaf-exact allowlist within mcp namespace (AC-9)
// ---------------------------------------------------------------------------

// TestValidateConfigKeyNamespace_McpAllowlistedLeavesAccepted verifies AC-9:
// mcp.memory and mcp.context7 are the ONLY leaves TH components may declare
// under the mcp namespace, and they are accepted.
func TestValidateConfigKeyNamespace_McpAllowlistedLeavesAccepted(t *testing.T) {
	for _, k := range []string{"mcp.memory", "mcp.context7"} {
		if err := validateConfigKeyNamespace("test-comp", k); err != nil {
			t.Errorf("allowlisted key %q should be accepted, got error: %v", k, err)
		}
	}
}

// TestValidateConfigKeyNamespace_BareMcpRejected verifies AC-9: bare "mcp"
// is rejected (operator-owned; TH must declare specific leaves).
func TestValidateConfigKeyNamespace_BareMcpRejected(t *testing.T) {
	if err := validateConfigKeyNamespace("test-comp", "mcp"); err == nil {
		t.Error("bare 'mcp' key should be rejected (SEC-DR-2), got nil")
	}
}

// TestValidateConfigKeyNamespace_McpEvilRejected verifies AC-9 negative test:
// mcp.evil (non-allowlisted leaf under mcp) is rejected (SEC-DR-2).
func TestValidateConfigKeyNamespace_McpEvilRejected(t *testing.T) {
	if err := validateConfigKeyNamespace("test-comp", "mcp.evil"); err == nil {
		t.Error("mcp.evil should be rejected by SEC-DR-2 leaf-exact allowlist, got nil")
	}
}

// TestValidateConfigKeyNamespace_McpOtherServersRejected verifies that
// mcp.<operator-server> keys are not declarable by TH components.
func TestValidateConfigKeyNamespace_McpOtherServersRejected(t *testing.T) {
	for _, k := range []string{"mcp.custom", "mcp.brave-search", "mcp.filesystem"} {
		if err := validateConfigKeyNamespace("test-comp", k); err == nil {
			t.Errorf("operator mcp key %q should be rejected (SEC-DR-2), got nil", k)
		}
	}
}

// TestValidateConfigKeyNamespace_McpServersNamespaceStillRejected verifies C-1:
// the existing mcpServers.* namespace (claude.json) is still fully rejected.
func TestValidateConfigKeyNamespace_McpServersNamespaceStillRejected(t *testing.T) {
	for _, k := range []string{"mcpServers", "mcpServers.memory", "mcpServers.context7"} {
		if err := validateConfigKeyNamespace("test-comp", k); err == nil {
			t.Errorf("mcpServers key %q should be rejected (C-1), got nil", k)
		}
	}
}

// ---------------------------------------------------------------------------
// R2-1: {env:VAR} reference syntax in opencode.json (AC-5 / AC-14)
// ---------------------------------------------------------------------------

// TestOpencodeJSON_EnvVarReferenceSyntax verifies R2-1: the {env:VAR} references
// are written in the correct opencode syntax — not as literal secret values and
// not as a different interpolation format.
func TestOpencodeJSON_EnvVarReferenceSyntax(t *testing.T) {
	memURL := "https://mcp.example.com/mcp"
	entry := buildOpencodeMemoryEntry(memURL)
	if entry == nil {
		t.Fatal("buildOpencodeMemoryEntry returned nil for non-empty URL")
	}

	headers, ok := entry["headers"].(map[string]interface{})
	if !ok {
		t.Fatalf("headers field missing or not a map; got %T", entry["headers"])
	}

	auth, ok := headers["Authorization"].(string)
	if !ok {
		t.Fatalf("Authorization header missing or not a string; got %T", headers["Authorization"])
	}

	// R2-1: must be the exact {env:MEMORY_MCP_BEARER} reference (not a literal secret).
	const wantAuth = "{env:MEMORY_MCP_BEARER}"
	if auth != wantAuth {
		t.Errorf("Authorization header = %q, want %q", auth, wantAuth)
	}

	// Verify the context7 entry similarly.
	ctx7Entry := buildOpencodeContext7Entry("https://mcp.context7.com/mcp")
	ctx7Headers, ok := ctx7Entry["headers"].(map[string]interface{})
	if !ok {
		t.Fatalf("context7 headers field missing or not a map; got %T", ctx7Entry["headers"])
	}

	ctx7Key, ok := ctx7Headers["CONTEXT7_API_KEY"].(string)
	if !ok {
		t.Fatalf("CONTEXT7_API_KEY header missing or not a string; got %T", ctx7Headers["CONTEXT7_API_KEY"])
	}

	const wantCtx7 = "{env:CONTEXT7_API_KEY}"
	if ctx7Key != wantCtx7 {
		t.Errorf("CONTEXT7_API_KEY header = %q, want %q", ctx7Key, wantCtx7)
	}
}
