package main

import (
	"bytes"
	"encoding/json"
	"path"
	"strings"
)

func opencodeWorkerModelTransform(src []byte, kind, sourcePath string, preference workerModels, categories workerModelCategories, legacyProvider string, existing []byte) ([]byte, error) {
	if !preference.Present {
		if legacyProvider != "" {
			return opencodeRuntimeTransformTiered(src, kind, sourcePath, legacyProvider)
		}
		return opencodeRuntimeTransform(src, kind, sourcePath)
	}
	transformed, err := opencodeRuntimeTransform(src, kind, sourcePath)
	if err != nil || kind != TransformKindAgent {
		return transformed, err
	}
	role := strings.TrimSuffix(path.Base(sourcePath), ".md")
	primary, err := opencodeWorkerPrimary(role, src, existing, categories)
	if err != nil {
		return nil, err
	}
	if primary {
		return preservePrimaryModelMetadata(transformed, existing), nil
	}
	resolved, err := resolveWorkerModelSelection(preference, role, categories)
	if err != nil {
		return nil, err
	}
	if resolved.Selection.Mode == "inherit" {
		return replaceWorkerFrontmatterField(transformed, "model", ""), nil
	}
	// JSON quoting is a YAML double-quoted scalar and retains native punctuation.
	var quoted bytes.Buffer
	encoder := json.NewEncoder(&quoted)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(resolved.Selection.Provider + "/" + resolved.Selection.Model); err != nil {
		return nil, workerModelInvalid("invalid_identity")
	}
	line := "model: " + strings.TrimSuffix(quoted.String(), "\n")
	return replaceWorkerFrontmatterField(transformed, "model", line), nil
}

func opencodeWorkerPrimary(role string, source, existing []byte, categories workerModelCategories) (bool, error) {
	if workerModelContains(categories.ExcludedRoles, role) {
		return true, nil
	}
	for _, content := range [][]byte{source, existing} {
		fm, _, err := parseFrontmatterYAML(content)
		if err != nil {
			return false, workerModelInvalid("primary_metadata_invalid")
		}
		if fm["mode"] == "primary" || fm["mode"] == "all" {
			return true, nil
		}
	}
	return false, nil
}

func workerFrontmatterBounds(content []byte) (string, int, bool) {
	text := strings.ReplaceAll(string(content), "\r\n", "\n")
	if !strings.HasPrefix(text, "---\n") {
		return text, 0, false
	}
	end := strings.Index(text[4:], "\n---")
	if end < 0 {
		return text, 0, false
	}
	return text, end + 4, true
}

func workerFrontmatterField(content []byte, key string) string {
	text, end, ok := workerFrontmatterBounds(content)
	if !ok {
		return ""
	}
	lines := strings.Split(text[4:end], "\n")
	for i, line := range lines {
		if !strings.HasPrefix(line, key+":") {
			continue
		}
		last := i + 1
		for last < len(lines) && (strings.HasPrefix(lines[last], " ") || strings.HasPrefix(lines[last], "\t")) {
			last++
		}
		return strings.Join(lines[i:last], "\n")
	}
	return ""
}

func replaceWorkerFrontmatterField(content []byte, key, replacement string) []byte {
	text, end, ok := workerFrontmatterBounds(content)
	if !ok {
		return content
	}
	lines := strings.Split(text[4:end], "\n")
	filtered := make([]string, 0, len(lines)+1)
	index := -1
	for i := 0; i < len(lines); i++ {
		if strings.HasPrefix(lines[i], key+":") {
			if index < 0 {
				index = len(filtered)
			}
			for i+1 < len(lines) && (strings.HasPrefix(lines[i+1], " ") || strings.HasPrefix(lines[i+1], "\t")) {
				i++
			}
			continue
		}
		filtered = append(filtered, lines[i])
	}
	if replacement != "" {
		if index < 0 {
			index = len(filtered)
		}
		if key == "model" {
			for i, line := range filtered {
				if strings.HasPrefix(line, "mode:") {
					index = i
					break
				}
			}
		}
		filtered = append(filtered, "")
		copy(filtered[index+1:], filtered[index:])
		filtered[index] = replacement
	}
	return []byte("---\n" + strings.Join(filtered, "\n") + text[end:])
}

func preservePrimaryModelMetadata(transformed, existing []byte) []byte {
	for _, key := range []string{"model", "variant", "temperature", "top_p"} {
		transformed = replaceWorkerFrontmatterField(transformed, key, workerFrontmatterField(existing, key))
	}
	mode := workerFrontmatterField(existing, "mode")
	if mode != "" {
		fm, _, err := parseFrontmatterYAML(existing)
		if err == nil && (fm["mode"] == "primary" || fm["mode"] == "all") {
			transformed = replaceWorkerFrontmatterField(transformed, "mode", mode)
		}
	}
	return transformed
}
