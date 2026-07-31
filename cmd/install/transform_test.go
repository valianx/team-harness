package main

import (
	"encoding/json"
	"io/fs"
	"os"
	"regexp"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite: Transform conformance fixture (AC-2, AC-3, AC-4)
// ---------------------------------------------------------------------------

// conformanceCase is one entry in testdata/transform-conformance.json.
//
// TierProvider is optional (#424): when set, the case exercises the opt-in
// tiered transform (transformToOpencodeTiered) instead of the model-less
// baseline transform — this is how the SAME fixture file locks both the
// model-less default (AC-5) and the tiered bake (AC-9) against drift between
// the Go and JS implementations.
type conformanceCase struct {
	Name           string `json:"name"`
	Surface        string `json:"surface"` // "agent" or "command"
	Input          string `json:"input"`
	ExpectedOutput string `json:"expectedOutput"`
	ExpectError    bool   `json:"expectError"`
	Note           string `json:"note"`
	TierProvider   string `json:"tierProvider"` // optional — empty means model-less (AC-9)
}

// TestTransformConformance_FixtureGo asserts every case in the shared
// transform-conformance.json fixture against transformToOpencode.
//
// This is half of the cross-language drift contract (AC-3). The other half is
// the node-side assertion in tools/harness-migrate/ which runs migrate.mjs
// against the same fixture and confirms the output is identical.
func TestTransformConformance_FixtureGo(t *testing.T) {
	data, err := os.ReadFile("testdata/transform-conformance.json")
	if err != nil {
		t.Fatalf("read conformance fixture: %v", err)
	}

	var cases []conformanceCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("parse conformance fixture: %v", err)
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			kind := TransformKindAgent
			if tc.Surface == "command" {
				kind = TransformKindCommand
			}

			var got []byte
			var err error
			if tc.TierProvider != "" {
				got, err = transformToOpencodeTiered([]byte(tc.Input), kind, tc.TierProvider)
			} else {
				got, err = transformToOpencode([]byte(tc.Input), kind)
			}
			if tc.ExpectError {
				if err == nil {
					t.Errorf("expected error but got none; output:\n%s", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			// Normalize line endings for comparison (Windows-safe).
			gotStr := strings.ReplaceAll(string(got), "\r\n", "\n")
			wantStr := strings.ReplaceAll(tc.ExpectedOutput, "\r\n", "\n")

			if gotStr != wantStr {
				t.Errorf("output mismatch:\nwant:\n%s\ngot:\n%s", wantStr, gotStr)
			}
		})
	}
}

// TestTransform_SkillIdentity asserts that skill/hook kinds pass through unchanged.
func TestTransform_SkillIdentity(t *testing.T) {
	input := "---\nname: my-skill\n---\nSkill body.\n"
	got, err := transformToOpencode([]byte(input), "skill")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != input {
		t.Errorf("skill transform should be identity; got %q", got)
	}

	got2, err := transformToOpencode([]byte(input), "hook")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got2) != input {
		t.Errorf("hook transform should be identity; got %q", got2)
	}
}

// TestTransform_EffortDropped asserts that effort: is not present in the output
// of an agent transform (S-4, AC-2).
func TestTransform_EffortDropped(t *testing.T) {
	input := "---\nname: test\nmodel: sonnet\neffort: high\ntools: Read\n---\n"
	got, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(string(got), "effort") {
		t.Error("transformed output must not contain 'effort' key (S-4)")
	}
}

// TestTransform_ModelDropped asserts that opencode agents are model-less: any
// model in the source — bare alias OR already-provider-prefixed — is dropped so
// the harness follows the operator's runtime /model pick on any provider.
func TestTransform_ModelDropped(t *testing.T) {
	for _, input := range []string{
		"---\nmodel: anthropic/claude-opus-4-8\ntools: Read\n---\n",
		"---\nmodel: opus\ntools: Read\n---\n",
	} {
		got, err := transformToOpencode([]byte(input), TransformKindAgent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if strings.Contains(string(got), "\nmodel:") {
			t.Errorf("model line must be dropped (model-less); got:\n%s", got)
		}
		if strings.Contains(string(got), "anthropic/") {
			t.Errorf("no provider-prefixed model id should be emitted; got:\n%s", got)
		}
	}
}

// TestTransform_BlankModelSkipped asserts that a missing model field does not
// produce a model: line in the output.
func TestTransform_BlankModelSkipped(t *testing.T) {
	input := "---\nname: test\ntools: Read\n---\n"
	got, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(string(got), "\nmodel:") {
		t.Error("model line should not appear when model is not set in source")
	}
}

// TestTransform_ModeByRole_Orchestrator asserts the installer-layer
// mode-by-role override: applying applyModeByRole to an already-transformed
// orchestrator file replaces mode: subagent with mode: primary AND renames
// the display name to "TH-orchestrator" (AC-12 / S-5; Task-2 AC-2).
//
// This test is deliberately separate from the conformance fixture — the generic
// transform always injects mode: subagent and name: orchestrator (fixture-bound /
// migrate.mjs parity); the role override is an installer-specific
// post-projection step.
func TestTransform_ModeByRole_Orchestrator(t *testing.T) {
	input := "---\nname: orchestrator\nmodel: opus\ntools: Read\n---\nBody.\n"
	transformed, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err != nil {
		t.Fatalf("transform error: %v", err)
	}

	// After the generic transform, mode should be subagent and name unchanged.
	if !strings.Contains(string(transformed), "mode: subagent") {
		t.Error("generic transform should set mode: subagent for orchestrator")
	}
	if !strings.Contains(string(transformed), "name: orchestrator") {
		t.Error("generic transform should carry name: orchestrator unchanged")
	}

	// Apply the mode-by-role override.
	final, err := applyModeByRole(transformed, "orchestrator")
	if err != nil {
		t.Fatalf("applyModeByRole error: %v", err)
	}
	if !strings.Contains(string(final), "mode: primary") {
		t.Error("after applyModeByRole, orchestrator should have mode: primary")
	}
	if strings.Contains(string(final), "mode: subagent") {
		t.Error("after applyModeByRole, 'mode: subagent' should be replaced in orchestrator")
	}
	if !strings.Contains(string(final), "name: TH-orchestrator") {
		t.Error("after applyModeByRole, orchestrator should display as name: TH-orchestrator")
	}
	if strings.Contains(string(final), "name: orchestrator\n") {
		t.Error("after applyModeByRole, 'name: orchestrator' should be replaced in orchestrator")
	}
}

// TestTransform_ModeByRole_NonOrchestrator asserts that applyModeByRole
// leaves every other agent unchanged (mode: subagent and name preserved).
// architect must never inherit the coordinator's primary mode or display
// rename — exactly one agent is ever promoted.
func TestTransform_ModeByRole_NonOrchestrator(t *testing.T) {
	input := "---\nname: architect\nmodel: sonnet\ntools: Read\n---\nBody.\n"
	transformed, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err != nil {
		t.Fatalf("transform error: %v", err)
	}

	final, err := applyModeByRole(transformed, "architect")
	if err != nil {
		t.Fatalf("applyModeByRole error: %v", err)
	}

	// Should still have mode: subagent and name: architect.
	if !strings.Contains(string(final), "mode: subagent") {
		t.Error("non-orchestrator agent should retain mode: subagent after applyModeByRole")
	}
	if !strings.Contains(string(final), "name: architect") {
		t.Error("non-orchestrator agent should retain its own name after applyModeByRole")
	}
	if strings.Contains(string(final), "TH-orchestrator") {
		t.Error("non-orchestrator agent must never receive the coordinator's TH-orchestrator display name")
	}
}

// TestTransform_InjectionReject_Body asserts fail-closed for inline injection
// in the body (AC-4a).
func TestTransform_InjectionReject_Body(t *testing.T) {
	input := "---\nname: bad\nmodel: sonnet\ntools: Read\n---\nSome !`evil` here.\n"
	_, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err == nil {
		t.Error("expected error for inline injection in body, got nil")
	}
}

// TestTransform_InjectionReject_FencedBody asserts fail-closed for fenced
// injection in the body (AC-4b).
func TestTransform_InjectionReject_FencedBody(t *testing.T) {
	input := "---\nname: bad\nmodel: sonnet\ntools: Read\n---\n```!evil\n```\n"
	_, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err == nil {
		t.Error("expected error for fenced injection in body, got nil")
	}
}

// TestTransform_InjectionReject_FrontmatterString asserts fail-closed for
// injection in a top-level frontmatter string value (AC-4b).
func TestTransform_InjectionReject_FrontmatterString(t *testing.T) {
	input := "---\nname: bad\ndescription: Run !`evil`\nmodel: sonnet\ntools: Read\n---\n"
	_, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err == nil {
		t.Error("expected error for injection in frontmatter string value, got nil")
	}
}

// TestTransform_PollutionKeyReject_Proto asserts __proto__ at top level is
// rejected (AC-4 / SEC-DR-4).
func TestTransform_PollutionKeyReject_Proto(t *testing.T) {
	input := "---\n__proto__: {isAdmin: true}\nmodel: sonnet\ntools: Read\n---\n"
	_, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err == nil {
		t.Error("expected error for __proto__ pollution key, got nil")
	}
}

// TestTransform_PollutionKeyReject_Constructor asserts constructor at top level
// is rejected (AC-4 / SEC-DR-4).
func TestTransform_PollutionKeyReject_Constructor(t *testing.T) {
	input := "---\nconstructor: evil\nmodel: sonnet\ntools: Read\n---\n"
	_, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err == nil {
		t.Error("expected error for constructor pollution key, got nil")
	}
}

// TestTransform_PollutionKeyReject_Prototype asserts prototype at top level is
// rejected (AC-4 / SEC-DR-4).
func TestTransform_PollutionKeyReject_Prototype(t *testing.T) {
	input := "---\nprototype: evil\nmodel: sonnet\ntools: Read\n---\n"
	_, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err == nil {
		t.Error("expected error for prototype pollution key, got nil")
	}
}

// TestTransform_ThOriginPresent asserts that the th-origin marker is set to
// "opencode" in every agent transform output.
func TestTransform_ThOriginPresent(t *testing.T) {
	input := "---\nname: architect\nmodel: opus\ntools: Read\n---\nBody.\n"
	got, err := transformToOpencode([]byte(input), TransformKindAgent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(string(got), "th-origin: opencode") {
		t.Error("th-origin: opencode not present in transform output")
	}
}

// TestTransform_CommandArgumentHintDropped asserts that argument-hint is not
// carried forward in the command transform (no opencode equivalent).
func TestTransform_CommandArgumentHintDropped(t *testing.T) {
	input := "---\nname: cmd\nmodel: sonnet\nargument-hint: '<branch>'\nallowed-tools: Bash\n---\nBody.\n"
	got, err := transformToOpencode([]byte(input), TransformKindCommand)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(string(got), "argument-hint") {
		t.Error("argument-hint must be dropped in command transform (no opencode equivalent)")
	}
}

// ---------------------------------------------------------------------------
// Suite: Placed-format validation over all real agents (AC-4)
// ---------------------------------------------------------------------------

// opencodeColorRe matches the opencode color field: hex or named enum.
var opencodeColorRe = regexp.MustCompile(`^(#[0-9a-fA-F]{6}|primary|secondary|accent|success|warning|error|info)$`)

// TestTransformPlacedFormat_AllAgents applies the opencode transform to every
// real agent .md file in agents/ and asserts the output is valid opencode format:
//
//   - permission is absent so OpenCode's native policy remains authoritative
//   - no mcp__* tokens appear in the frontmatter section
//   - if color is present, it matches the opencode hex-or-enum pattern
//
// The test parses the raw output string to extract permission keys because the
// placed output uses YAML block mappings that our minimal parser does not handle
// as nested objects. The pattern match below is intentionally simple: it scans
// the permission block in the serialized YAML for indented "  key: value" lines.
//
// This is AC-4 per 01-plan.md.
func TestTransformPlacedFormat_AllAgents(t *testing.T) {
	agentsFS := EmbeddedAssets()

	err := fs.WalkDir(agentsFS, "agents", func(agentPath string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(agentPath, ".md") {
			return nil
		}
		// Skip README and _shared snippets (not invocable agents).
		base := agentPath[strings.LastIndex(agentPath, "/")+1:]
		if base == "README.md" || strings.Contains(agentPath, "_shared") {
			return nil
		}

		src, readErr := fs.ReadFile(agentsFS, agentPath)
		if readErr != nil {
			t.Errorf("cannot read embedded %s: %v", agentPath, readErr)
			return nil
		}

		got, transformErr := opencodeRuntimeTransform(src, TransformKindAgent, agentPath)
		if transformErr != nil {
			t.Errorf("agent %s: transformToOpencode error: %v", agentPath, transformErr)
			return nil
		}

		// Extract the frontmatter section only (between --- fences).
		outStr := string(got)
		fmSection := ""
		if strings.HasPrefix(outStr, "---\n") {
			rest := outStr[4:]
			if closeIdx := strings.Index(rest, "\n---"); closeIdx >= 0 {
				fmSection = rest[:closeIdx]
			}
		}

		if strings.Contains(fmSection, "permission:") {
			t.Errorf("agent %s: permission must be omitted so native OpenCode policy applies", agentPath)
		}

		// Assert no mcp__ tokens appear in the frontmatter.
		if strings.Contains(fmSection, "mcp__") {
			t.Errorf("agent %s: mcp__ token found in frontmatter — must be dropped from permission", agentPath)
		}

		// Assert color, if present, is a valid opencode value.
		for _, line := range strings.Split(fmSection, "\n") {
			if strings.HasPrefix(line, "color: ") {
				colorStr := strings.TrimSpace(strings.TrimPrefix(line, "color: "))
				colorStr = strings.Trim(colorStr, `"'`)
				if !opencodeColorRe.MatchString(colorStr) {
					t.Errorf("agent %s: color %q is not a valid opencode enum or hex (#rrggbb)", agentPath, colorStr)
				}
			}
		}

		return nil
	})
	if err != nil {
		t.Fatalf("WalkDir agents: %v", err)
	}
}
