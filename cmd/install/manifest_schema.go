package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"regexp"
	"strings"
)

// OwnershipTags declares what a component owns. Names only — no values ever
// (SEC-05). Files entries use the {config_root} template token; ConfigKeys
// entries are bare dotted key names in .team-harness.json.
type OwnershipTags struct {
	Files      []string `json:"files"`
	ConfigKeys []string `json:"configKeys"`
}

// ModuleManifest is the Layer-1 descriptor: a shippable unit grouping a set
// of components.
type ModuleManifest struct {
	SchemaVersion  int      `json:"schemaVersion"`
	Module         string   `json:"module"`
	Description    string   `json:"description"`
	DefaultInstall string   `json:"defaultInstall"`
	Components     []string `json:"components"`
}

// ComponentManifest is the Layer-2 descriptor: the smallest installable item.
type ComponentManifest struct {
	SchemaVersion  int           `json:"schemaVersion"`
	Component      string        `json:"component"`
	Module         string        `json:"module"`
	Kind           string        `json:"kind"`
	Source         string        `json:"source"`
	Cost           string        `json:"cost"`
	Stability      string        `json:"stability"`
	DefaultInstall bool          `json:"defaultInstall"`
	Emits          OwnershipTags `json:"emits"`
}

// reserved operator-owned top-level key namespaces that live in ~/.claude.json.
// No component may declare ownership of these keys (C-1).
var reservedOperatorNamespaces = []string{"mcpServers"}

// configKeyPattern is the structural gate for configKey names (SEC-05 / SEC-DR-P3-3).
// A valid configKey is a bare dotted key name: letters, digits, underscores,
// hyphens, and dots. No '=', no whitespace, no quotes.
var configKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)

// parseModuleManifest strictly parses JSON bytes into a ModuleManifest.
// Unknown fields are rejected (strict schema).
func parseModuleManifest(data []byte) (ModuleManifest, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var m ModuleManifest
	if err := dec.Decode(&m); err != nil {
		return ModuleManifest{}, fmt.Errorf("parse module manifest: %w", err)
	}
	return m, nil
}

// parseComponentManifest strictly parses JSON bytes into a ComponentManifest.
// Unknown fields are rejected (strict schema).
func parseComponentManifest(data []byte) (ComponentManifest, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var c ComponentManifest
	if err := dec.Decode(&c); err != nil {
		return ComponentManifest{}, fmt.Errorf("parse component manifest: %w", err)
	}
	return c, nil
}

// validateManifests validates the cross-referential integrity of a module set
// and its components. All structural rules are enforced: schemaVersion,
// enums, reference integrity, SEC-05 path/key gates, and source existence.
func validateManifests(modules []ModuleManifest, components []ComponentManifest, embeddedFS fs.FS) error {
	// Build a lookup map of module name → ModuleManifest.
	moduleByName := make(map[string]ModuleManifest, len(modules))
	for _, m := range modules {
		if err := validateModuleManifest(m); err != nil {
			return err
		}
		if _, dup := moduleByName[m.Module]; dup {
			return fmt.Errorf("duplicate module name %q", m.Module)
		}
		moduleByName[m.Module] = m
	}

	// Build a lookup map of component id → ComponentManifest.
	componentByID := make(map[string]ComponentManifest, len(components))
	for _, c := range components {
		if err := validateComponentManifest(c, moduleByName, embeddedFS); err != nil {
			return err
		}
		if _, dup := componentByID[c.Component]; dup {
			return fmt.Errorf("duplicate component id %q", c.Component)
		}
		componentByID[c.Component] = c
	}

	// Reference integrity: every id in ModuleManifest.Components must have a
	// matching ComponentManifest, and every ComponentManifest must be referenced.
	for _, m := range modules {
		for _, cID := range m.Components {
			c, ok := componentByID[cID]
			if !ok {
				return fmt.Errorf("module %q references component %q which has no manifest", m.Module, cID)
			}
			if c.Module != m.Module {
				return fmt.Errorf("component %q is referenced by module %q but declares module %q", cID, m.Module, c.Module)
			}
		}
	}

	// Check for orphan components (component not referenced by any module).
	for _, c := range components {
		m, ok := moduleByName[c.Module]
		if !ok {
			// Already caught by validateComponentManifest; skip here.
			continue
		}
		found := false
		for _, cID := range m.Components {
			if cID == c.Component {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("component %q declares module %q but is not listed in that module's components", c.Component, c.Module)
		}
	}

	return nil
}

// validateModuleManifest validates an individual ModuleManifest.
func validateModuleManifest(m ModuleManifest) error {
	if m.SchemaVersion != 1 {
		return fmt.Errorf("module %q: unsupported schemaVersion %d (want 1)", m.Module, m.SchemaVersion)
	}
	if m.Module == "" {
		return fmt.Errorf("module: module name must not be empty")
	}
	if !isKebabID(m.Module) {
		return fmt.Errorf("module %q: module name must match [a-z0-9-]+", m.Module)
	}
	validDefaultInstall := map[string]bool{"always": true, "optional": true, "off": true}
	if !validDefaultInstall[m.DefaultInstall] {
		return fmt.Errorf("module %q: invalid defaultInstall %q (want always|optional|off)", m.Module, m.DefaultInstall)
	}
	if len(m.Components) == 0 {
		return fmt.Errorf("module %q: components list must not be empty", m.Module)
	}
	// Detect duplicate component IDs within the same module.
	seen := make(map[string]bool)
	for _, cID := range m.Components {
		if seen[cID] {
			return fmt.Errorf("module %q: duplicate component id %q in components list", m.Module, cID)
		}
		seen[cID] = true
	}
	return nil
}

// validateComponentManifest validates an individual ComponentManifest.
func validateComponentManifest(c ComponentManifest, moduleByName map[string]ModuleManifest, embeddedFS fs.FS) error {
	if c.SchemaVersion != 1 {
		return fmt.Errorf("component %q: unsupported schemaVersion %d (want 1)", c.Component, c.SchemaVersion)
	}
	if c.Component == "" {
		return fmt.Errorf("component: component id must not be empty")
	}
	if c.Module == "" {
		return fmt.Errorf("component %q: module must not be empty", c.Component)
	}
	if _, ok := moduleByName[c.Module]; !ok {
		return fmt.Errorf("component %q: references unknown module %q", c.Component, c.Module)
	}

	validKind := map[string]bool{"agent": true, "skill": true, "hook": true}
	if !validKind[c.Kind] {
		return fmt.Errorf("component %q: invalid kind %q (want agent|skill|hook)", c.Component, c.Kind)
	}

	validCost := map[string]bool{"low": true, "medium": true, "high": true}
	if !validCost[c.Cost] {
		return fmt.Errorf("component %q: invalid cost %q (want low|medium|high)", c.Component, c.Cost)
	}

	validStability := map[string]bool{"experimental": true, "beta": true, "stable": true}
	if !validStability[c.Stability] {
		return fmt.Errorf("component %q: invalid stability %q (want experimental|beta|stable)", c.Component, c.Stability)
	}

	if c.Source == "" {
		return fmt.Errorf("component %q: source must not be empty", c.Component)
	}

	// Source must exist in EmbeddedAssets.
	if embeddedFS != nil {
		if _, err := fs.Stat(embeddedFS, c.Source); err != nil {
			return fmt.Errorf("component %q: source %q not found in embedded assets: %w", c.Component, c.Source, err)
		}
	}

	// SEC-05: validate Emits.Files — every entry must begin with {config_root}.
	for _, f := range c.Emits.Files {
		if !strings.HasPrefix(f, "{config_root}") {
			return fmt.Errorf("component %q: Emits.Files entry %q must begin with {config_root} (SEC-05)", c.Component, f)
		}
	}

	// SEC-05 / C-1: validate Emits.ConfigKeys — structural pattern + reserved namespace guard.
	for _, k := range c.Emits.ConfigKeys {
		if !configKeyPattern.MatchString(k) {
			return fmt.Errorf("component %q: Emits.ConfigKeys entry %q fails structural pattern ^[A-Za-z0-9_.-]+$ (SEC-05)", c.Component, k)
		}
		// Forbid ownership of keys in the reserved operator-owned namespace.
		for _, ns := range reservedOperatorNamespaces {
			if k == ns || strings.HasPrefix(k, ns+".") {
				return fmt.Errorf("component %q: Emits.ConfigKeys entry %q is in reserved operator namespace %q — components cannot own ~/.claude.json keys (C-1)", c.Component, k, ns)
			}
		}
	}

	return nil
}

// isKebabID returns true if the string matches [a-z0-9-]+.
func isKebabID(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-') {
			return false
		}
	}
	return true
}
