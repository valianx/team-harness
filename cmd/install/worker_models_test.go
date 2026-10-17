package main

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func workerCategoriesForTest(t *testing.T) workerModelCategories {
	t.Helper()
	categories, err := readWorkerModelCategories(os.DirFS("../.."))
	if err != nil {
		t.Fatal(err)
	}
	return categories
}

func workerPreferenceForTest(general string) []byte {
	return []byte(`{"schema_version":1,"profiles":{"reasoning":{"mode":"inherit"},"general":` + general + `,"mechanical":{"mode":"inherit"}}}`)
}

func TestWorkerModelsPresenceAndPrecedence(t *testing.T) {
	categories := workerCategoriesForTest(t)
	tests := []struct {
		name, role, input, profile, source, model string
		present                                   bool
	}{
		{"absent", "implementer", "", "general", "inherit", "", false},
		{"explicit inheritance", "implementer", string(workerPreferenceForTest(`{"mode":"inherit"}`)), "general", "profile", "", true},
		{"category model", "implementer", string(workerPreferenceForTest(`{"mode":"model","provider":"native","model":"owner/model"}`)), "general", "profile", "owner/model", true},
		{"role selection", "architect", `{"schema_version":1,"profiles":{"reasoning":{"mode":"model","provider":"native","model":"reasoning"},"general":{"mode":"inherit"},"mechanical":{"mode":"inherit"}},"role_overrides":{"architect":{"mode":"model","provider":"other","model":"explicit"}}}`, "reasoning", "role_override", "explicit", true},
		{"role profile", "architect", `{"schema_version":1,"profiles":{"reasoning":{"mode":"model","provider":"native","model":"reasoning"},"general":{"mode":"model","provider":"native","model":"general"},"mechanical":{"mode":"inherit"}},"role_overrides":{"architect":{"profile":"general"}}}`, "general", "role_override", "general", true},
		{"role inherit", "architect", `{"schema_version":1,"profiles":{"reasoning":{"mode":"model","provider":"native","model":"reasoning"},"general":{"mode":"inherit"},"mechanical":{"mode":"inherit"}},"role_overrides":{"architect":{"mode":"inherit"}}}`, "reasoning", "role_override", "", true},
		{"unknown worker category", "custom-worker", "", "general", "inherit", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var raw []byte
			if tc.present {
				raw = []byte(tc.input)
			}
			preference, err := validateWorkerModelsJSON(raw, categories)
			if err != nil {
				t.Fatal(err)
			}
			before, _ := json.Marshal(preference)
			got, err := resolveWorkerModelSelection(preference, tc.role, categories)
			if err != nil {
				t.Fatal(err)
			}
			if preference.Present != tc.present || got.Profile != tc.profile || got.Source != tc.source || got.Selection.Model != tc.model {
				t.Fatalf("presence/resolution = %t %+v; want %t %s/%s/%s", preference.Present, got, tc.present, tc.profile, tc.source, tc.model)
			}
			wantMode := "inherit"
			if tc.model != "" {
				wantMode = "model"
			}
			if got.Selection.Mode != wantMode {
				t.Fatalf("selection mode = %q, want %q", got.Selection.Mode, wantMode)
			}
			after, _ := json.Marshal(preference)
			if string(after) != string(before) || (tc.present && string(raw) != tc.input) {
				t.Fatal("resolution mutated its preference or supplied input")
			}
		})
	}
}

func TestWorkerModelsWholeObjectValidation(t *testing.T) {
	categories := workerCategoriesForTest(t)
	base := string(workerPreferenceForTest(`{"mode":"inherit"}`))
	tests := []struct{ name, raw, code string }{
		{"present null", `null`, "invalid_structure"},
		{"array", `[]`, "invalid_structure"},
		{"empty", `{}`, "invalid_structure"},
		{"wrong version", strings.Replace(base, `"schema_version":1`, `"schema_version":2`, 1), "invalid_schema_version"},
		{"boolean version", strings.Replace(base, `"schema_version":1`, `"schema_version":true`, 1), "invalid_schema_version"},
		{"missing category", `{"schema_version":1,"profiles":{"general":{"mode":"inherit"},"mechanical":{"mode":"inherit"}}}`, "invalid_structure"},
		{"unknown category", strings.Replace(base, `"general":`, `"synthetic-canary":`, 1), "invalid_structure"},
		{"unknown root field", strings.TrimSuffix(base, "}") + `,"synthetic-canary":true}`, "invalid_structure"},
		{"unknown selection field", string(workerPreferenceForTest(`{"mode":"inherit","synthetic-canary":true}`)), "invalid_structure"},
		{"invalid mode", string(workerPreferenceForTest(`{"mode":"synthetic-canary"}`)), "invalid_mode"},
		{"null selection", string(workerPreferenceForTest(`null`)), "invalid_selection"},
		{"primary override", strings.TrimSuffix(base, "}") + `,"role_overrides":{"orchestrator":{"mode":"inherit"}}}`, "primary_role_excluded"},
		{"unknown override", strings.TrimSuffix(base, "}") + `,"role_overrides":{"synthetic-canary":{"mode":"inherit"}}}`, "unknown_role"},
		{"wrong profile reference", strings.TrimSuffix(base, "}") + `,"role_overrides":{"tester":{"profile":"synthetic-canary"}}}`, "invalid_profile_reference"},
		{"conflicting override", strings.TrimSuffix(base, "}") + `,"role_overrides":{"tester":{"profile":"general","mode":"inherit"}}}`, "invalid_structure"},
		{"null override map", strings.TrimSuffix(base, "}") + `,"role_overrides":null}`, "invalid_role_overrides"},
		{"trailing document", base + `{}`, "invalid_structure"},
		{"unpaired high surrogate", string(workerPreferenceForTest(`{"mode":"model","provider":"native","model":"\ud800"}`)), "invalid_identity"},
		{"unpaired low surrogate", string(workerPreferenceForTest(`{"mode":"model","provider":"native","model":"\udfff"}`)), "invalid_identity"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateWorkerModelsJSON([]byte(tc.raw), categories)
			if err == nil || err.Error() != "worker_models_"+tc.code {
				t.Fatalf("error = %v, want static code %s", err, tc.code)
			}
			if strings.Contains(err.Error(), "synthetic-canary") {
				t.Fatal("diagnostic echoed submitted content")
			}
		})
	}
	for _, role := range categories.ExcludedRoles {
		preference, err := validateWorkerModelsJSON(nil, categories)
		if err != nil {
			t.Fatal(err)
		}
		_, err = resolveWorkerModelSelection(preference, role, categories)
		if err == nil || err.Error() != "worker_models_primary_role_excluded" {
			t.Fatalf("reserved role %q resolved: %v", role, err)
		}
	}
}

func TestWorkerModelsExactGraphicIdentitiesAndByteLimits(t *testing.T) {
	categories := workerCategoriesForTest(t)
	tests := []struct {
		name, provider, model string
		valid                 bool
	}{
		{"ordinary Unicode and punctuation", "native-café", `owner/model \"東京\" \\ variant`, true},
		{"provider byte boundary", strings.Repeat("é", 64), "model", true},
		{"provider byte overflow", strings.Repeat("é", 64) + "a", "model", false},
		{"model byte boundary", "native", strings.Repeat("é", 128), true},
		{"model byte overflow", "native", strings.Repeat("é", 128) + "a", false},
		{"graphic interior space", "native", "model\u00a0variant", true},
		{"leading space", "native", " model", false},
		{"trailing NBSP", "native", "model\u00a0", false},
		{"provider slash", "native/other", "model", false},
		{"control", "native", "model\nvariant", false},
		{"non-graphic format", "native", "model\ufeffvariant", false},
		{"invalid UTF8", "native", string([]byte{0xff}), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			choice := workerModelSelection{Mode: "model", Provider: tc.provider, Model: tc.model}
			raw, err := json.Marshal(choice)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(tc.name, "invalid UTF8") {
				preference, err := validateWorkerModelsJSON(workerPreferenceForTest(string(raw)), categories)
				if tc.valid && (err != nil || !reflect.DeepEqual(preference.Profiles["general"], choice)) {
					t.Fatalf("valid exact identity changed/refused: %+v %v", preference, err)
				}
				if !tc.valid && (err == nil || err.Error() != "worker_models_invalid_identity") {
					t.Fatalf("invalid identity error = %v", err)
				}
				return
			}
			invalidRaw := workerPreferenceForTest(`{"mode":"model","provider":"native","model":"` + string([]byte{0xff}) + `"}`)
			if _, err := validateWorkerModelsJSON(invalidRaw, categories); err == nil || err.Error() != "worker_models_invalid_identity" {
				t.Fatalf("invalid UTF8 error = %v", err)
			}
		})
	}
}
