package main

import (
	"fmt"
	"io/fs"
	"path"
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

// opencodeExcludedSkills is the authoritative set of top-level skill folders
// excluded from the opencode skill copy. These skills invoke the `claude`
// binary or depend on a Claude-Code-only mechanic (plugin marketplace,
// ~/.claude.json plugin config, CC session launch) and are non-functional
// under opencode. Declared once so the walker and the test share one source
// of truth.
var opencodeExcludedSkills = map[string]bool{
	"update":     true,
	"setup":      true,
	"background": true,
	"cross-repo": true,
	"tmux":       true,
	"recover":    true,
}

// opencodeCopyableSkillExt is the fail-closed allowlist for skill asset
// extensions (layer c — SEC-DR-2 hardening). Only these extensions are copied
// into .opencode/skills/; any other extension (binaries, .exe, .pyd, .wasm,
// extension-less files) is skipped with a logged note.
//
// The list is derived from the real skills/**/references/ trees:
// .md, .txt, .toml, .html, .py (render_excalidraw.py), .json, .yaml/.yml,
// .svg, .png.
//
// Note: .py is on the allowlist because render_excalidraw.py is a legitimate
// first-party skill asset. .venv Python files share the .py extension but are
// blocked by layers (a) and (b) on their dot-segment path before this check.
var opencodeCopyableSkillExt = map[string]bool{
	".md":   true,
	".txt":  true,
	".toml": true,
	".html": true,
	".py":   true,
	".json": true,
	".yaml": true,
	".yml":  true,
	".svg":  true,
	".png":  true,
}

// isCopyableSkillPath is the fail-closed copy predicate for skill files.
// It returns true only when ALL of the following hold:
//  1. No path segment begins with '.' or '_' (defensive .venv / _shared guard — layer b).
//  2. The file is not skills/README.md.
//  3. The first path segment after skills/ is not in opencodeExcludedSkills.
//  4. The first path segment after skills/ is not "opencode-commands" (that
//     folder is emitted by buildCommandComponents, not the skill walker).
//  5. The file extension is in opencodeCopyableSkillExt (layer c — fail-closed).
//
// The rel argument is the path relative to the "skills/" root
// (e.g. "d2-diagram/references/dsl-reference.md").
func isCopyableSkillPath(rel string) bool {
	segments := strings.Split(rel, "/")

	// Rule 1: skip any segment beginning with '.' or '_'.
	for _, seg := range segments {
		if strings.HasPrefix(seg, ".") || strings.HasPrefix(seg, "_") {
			return false
		}
	}

	// Rule 2: skip skills/README.md (the top-level readme, rel == "README.md").
	if rel == "README.md" {
		return false
	}

	// Rules 3 & 4: the first segment is the skill folder name.
	if len(segments) == 0 {
		return false
	}
	topLevel := segments[0]
	if opencodeExcludedSkills[topLevel] {
		return false
	}
	if topLevel == "opencode-commands" {
		return false
	}

	// Rule 5: fail-closed extension allowlist.
	ext := strings.ToLower(path.Ext(rel))
	if ext == "" || !opencodeCopyableSkillExt[ext] {
		return false
	}

	return true
}

// buildSkillComponents returns one ComponentManifest per copyable skill file,
// mirroring the buildHookSubdirComponents pattern (one component per file).
//
// Source: skills/<rel>
// Emit:   {config_root}/skills/<rel>  (preserves the subfolder path verbatim)
//
// Skills use the identity transform (kind != agent && kind != command in
// transformToOpencode), so the content is copied byte-for-byte — the
// cross-harness identical requirement is satisfied with no transform code.
func buildSkillComponents(embeddedFS fs.FS) ([]ComponentManifest, error) {
	var components []ComponentManifest

	err := fs.WalkDir(embeddedFS, "skills", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		// p is the full embedded path: "skills/foo/bar.md"
		// rel is the part after "skills/": "foo/bar.md"
		rel := strings.TrimPrefix(p, "skills/")

		if !isCopyableSkillPath(rel) {
			return nil
		}

		// Derive a safe component ID from the relative path.
		// Replace path separators and other non-kebab characters with hyphens.
		compIDBase := strings.NewReplacer(
			"/", "-",
			".", "-",
			"_", "-",
		).Replace(rel)
		// Trim any leading/trailing hyphens that may result from replacement.
		compIDBase = strings.Trim(compIDBase, "-")
		compID := "skill-" + compIDBase

		components = append(components, ComponentManifest{
			SchemaVersion:  1,
			Component:      compID,
			Module:         "opencode-harness",
			Kind:           "skill",
			Source:         "skills/" + rel,
			Cost:           "low",
			Stability:      "stable",
			DefaultInstall: true,
			Emits: OwnershipTags{
				Files:      []string{"{config_root}/skills/" + rel},
				ConfigKeys: []string{},
			},
		})

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk skills: %w", err)
	}

	return components, nil
}

// buildCommandComponents returns one ComponentManifest per .md file in
// installer-assets/opencode-commands/. Each file is emitted as a `command` kind
// component to {config_root}/commands/<name>.md.
//
// The source directory is installer-assets/ (not skills/) so that changes here
// do not touch a distributed plugin-asset path and do not require a plugin.json
// version bump.
//
// The command surface undergoes the standard transformToOpencode command
// transform (kind == "command"), which projects the frontmatter into the
// opencode command shape and applies the anti-injection gate.
func buildCommandComponents(embeddedFS fs.FS) ([]ComponentManifest, error) {
	const srcDir = "installer-assets/opencode-commands"

	entries, err := fs.ReadDir(embeddedFS, srcDir)
	if err != nil {
		return nil, fmt.Errorf("read dir %q: %w", srcDir, err)
	}

	var components []ComponentManifest
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}

		name := strings.TrimSuffix(e.Name(), ".md")

		// Derive a safe kebab component ID.
		compIDBase := strings.NewReplacer(".", "-", "_", "-").Replace(name)
		compID := "command-" + compIDBase

		components = append(components, ComponentManifest{
			SchemaVersion:  1,
			Component:      compID,
			Module:         "opencode-harness",
			Kind:           "command",
			Source:         srcDir + "/" + e.Name(),
			Cost:           "low",
			Stability:      "stable",
			DefaultInstall: true,
			Emits: OwnershipTags{
				Files:      []string{"{config_root}/commands/" + e.Name()},
				ConfigKeys: []string{},
			},
		})
	}

	return components, nil
}

// buildOpencodeManifests builds the real module+component set for the opencode
// runtime. The component set consists of:
//   - Agent components: all invocable agents (excluding ref-*.md / README /
//     _shared / testing-refs) transformed to .opencode/agents/<name>.md
//   - Skill components: all copyable skill files (excluding the six
//     opencode-incompatible skills and the opencode-commands source folder)
//     copied verbatim to .opencode/skills/<name>/...
//   - Command components: skills/opencode-commands/*.md emitted as opencode
//     commands to .opencode/commands/<name>.md
//   - Hook-plugin component: the full transitive closure of hooks/ts/opencode-plugin.ts
//     + entry/*.opencode.ts + bodies/*.ts + shim/*.ts → {config_root}/plugins/
func buildOpencodeManifests() ([]ModuleManifest, []ComponentManifest, error) {
	embeddedFS := EmbeddedAssets()

	// Collect agent components.
	agentComponents, err := buildAgentComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build agent components: %w", err)
	}

	// Collect skill components (closes the skills-copy drift).
	skillComponents, err := buildSkillComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build skill components: %w", err)
	}

	// Collect command components (the /th-update command and any future commands).
	commandComponents, err := buildCommandComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build command components: %w", err)
	}

	// Collect hook-plugin component (full transitive closure).
	hookComponents, err := buildHookPluginComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build hook components: %w", err)
	}

	allComponents := make([]ComponentManifest, 0,
		len(agentComponents)+len(skillComponents)+len(commandComponents)+len(hookComponents))
	allComponents = append(allComponents, agentComponents...)
	allComponents = append(allComponents, skillComponents...)
	allComponents = append(allComponents, commandComponents...)
	allComponents = append(allComponents, hookComponents...)

	// Build the module manifest listing all component IDs AFTER assembling the
	// full component slice (keeps orphan-check safe).
	componentIDs := make([]string, 0, len(allComponents))
	for _, c := range allComponents {
		componentIDs = append(componentIDs, c.Component)
	}

	module := ModuleManifest{
		SchemaVersion:  1,
		Module:         "opencode-harness",
		Description:    "Team Harness agents, skills, commands and hook plugin for the opencode runtime",
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

// opencodeRuntimeTransformTiered is opencodeRuntimeTransform's opt-in
// counterpart (#424): it bakes a concrete model: line for provider (derived
// from each agent's CC source tier) instead of dropping model: entirely, then
// applies the same mode-by-role layer. Selected by selectTransform only when
// the operator has opted into per-provider cost tiering; the model-less
// default path (opencodeRuntimeTransform) is unaffected.
func opencodeRuntimeTransformTiered(src []byte, kind, sourcePath, provider string) ([]byte, error) {
	transformed, err := transformToOpencodeTiered(src, kind, provider)
	if err != nil {
		return nil, err
	}

	if kind != TransformKindAgent {
		return transformed, nil
	}

	parts := strings.Split(sourcePath, "/")
	filename := parts[len(parts)-1]
	agentName := strings.TrimSuffix(filename, ".md")

	return applyModeByRole(transformed, agentName)
}
