package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestLifecycleHelpPreservesInstallation(t *testing.T) {
	const guard = "TH_TEST_LIFECYCLE_HELP_ARGS"
	if raw := os.Getenv(guard); raw != "" {
		var args []string
		if err := json.Unmarshal([]byte(raw), &args); err != nil {
			t.Fatal(err)
		}
		os.Args = append([]string{"install"}, args...)
		main()
		os.Exit(0)
	}
	for _, host := range []string{"opencode", "codex"} {
		for _, action := range [][]string{{"plan"}, {"apply"}, {"update"}, {"uninstall"}, {"setup", "models"}} {
			for _, helpArgs := range [][]string{{"--help"}, {"-h"}, {"--runtime", "--help"}, {"--runtime", "-h"}} {
				if len(helpArgs) > 1 && action[0] != "apply" {
					continue
				}
				t.Run(host+"/"+strings.Join(action, " ")+"/"+strings.Join(helpArgs, " "), func(t *testing.T) {
					data := isolatedOpencodeLedger(t)
					root := filepath.Join(data, "native root")
					if err := os.MkdirAll(root, 0o700); err != nil {
						t.Fatal(err)
					}
					var placer Placer = newOpencodePlacerAt(root)
					component, asset, directoryFlag := "agent-implementer", "agents/implementer.md", "--opencode-dir"
					if host == "codex" {
						placer = newCodexPlacerAt(root)
						component, asset, directoryFlag = "codex-agent-implementer", "agents/implementer.toml", "--codex-dir"
					}
					configureLedger(placer)
					components := []ComponentManifest{{Component: component, Source: "fixture", Kind: "agent",
						Emits: OwnershipTags{Files: []string{"{config_root}/" + asset}}}}
					diff, err := ComputePlan(nil, components, []string{component}, placer,
						fstest.MapFS{"fixture": {Data: []byte("existing managed asset\n")}}, nil)
					if err != nil {
						t.Fatal(err)
					}
					if err := ApplyPlan(diff, placer); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(filepath.Join(root, ".team-harness.json"), []byte(`{"operator_key":"retained"}`), 0o600); err != nil {
						t.Fatal(err)
					}
					args := append(append([]string{}, action...), "--runtime", host, directoryFlag, root, "--non-interactive")
					args = append(args, helpArgs...)
					raw, err := json.Marshal(args)
					if err != nil {
						t.Fatal(err)
					}
					before := snapshotFiles(t, data)
					ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					defer cancel()
					command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestLifecycleHelpPreservesInstallation$")
					command.Env = append(os.Environ(), guard+"="+string(raw), "MEMORY_MCP_URL=", "CONTEXT7_API_KEY=", "OPENCODE_CONFIG_DIR="+root)
					output, err := command.CombinedOutput()
					if ctx.Err() != nil {
						t.Fatalf("help exceeded its deadline: %v", ctx.Err())
					}
					if err != nil || len(output) == 0 {
						t.Errorf("help should return success and guidance: err=%v output=%s", err, output)
					}
					if !reflect.DeepEqual(before, snapshotFiles(t, data)) {
						t.Error("help changed managed assets, preferences or ownership records")
					}
				})
			}
		}
	}
}
