package main

import (
	"fmt"
	"io/fs"
	"strings"
)

// isInvocableAgent returns true when name is an invocable agent .md file,
// applying the canonical exclusion rule from assets_test.go:30-34:
//   - skip _shared/ (cross-cutting snippets)
//   - skip testing-refs/ (reference library loaded on demand)
//   - skip README.md
//   - skip ref-*.md (non-invocable reference documents)
//
// This predicate is extracted as a shared helper so the registry and the
// assets test both use the identical rule (no drift between count and placement).
func isInvocableAgent(name string, isDir bool) bool {
	if isDir {
		return false
	}
	if !strings.HasSuffix(name, ".md") {
		return false
	}
	return name != "README.md" && !strings.HasPrefix(name, "ref-")
}

// buildOpencodeManifests builds the real module+component set for the opencode
// runtime. The component set consists of:
//   - Agent components: all invocable agents (excluding ref-*.md / README /
//     _shared / testing-refs) transformed to .opencode/agents/<name>.md
//   - Hook-plugin component: the full transitive closure of hooks/ts/opencode-plugin.ts
//     + entry/*.opencode.ts + bodies/*.ts + shim/*.ts → {config_root}/plugins/
//
// No command components are emitted today (S-7 — the command set is empty;
// the "command" kind is registered in validKind so future components validate).
// No skill components are emitted (reuse ~/.claude/skills/ discovery).
func buildOpencodeManifests() ([]ModuleManifest, []ComponentManifest, error) {
	embeddedFS := EmbeddedAssets()

	// Collect agent components.
	agentComponents, err := buildAgentComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build agent components: %w", err)
	}

	// Collect hook-plugin component (full transitive closure).
	hookComponents, err := buildHookPluginComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build hook components: %w", err)
	}

	allComponents := append(agentComponents, hookComponents...)

	// Build the module manifest listing all component IDs.
	componentIDs := make([]string, 0, len(allComponents))
	for _, c := range allComponents {
		componentIDs = append(componentIDs, c.Component)
	}

	module := ModuleManifest{
		SchemaVersion:  1,
		Module:         "opencode-harness",
		Description:    "Team Harness agents and hook plugin for the opencode runtime",
		DefaultInstall: "always",
		Components:     componentIDs,
	}

	return []ModuleManifest{module}, allComponents, nil
}

// buildAgentComponents returns one ComponentManifest per invocable agent.
// The source is agents/<name>.md; the destination is
// {config_root}/agents/<name>.md.
// After the generic transform, the mode-by-role layer is applied at plan time
// via a wrapper transform (see modeByRoleTransform).
func buildAgentComponents(embeddedFS fs.FS) ([]ComponentManifest, error) {
	var components []ComponentManifest

	entries, err := fs.ReadDir(embeddedFS, "agents")
	if err != nil {
		return nil, fmt.Errorf("read agents dir: %w", err)
	}

	for _, e := range entries {
		// Skip subdirectories by their name (e.g. _shared, testing-refs).
		if e.IsDir() {
			continue
		}
		if !isInvocableAgent(e.Name(), false) {
			continue
		}

		name := strings.TrimSuffix(e.Name(), ".md")
		compID := "agent-" + name

		components = append(components, ComponentManifest{
			SchemaVersion:  1,
			Component:      compID,
			Module:         "opencode-harness",
			Kind:           TransformKindAgent,
			Source:         "agents/" + e.Name(),
			Cost:           "low",
			Stability:      "stable",
			DefaultInstall: true,
			Emits: OwnershipTags{
				Files:      []string{"{config_root}/agents/" + e.Name()},
				ConfigKeys: []string{},
			},
		})
	}

	return components, nil
}

// buildHookPluginComponents returns ComponentManifests for the opencode hook
// plugin tree. The full transitive closure is placed under
// {config_root}/plugins/ so the plugin loads without unresolved imports
// (S-6 closure requirement).
//
// Placed files:
//   - hooks/ts/opencode-plugin.ts → {config_root}/plugins/team-harness.ts
//   - hooks/ts/entry/*.opencode.ts → {config_root}/plugins/entry/
//   - hooks/ts/bodies/*.ts → {config_root}/plugins/bodies/
//   - hooks/ts/shim/*.ts → {config_root}/plugins/shim/
//
// NOT placed (CC-side only): package.json, tsconfig.json, dist/, *.cc.ts
func buildHookPluginComponents(embeddedFS fs.FS) ([]ComponentManifest, error) {
	var components []ComponentManifest

	// 1. Main plugin file (renamed for clarity as the opencode entry point).
	components = append(components, ComponentManifest{
		SchemaVersion:  1,
		Component:      "hook-plugin-entry",
		Module:         "opencode-harness",
		Kind:           "hook",
		Source:         "hooks/ts/opencode-plugin.ts",
		Cost:           "low",
		Stability:      "stable",
		DefaultInstall: true,
		Emits: OwnershipTags{
			Files:      []string{"{config_root}/plugins/team-harness.ts"},
			ConfigKeys: []string{},
		},
	})

	// 2. entry/*.opencode.ts — only the opencode entry files.
	entryComponents, err := buildHookSubdirComponents(embeddedFS, "hooks/ts/entry", ".opencode.ts", "entry", "hook-plugin-entry-")
	if err != nil {
		return nil, err
	}
	components = append(components, entryComponents...)

	// 3. bodies/*.ts — all body files.
	bodyComponents, err := buildHookSubdirComponents(embeddedFS, "hooks/ts/bodies", ".ts", "bodies", "hook-plugin-body-")
	if err != nil {
		return nil, err
	}
	components = append(components, bodyComponents...)

	// 4. shim/*.ts — the normalized shim.
	shimComponents, err := buildHookSubdirComponents(embeddedFS, "hooks/ts/shim", ".ts", "shim", "hook-plugin-shim-")
	if err != nil {
		return nil, err
	}
	components = append(components, shimComponents...)

	return components, nil
}

// buildHookSubdirComponents reads a subdirectory of hooks/ts/ and emits one
// ComponentManifest per file matching suffix. destSubdir is the relative
// subdirectory under {config_root}/plugins/.
func buildHookSubdirComponents(embeddedFS fs.FS, srcDir, suffix, destSubdir, compIDPrefix string) ([]ComponentManifest, error) {
	entries, err := fs.ReadDir(embeddedFS, srcDir)
	if err != nil {
		return nil, fmt.Errorf("read dir %q: %w", srcDir, err)
	}

	var components []ComponentManifest
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), suffix) {
			continue
		}

		// Derive a safe component ID from the filename.
		base := strings.TrimSuffix(e.Name(), ".ts")
		base = strings.ReplaceAll(base, ".", "-")
		base = strings.ReplaceAll(base, "_", "-")
		compID := compIDPrefix + base

		dest := "{config_root}/plugins/" + destSubdir + "/" + e.Name()

		components = append(components, ComponentManifest{
			SchemaVersion:  1,
			Component:      compID,
			Module:         "opencode-harness",
			Kind:           "hook",
			Source:         srcDir + "/" + e.Name(),
			Cost:           "low",
			Stability:      "stable",
			DefaultInstall: true,
			Emits: OwnershipTags{
				Files:      []string{dest},
				ConfigKeys: []string{},
			},
		})
	}

	return components, nil
}

// opencodeRuntimeTransform is the transform passed to ComputePlan for the
// opencode runtime. It applies the generic CC→opencode transform AND the
// mode-by-role installer layer (S-5):
//   - orchestrator → mode: primary (derived from sourcePath)
//   - all other agents → mode: subagent (blanket from generic transform)
//
// sourcePath is the embedded FS path (e.g. "agents/orchestrator.md"), passed by
// ComputePlan so this function can identify the orchestrator without a pre-built
// lookup table.
//
// This is NOT the fixture-bound transformToOpencode function. The fixture binds
// only the generic mapping to stay in lockstep with migrate.mjs. The role
// override is asserted by a separate test (TestTransform_ModeByRole_Orchestrator,
// AC-12).
func opencodeRuntimeTransform(src []byte, kind, sourcePath string) ([]byte, error) {
	// Apply the generic CC→opencode transform first.
	transformed, err := transformToOpencode(src, kind)
	if err != nil {
		return nil, err
	}

	// Apply mode-by-role only for agent components.
	if kind != TransformKindAgent {
		return transformed, nil
	}

	// Derive agent name from the source path (e.g. "agents/orchestrator.md").
	parts := strings.Split(sourcePath, "/")
	filename := parts[len(parts)-1]
	agentName := strings.TrimSuffix(filename, ".md")

	return applyModeByRole(transformed, agentName)
}
