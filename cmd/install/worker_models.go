package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

type workerModelCategories struct {
	SchemaVersion  int               `json:"schema_version"`
	Profiles       []string          `json:"profiles"`
	DefaultProfile string            `json:"default_profile"`
	ExcludedRoles  []string          `json:"excluded_roles"`
	IdentityLimits map[string]int    `json:"identity_limits"`
	RoleProfiles   map[string]string `json:"role_profiles"`
}

type workerModelSelection struct {
	Mode     string `json:"mode"`
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
}

type workerModelOverride struct {
	Mode     string `json:"mode,omitempty"`
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
	Profile  string `json:"profile,omitempty"`
}

type workerModels struct {
	SchemaVersion int                             `json:"schema_version"`
	Profiles      map[string]workerModelSelection `json:"profiles"`
	RoleOverrides map[string]workerModelOverride  `json:"role_overrides"`
	Present       bool                            `json:"-"`
}

type workerModelResolution struct {
	Selection workerModelSelection
	Profile   string
	Source    string
}

func workerModelInvalid(reason string) error {
	return errors.New("worker_models_" + reason)
}

func readWorkerModelCategories(assets fs.FS) (workerModelCategories, error) {
	var categories workerModelCategories
	raw, err := fs.ReadFile(assets, "skills/setup/scripts/worker-model-profiles.json")
	if err != nil || json.Unmarshal(raw, &categories) != nil || categories.SchemaVersion != 1 || len(categories.Profiles) == 0 {
		return categories, workerModelInvalid("categories_unavailable")
	}
	if !workerModelContains(categories.Profiles, categories.DefaultProfile) {
		return categories, workerModelInvalid("categories_unavailable")
	}
	for _, profile := range categories.RoleProfiles {
		if !workerModelContains(categories.Profiles, profile) {
			return categories, workerModelInvalid("categories_unavailable")
		}
	}
	for _, key := range []string{"provider_bytes", "model_bytes", "role_bytes"} {
		if categories.IdentityLimits[key] <= 0 {
			return categories, workerModelInvalid("categories_unavailable")
		}
	}
	return categories, nil
}

func workerModelContains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func workerModelFields(value any, required, optional []string) (map[string]any, error) {
	record, ok := value.(map[string]any)
	if !ok {
		return nil, workerModelInvalid("invalid_structure")
	}
	for _, name := range required {
		if _, present := record[name]; !present {
			return nil, workerModelInvalid("invalid_structure")
		}
	}
	for name := range record {
		if !workerModelContains(required, name) && !workerModelContains(optional, name) {
			return nil, workerModelInvalid("invalid_structure")
		}
	}
	return record, nil
}

func workerModelIdentity(value any, kind string, categories workerModelCategories) (string, error) {
	text, ok := value.(string)
	if !ok || text == "" || !utf8.ValidString(text) || strings.TrimSpace(text) != text || len(text) > categories.IdentityLimits[kind+"_bytes"] || (kind == "provider" && strings.Contains(text, "/")) {
		return "", workerModelInvalid("invalid_identity")
	}
	for _, r := range text {
		if !(unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsNumber(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) || unicode.Is(unicode.Zs, r)) {
			return "", workerModelInvalid("invalid_identity")
		}
	}
	return text, nil
}

func parseWorkerModelSelection(value any, categories workerModelCategories) (workerModelSelection, error) {
	var choice workerModelSelection
	record, ok := value.(map[string]any)
	if !ok {
		return choice, workerModelInvalid("invalid_selection")
	}
	mode, present := record["mode"]
	if !present {
		return choice, workerModelInvalid("invalid_selection")
	}
	if mode == "inherit" {
		if _, err := workerModelFields(record, []string{"mode"}, nil); err != nil {
			return choice, err
		}
		return workerModelSelection{Mode: "inherit"}, nil
	}
	if mode != "model" {
		return choice, workerModelInvalid("invalid_mode")
	}
	if _, err := workerModelFields(record, []string{"mode", "provider", "model"}, nil); err != nil {
		return choice, err
	}
	provider, err := workerModelIdentity(record["provider"], "provider", categories)
	if err != nil {
		return choice, err
	}
	model, err := workerModelIdentity(record["model"], "model", categories)
	if err != nil {
		return choice, err
	}
	return workerModelSelection{Mode: "model", Provider: provider, Model: model}, nil
}

func validateWorkerModelsJSON(raw []byte, categories workerModelCategories) (workerModels, error) {
	preference := workerModels{SchemaVersion: 1, Profiles: map[string]workerModelSelection{}, RoleOverrides: map[string]workerModelOverride{}, Present: raw != nil}
	for _, name := range categories.Profiles {
		preference.Profiles[name] = workerModelSelection{Mode: "inherit"}
	}
	if raw == nil {
		return preference, nil
	}
	if !json.Valid(raw) {
		return workerModels{}, workerModelInvalid("invalid_structure")
	}
	if !validWorkerModelJSONUnicode(raw) {
		return workerModels{}, workerModelInvalid("invalid_identity")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if decoder.Decode(&value) != nil {
		return workerModels{}, workerModelInvalid("invalid_structure")
	}
	record, err := workerModelFields(value, []string{"schema_version", "profiles"}, []string{"role_overrides"})
	if err != nil {
		return workerModels{}, err
	}
	version, ok := record["schema_version"].(json.Number)
	number, numberErr := version.Float64()
	if !ok || numberErr != nil || number != 1 {
		return workerModels{}, workerModelInvalid("invalid_schema_version")
	}
	profiles, err := workerModelFields(record["profiles"], categories.Profiles, nil)
	if err != nil {
		return workerModels{}, err
	}
	for _, name := range categories.Profiles {
		choice, err := parseWorkerModelSelection(profiles[name], categories)
		if err != nil {
			return workerModels{}, err
		}
		preference.Profiles[name] = choice
	}
	overrides := map[string]any{}
	if value, present := record["role_overrides"]; present {
		var ok bool
		overrides, ok = value.(map[string]any)
		if !ok {
			return workerModels{}, workerModelInvalid("invalid_role_overrides")
		}
	}
	for role, value := range overrides {
		if _, err := workerModelIdentity(role, "role", categories); err != nil {
			return workerModels{}, err
		}
		if workerModelContains(categories.ExcludedRoles, role) {
			return workerModels{}, workerModelInvalid("primary_role_excluded")
		}
		if _, known := categories.RoleProfiles[role]; !known {
			return workerModels{}, workerModelInvalid("unknown_role")
		}
		if record, ok := value.(map[string]any); ok {
			if profile, present := record["profile"]; present {
				if _, err := workerModelFields(record, []string{"profile"}, nil); err != nil {
					return workerModels{}, err
				}
				profileName, ok := profile.(string)
				if !ok || !workerModelContains(categories.Profiles, profileName) {
					return workerModels{}, workerModelInvalid("invalid_profile_reference")
				}
				preference.RoleOverrides[role] = workerModelOverride{Profile: profileName}
				continue
			}
		}
		choice, err := parseWorkerModelSelection(value, categories)
		if err != nil {
			return workerModels{}, err
		}
		preference.RoleOverrides[role] = workerModelOverride{Mode: choice.Mode, Provider: choice.Provider, Model: choice.Model}
	}
	return preference, nil
}

func resolveWorkerModelSelection(preference workerModels, role string, categories workerModelCategories) (workerModelResolution, error) {
	if _, err := workerModelIdentity(role, "role", categories); err != nil {
		return workerModelResolution{}, err
	}
	if workerModelContains(categories.ExcludedRoles, role) {
		return workerModelResolution{}, workerModelInvalid("primary_role_excluded")
	}
	profile := categories.DefaultProfile
	if assigned, known := categories.RoleProfiles[role]; known {
		profile = assigned
	}
	if override, present := preference.RoleOverrides[role]; present {
		if override.Profile != "" {
			profile = override.Profile
			return workerModelResolution{Selection: preference.Profiles[profile], Profile: profile, Source: "role_override"}, nil
		}
		return workerModelResolution{Selection: workerModelSelection{Mode: override.Mode, Provider: override.Provider, Model: override.Model}, Profile: profile, Source: "role_override"}, nil
	}
	source := "inherit"
	if preference.Present {
		source = "profile"
	}
	return workerModelResolution{Selection: preference.Profiles[profile], Profile: profile, Source: source}, nil
}

// encoding/json replaces malformed UTF-8 and lone surrogates; identities must
// instead retain their exact supplied value, matching the JavaScript contract.
func validWorkerModelJSONUnicode(raw []byte) bool {
	if !utf8.Valid(raw) {
		return false
	}
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' {
			continue
		}
		i++
		if raw[i] != 'u' {
			continue
		}
		point, _ := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		i += 4
		if point >= 0xdc00 && point <= 0xdfff {
			return false
		}
		if point >= 0xd800 && point <= 0xdbff {
			if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
				return false
			}
			low, err := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if err != nil || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 6
		}
	}
	return true
}
