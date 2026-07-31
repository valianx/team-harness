package main

import (
	"fmt"
	"io/fs"
	"path"
	"strings"
)

// buildCodexManifests installs only Team Harness custom-agent files.
// The distributable plugin is marketplace-owned and must not be copied into an
// invented cache location by the installer. Codex enables custom agents by
// default, so config.toml is deliberately omitted: the installer must never
// replace or rewrite the operator's configuration wholesale.
func buildCodexManifests() ([]ModuleManifest, []ComponentManifest, error) {
	embedded := EmbeddedAssets()
	var components []ComponentManifest

	err := fs.WalkDir(embedded, ".codex/agents", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if path.Ext(p) != ".toml" {
			return nil
		}
		name := strings.TrimSuffix(path.Base(p), ".toml")
		components = append(components, ComponentManifest{
			SchemaVersion: 1, Component: "codex-agent-" + name, Module: "codex-harness",
			Kind: TransformKindAgent, Source: p, Cost: "low", Stability: "experimental", DefaultInstall: true,
			Emits: OwnershipTags{Files: []string{"{config_root}/agents/" + path.Base(p)}},
		})
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("walk Codex agents: %w", err)
	}

	ids := allComponentIDs(components)
	module := ModuleManifest{
		SchemaVersion: 1, Module: "codex-harness",
		Description:    "Team Harness custom agents for Codex",
		DefaultInstall: "always", Components: ids,
	}
	return []ModuleManifest{module}, components, nil
}
