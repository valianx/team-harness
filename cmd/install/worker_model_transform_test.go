package main

import (
	"encoding/json"
	"os"
	"testing"
)

type workerModelTransformCase struct {
	Name            string          `json:"name"`
	Role            string          `json:"role"`
	LegacyProvider  string          `json:"legacy_provider"`
	Preferences     json.RawMessage `json:"preferences"`
	Source          string          `json:"source"`
	ExistingContent string          `json:"existing_content"`
	ExpectedOutput  string          `json:"expected_output"`
}

func TestWorkerModelTransformSharedFixture(t *testing.T) {
	raw, err := os.ReadFile("../../tests/fixtures/worker-models.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []workerModelTransformCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	categories := workerCategoriesForTest(t)
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			preference, err := validateWorkerModelsJSON(tc.Preferences, categories)
			if err != nil {
				t.Fatal(err)
			}
			got, err := opencodeWorkerModelTransform([]byte(tc.Source), TransformKindAgent, "agents/"+tc.Role+".md", preference, categories, tc.LegacyProvider, []byte(tc.ExistingContent))
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tc.ExpectedOutput {
				t.Fatalf("independent expected transform mismatch:\nwant:\n%s\ngot:\n%s", tc.ExpectedOutput, got)
			}
		})
	}
}
