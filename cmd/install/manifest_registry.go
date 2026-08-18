package main

import (
	"errors"
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

// opencodeSkillOverrides is the authoritative set of canonical skill names
// whose Claude-oriented implementation is replaced by a native opencode
// adapter from installer-assets/opencode-skills/<name>/. The capability name
// remains shared across all runtimes; only the runtime mechanics differ.
var opencodeSkillOverrides = map[string]bool{
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
// .svg, .png, .mjs (deterministic pipeline runners), and the
// interactive-presentation scaffold sources (.ts/.tsx/.css/.js plus .lock for
// the uv/npm lockfiles that pin the scaffold's dependency versions).
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
	".mjs":  true,
	".ts":   true,
	".tsx":  true,
	".css":  true,
	".js":   true,
	".lock": true,
}

// isCopyableSkillPath is the fail-closed copy predicate for skill files.
// It returns true only when ALL of the following hold:
//  1. No path segment begins with '.' or '_' (defensive .venv / _shared guard — layer b).
//  2. The file is not skills/README.md.
//  3. The first path segment after skills/ does not have an opencode override.
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
	if opencodeSkillOverrides[topLevel] {
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

// buildSkillComponents returns one ComponentManifest per projected opencode
// skill file, mirroring the buildHookSubdirComponents pattern (one component
// per file). Every projection is generated from the canonical skills/ tree
// except the small native override set above.
//
// Source: installer-assets/opencode-skills/<rel>
// Emit:   {config_root}/skills/<rel>  (preserves the subfolder path verbatim)
func buildSkillComponents(embeddedFS fs.FS) ([]ComponentManifest, error) {
	var components []ComponentManifest
	appendComponent := func(source, rel string) {
		compIDBase := strings.NewReplacer(
			"/", "-",
			".", "-",
			"_", "-",
		).Replace(rel)
		compIDBase = strings.Trim(compIDBase, "-")
		components = append(components, ComponentManifest{
			SchemaVersion:  1,
			Component:      "skill-" + compIDBase,
			Module:         "opencode-harness",
			Kind:           "skill",
			Source:         source,
			Cost:           "low",
			Stability:      "stable",
			DefaultInstall: true,
			Emits: OwnershipTags{
				Files:      []string{"{config_root}/skills/" + rel},
				ConfigKeys: []string{},
			},
		})
	}

	err := fs.WalkDir(embeddedFS, "installer-assets/opencode-skills", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel := strings.TrimPrefix(p, "installer-assets/opencode-skills/")
		if !isCopyableProjectedSkillPath(rel) {
			return nil
		}
		appendComponent(p, rel)
		return nil
	})
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("walk opencode skill overrides: %w", err)
	}

	return components, nil
}

func isCopyableProjectedSkillPath(rel string) bool {
	segments := strings.Split(rel, "/")
	if len(segments) < 2 || segments[0] == "" {
		return false
	}
	for _, segment := range segments {
		if strings.HasPrefix(segment, ".") || strings.HasPrefix(segment, "_") {
			return false
		}
	}
	return opencodeCopyableSkillExt[strings.ToLower(path.Ext(rel))]
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
//
// OpenCode uses its native permission and approval model. Team Harness does not
// install a parallel hook layer for this runtime.
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

	// Collect agent reference documents (runtime-read, non-dispatchable).
	referenceComponents, err := buildReferenceComponents(embeddedFS)
	if err != nil {
		return nil, nil, fmt.Errorf("build reference components: %w", err)
	}

	allComponents := make([]ComponentManifest, 0,
		len(agentComponents)+len(skillComponents)+len(commandComponents)+len(referenceComponents))
	allComponents = append(allComponents, agentComponents...)
	allComponents = append(allComponents, skillComponents...)
	allComponents = append(allComponents, commandComponents...)
	allComponents = append(allComponents, referenceComponents...)

	// Build the module manifest listing all component IDs AFTER assembling the
	// full component slice (keeps orphan-check safe).
	componentIDs := make([]string, 0, len(allComponents))
	for _, c := range allComponents {
		componentIDs = append(componentIDs, c.Component)
	}

	module := ModuleManifest{
		SchemaVersion:  1,
		Module:         "opencode-harness",
		Description:    "Team Harness agents, skills and commands for the opencode runtime",
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
		configKeys := []string{}
		if name == "orchestrator" {
			configKeys = []string{"default_agent"}
		}

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
				ConfigKeys: configKeys,
			},
		})
	}

	return components, nil
}

// isCopyableReferencePath is the fail-closed copy predicate for agent
// reference documents (the complement of the invocable set): top-level
// ref-*.md plus every .md under the agents/ subdirectories (_shared/,
// testing-refs/, review-lenses/, gcp-infra-refs/). Underscore-prefixed
// segments are legitimate here (_shared/, _index.md); only dot-segments and
// non-.md extensions are rejected. The rel argument is relative to "agents/".
func isCopyableReferencePath(rel string) bool {
	segments := strings.Split(rel, "/")
	for _, seg := range segments {
		if seg == "" || strings.HasPrefix(seg, ".") {
			return false
		}
	}
	if !strings.HasSuffix(rel, ".md") {
		return false
	}
	if len(segments) == 1 {
		// Top level: only the non-invocable ref-*.md documents; invocable
		// agents are emitted by buildAgentComponents and README.md stays
		// a contributor document.
		return strings.HasPrefix(rel, "ref-")
	}
	return path.Base(rel) != "README.md"
}

// buildReferenceComponents returns one ComponentManifest per agent reference
// document. Agent bodies instruct reading these at runtime (the orchestrator
// loads agents/ref-pipeline.md on activation, the architect loads its design
// references, shared contracts live under agents/_shared/), so an opencode
// install must carry them.
//
// They are emitted OUTSIDE {config_root}/agents/: opencode auto-registers
// every .md in its agents directory as a dispatchable agent by filename, so
// placing ref-pipeline.md there would create a bogus live agent. The
// th-references/ prefix keeps them inert while preserving the agents/<rel>
// shape the bodies reference.
//
// Source: agents/<rel>
// Emit:   {config_root}/th-references/agents/<rel>
func buildReferenceComponents(embeddedFS fs.FS) ([]ComponentManifest, error) {
	var components []ComponentManifest

	err := fs.WalkDir(embeddedFS, "agents", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel := strings.TrimPrefix(p, "agents/")
		if !isCopyableReferencePath(rel) {
			return nil
		}
		compIDBase := strings.NewReplacer(
			"/", "-",
			".", "-",
			"_", "-",
		).Replace(rel)
		compIDBase = strings.Trim(compIDBase, "-")
		components = append(components, ComponentManifest{
			SchemaVersion:  1,
			Component:      "reference-" + compIDBase,
			Module:         "opencode-harness",
			Kind:           "reference",
			Source:         p,
			Cost:           "low",
			Stability:      "stable",
			DefaultInstall: true,
			Emits: OwnershipTags{
				Files:      []string{"{config_root}/th-references/agents/" + rel},
				ConfigKeys: []string{},
			},
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk agent references: %w", err)
	}

	return components, nil
}

// opencodeRuntimeTransform is the transform passed to ComputePlan for the
// opencode runtime. It applies the generic CC→opencode transform AND the
// mode-by-role installer layer (S-5):
//   - orchestrator → mode: primary (derived from sourcePath)
//   - all other agents → mode: subagent (blanket from generic transform)
//
// sourcePath is the embedded FS path (e.g. "agents/orchestrator.md"), passed
// by ComputePlan so this function can identify the coordinator without a
// pre-built lookup table.
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
