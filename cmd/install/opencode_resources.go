package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

const opencodeSettingsBinding = `"__TEAM_HARNESS_OPENCODE_CONFIG__"`

var runtimeDocumentNamePattern = regexp.MustCompile(`^[a-z][a-z0-9-]*\.md$`)
var runtimeDocumentPathPattern = regexp.MustCompile("(^|[\\s`(<\"'])(?:\\.\\./)*(docs/[a-z][a-z0-9-]*\\.md)\\b")
var runtimeMarkdownLinkPattern = regexp.MustCompile(`\]\(<?([^\s()<>]+)>?\)`)

func readRuntimeDocuments(assets fs.FS) ([]string, error) {
	data, err := fs.ReadFile(assets, "runtime/schema/runtime-docs.json")
	if err != nil {
		return nil, err
	}
	var registry struct {
		SchemaVersion int      `json:"schema_version"`
		Documents     []string `json:"documents"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&registry); err != nil {
		return nil, fmt.Errorf("runtime document registry: %w", err)
	}
	if registry.SchemaVersion != 1 || len(registry.Documents) == 0 {
		return nil, fmt.Errorf("invalid runtime document registry")
	}
	seen := map[string]bool{}
	for _, name := range registry.Documents {
		if !runtimeDocumentNamePattern.MatchString(name) || seen[name] {
			return nil, fmt.Errorf("invalid or duplicate runtime document name %q", name)
		}
		seen[name] = true
		if _, err := fs.Stat(assets, "docs/"+name); err != nil {
			return nil, fmt.Errorf("runtime document %q: %w", name, err)
		}
	}
	return registry.Documents, nil
}

func runtimeDocumentComponent(name string) string {
	return "reference-docs-" + strings.ReplaceAll(name, ".", "-")
}

func buildRuntimeDocumentComponents(assets fs.FS) ([]ComponentManifest, error) {
	names, err := readRuntimeDocuments(assets)
	if err != nil {
		return nil, err
	}
	components := make([]ComponentManifest, 0, len(names))
	for _, name := range names {
		components = append(components, ComponentManifest{
			SchemaVersion: 1, Component: runtimeDocumentComponent(name), Module: "opencode-harness",
			Kind: "reference", Source: "docs/" + name, Cost: "low", Stability: "stable", DefaultInstall: true,
			Emits: OwnershipTags{Files: []string{"{config_root}/th-references/docs/" + name}, ConfigKeys: []string{}},
		})
	}
	return components, nil
}

// Bind before ComputePlan hashes the source, so dry-run, apply and update use
// the same installed paths without a runtime interpreter or environment guess.
func bindOpencodeResources(placer Placer, transform func([]byte, string, string) ([]byte, error)) (func([]byte, string, string) ([]byte, error), error) {
	names, err := readRuntimeDocuments(EmbeddedAssets())
	if err != nil {
		return nil, err
	}
	documents := map[string]bool{}
	for _, name := range names {
		documents["docs/"+name] = true
	}
	settings, err := json.Marshal(opencodeSettingsConfigPath(placer.ConfigRoot()))
	if err != nil {
		return nil, err
	}
	return func(src []byte, kind, sourcePath string) ([]byte, error) {
		out, err := transform(src, kind, sourcePath)
		if err != nil {
			return nil, err
		}
		if !strings.HasSuffix(sourcePath, ".md") {
			return out, nil
		}
		if kind == "skill" && strings.HasSuffix(sourcePath, "/SKILL.md") {
			out = bytes.ReplaceAll(out, []byte(opencodeSettingsBinding), settings)
		}
		out = runtimeMarkdownLinkPattern.ReplaceAllFunc(out, func(match []byte) []byte {
			target := string(runtimeMarkdownLinkPattern.FindSubmatch(match)[1])
			if strings.Contains(target, ":") || strings.HasPrefix(target, "/") {
				return match
			}
			file, fragment, hasFragment := strings.Cut(target, "#")
			canonical := path.Clean(path.Join(path.Dir(sourcePath), file))
			relative := ""
			switch {
			case documents[canonical]:
				relative = "th-references/" + canonical
			case strings.HasPrefix(canonical, "skills/"):
				rel := strings.TrimPrefix(canonical, "skills/")
				if strings.HasPrefix(rel, "find-bugs/") {
					rel = "th-find-bugs/" + strings.TrimPrefix(rel, "find-bugs/")
				}
				if _, err := fs.Stat(EmbeddedAssets(), "installer-assets/opencode-skills/"+rel); err == nil {
					relative = "skills/" + rel
				}
			case strings.HasPrefix(canonical, "agents/"):
				rel := strings.TrimPrefix(canonical, "agents/")
				if _, err := fs.Stat(EmbeddedAssets(), canonical); err == nil {
					if isCopyableReferencePath(rel) {
						relative = "th-references/" + canonical
					} else if !strings.Contains(rel, "/") && isInvocableAgent(rel, false) {
						relative = canonical
					}
				}
			}
			if relative == "" {
				return match
			}
			resolved := filepath.ToSlash(filepath.Join(placer.ConfigRoot(), filepath.FromSlash(relative)))
			encoded := (&url.URL{Path: resolved}).EscapedPath()
			if hasFragment {
				encoded += "#" + fragment
			}
			return []byte("](" + encoded + ")")
		})
		out = runtimeDocumentPathPattern.ReplaceAllFunc(out, func(match []byte) []byte {
			parts := runtimeDocumentPathPattern.FindSubmatch(match)
			if !documents[string(parts[2])] {
				return match
			}
			resolved := filepath.ToSlash(filepath.Join(placer.ConfigRoot(), "th-references", filepath.FromSlash(string(parts[2]))))
			return []byte(string(parts[1]) + resolved)
		})
		return out, nil
	}, nil
}

func runtimeDocumentOwnershipMatches(component, relativePath string) bool {
	names, err := readRuntimeDocuments(EmbeddedAssets())
	if err != nil {
		return false
	}
	for _, name := range names {
		if component == runtimeDocumentComponent(name) && relativePath == "th-references/docs/"+name {
			return true
		}
	}
	return false
}
