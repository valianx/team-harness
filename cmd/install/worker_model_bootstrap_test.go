package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWorkerModelsUnixBootstrapRoutesOnlySupportedAction(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix launcher; native CMD and PowerShell routing have their own suite")
	}
	directory := t.TempDir()
	uname := filepath.Join(directory, "uname")
	if err := os.WriteFile(uname, []byte("#!/bin/sh\nprintf '%s\\n' TH_TEST_UNSUPPORTED\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []struct {
		name   string
		args   []string
		engine bool
	}{
		{"action first", []string{"setup", "models", "--runtime", "opencode", "--worker-models-file", "draft with spaces.json", "--dry-run"}, true},
		{"literal flags before action", []string{"--runtime=opencode", "--worker-models-file", "draft with spaces.json", "--opencode-cli", "/literal CLI", "--dry-run", "setup", "models"}, true},
		{"equals flags before action", []string{"--worker-models-file=draft.json", "--opencode-cli=/literal CLI", "setup", "models", "--yes"}, true},
		{"unsupported setup action", []string{"setup", "other"}, false},
		{"incomplete setup action", []string{"setup"}, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			command := exec.Command("sh", append([]string{"../../bin/install.sh"}, scenario.args...)...)
			command.Env = append(os.Environ(), "PATH="+directory+string(os.PathListSeparator)+os.Getenv("PATH"))
			output, err := command.CombinedOutput()
			if scenario.engine && (err == nil || !strings.Contains(strings.ToLower(string(output)), "th_test_unsupported")) {
				t.Fatalf("supported action never reached the native launcher gate: %s %v", output, err)
			}
			if !scenario.engine && (err != nil || strings.Contains(strings.ToLower(string(output)), "th_test_unsupported")) {
				t.Fatalf("unsupported setup action reached native download logic: %s %v", output, err)
			}
		})
	}
}
