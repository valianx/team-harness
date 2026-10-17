package main

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

const bootstrapPayload = "#!/bin/sh\nprintf '%s\\000' \"$@\" > \"$TH_TEST_BOOTSTRAP_ARGS\"\nprintf 'executed\\n' > \"$TH_TEST_BOOTSTRAP_MARKER\"\nexit 37\n"

var unixBootstrapScripts = []struct {
	file       string
	args       []string
	wantPrefix []string
}{
	{"install.sh", []string{"apply", "--runtime", "opencode", "--scope", "global"}, []string{"apply", "--runtime", "opencode", "--scope", "global"}},
	{"install-opencode.sh", nil, []string{"apply", "--runtime", "opencode", "--scope", "global"}},
	{"update-opencode.sh", nil, []string{"update", "--runtime", "opencode", "--scope", "global"}},
}

type unixBootstrapFixture struct {
	root     string
	download string
	marker   string
	args     string
	requests string
}

func newUnixBootstrapFixture(t *testing.T, manifest, payload string, failChecksumDownload bool) unixBootstrapFixture {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("POSIX bootstrap; native Windows launchers have separate tests")
	}
	root := t.TempDir()
	fixture := unixBootstrapFixture{
		root: root, download: filepath.Join(root, "download"), marker: filepath.Join(root, "executed"),
		args: filepath.Join(root, "args"), requests: filepath.Join(root, "requests"),
	}
	bin := filepath.Join(root, "bin")
	for _, directory := range []string{bin, fixture.download} {
		if err := os.Mkdir(directory, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	curl := `#!/bin/sh
output=""
url=""
previous=""
for argument in "$@"; do
    if [ "$previous" = "-o" ]; then output="$argument"; fi
    case "$argument" in https://*) url="$argument";; esac
    previous="$argument"
done
printf '%s\n' "$url" >> "$TH_TEST_BOOTSTRAP_REQUESTS"
case "$url" in
    https://github.com/valianx/team-harness/releases/latest/download/SHA256SUMS)
        [ "$TH_TEST_BOOTSTRAP_FAIL_CHECKSUM" = false ] || exit 22
        cp "$TH_TEST_BOOTSTRAP_MANIFEST" "$output"
        ;;
    https://github.com/valianx/team-harness/releases/latest/download/install-linux-amd64)
        [ "$TH_TEST_BOOTSTRAP_FAIL_BINARY" = false ] || exit 22
        cp "$TH_TEST_BOOTSTRAP_PAYLOAD" "$output"
        ;;
    *) exit 91;;
esac
`
	files := map[string]string{
		filepath.Join(bin, "curl"):      curl,
		filepath.Join(bin, "uname"):     "#!/bin/sh\ncase \"$1\" in -s) echo Linux;; -m) echo x86_64;; *) exit 1;; esac\n",
		filepath.Join(root, "manifest"): manifest,
		filepath.Join(root, "payload"):  payload,
		fixture.requests:                "",
	}
	for path, contents := range files {
		if err := os.WriteFile(path, []byte(contents), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	for key, value := range map[string]string{
		"PATH":                            bin + string(os.PathListSeparator) + os.Getenv("PATH"),
		"TMPDIR":                          fixture.download,
		"OPENCODE_CONFIG_DIR":             filepath.Join(root, "selected root ü"),
		"MEMORY_MCP_URL":                  "",
		"TH_TEST_BOOTSTRAP_MANIFEST":      filepath.Join(root, "manifest"),
		"TH_TEST_BOOTSTRAP_PAYLOAD":       filepath.Join(root, "payload"),
		"TH_TEST_BOOTSTRAP_MARKER":        fixture.marker,
		"TH_TEST_BOOTSTRAP_ARGS":          fixture.args,
		"TH_TEST_BOOTSTRAP_REQUESTS":      fixture.requests,
		"TH_TEST_BOOTSTRAP_FAIL_CHECKSUM": fmt.Sprint(failChecksumDownload),
		"TH_TEST_BOOTSTRAP_FAIL_BINARY":   "false",
	} {
		t.Setenv(key, value)
	}
	return fixture
}

func (fixture unixBootstrapFixture) run(t *testing.T, script string, args []string) (int, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "sh", append([]string{filepath.Join("..", "..", "bin", script)}, args...)...)
	output, err := command.CombinedOutput()
	if ctx.Err() != nil {
		t.Fatalf("bootstrap exceeded deadline: %s", output)
	}
	if err == nil {
		return 0, string(output)
	}
	if exit, ok := err.(*exec.ExitError); ok {
		return exit.ExitCode(), string(output)
	}
	t.Fatalf("could not launch bootstrap: %v", err)
	return -1, string(output)
}

func (fixture unixBootstrapFixture) assertCleaned(t *testing.T) {
	t.Helper()
	entries, err := os.ReadDir(fixture.download)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("bootstrap left temporary downloads: %v", entries)
	}
}

func TestUnixBootstrapsRejectUnverifiedPayloads(t *testing.T) {
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(bootstrapPayload)))
	for _, script := range unixBootstrapScripts {
		for _, scenario := range []struct {
			name         string
			manifest     string
			payload      string
			failDownload bool
		}{
			{"altered binary", digest + "  install-linux-amd64\n", bootstrapPayload + "# altered\n", false},
			{"missing asset", digest + "  install-darwin-arm64\n", bootstrapPayload, false},
			{"suffix asset", digest + "  install-linux-amd64.backup\n", bootstrapPayload, false},
			{"checksum download failure", digest + "  install-linux-amd64\n", bootstrapPayload, true},
		} {
			t.Run(script.file+"/"+scenario.name, func(t *testing.T) {
				fixture := newUnixBootstrapFixture(t, scenario.manifest, scenario.payload, scenario.failDownload)
				code, output := fixture.run(t, script.file, script.args)
				if code != 1 {
					t.Errorf("unverified download exit=%d, want 1: %s", code, output)
				}
				if _, err := os.Stat(fixture.marker); !os.IsNotExist(err) {
					t.Errorf("unverified payload was executed: marker stat=%v", err)
				}
				fixture.assertCleaned(t)
			})
		}
	}
}

func TestUnixBootstrapsExecuteVerifiedPayloadAndPreserveArguments(t *testing.T) {
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(bootstrapPayload)))
	for _, script := range unixBootstrapScripts {
		for _, scenario := range []struct{ name, digest string }{
			{"lowercase", digest}, {"uppercase", strings.ToUpper(digest)},
		} {
			t.Run(script.file+"/"+scenario.name, func(t *testing.T) {
				fixture := newUnixBootstrapFixture(t, scenario.digest+"  install-linux-amd64\n", bootstrapPayload, false)
				forwarded := []string{"--opencode-dir", filepath.Join(fixture.root, "selected root ü"), "--non-interactive", "", "literal $(printf unsafe) `printf unsafe` * ' \" ; &"}
				wantArgs := strings.Join(append(append([]string{}, script.wantPrefix...), forwarded...), "\x00") + "\x00"
				args := append(append([]string{}, script.args...), forwarded...)
				code, output := fixture.run(t, script.file, args)
				if code != 37 {
					t.Errorf("verified child exit=%d, want 37: %s", code, output)
				}
				actual, err := os.ReadFile(fixture.args)
				if err != nil {
					t.Fatal(err)
				}
				if string(actual) != wantArgs {
					t.Errorf("forwarded argv=%q, want %q", actual, wantArgs)
				}
				requests, err := os.ReadFile(fixture.requests)
				if err != nil {
					t.Fatal(err)
				}
				wantRequests := "https://github.com/valianx/team-harness/releases/latest/download/SHA256SUMS\nhttps://github.com/valianx/team-harness/releases/latest/download/install-linux-amd64\n"
				if string(requests) != wantRequests {
					t.Errorf("release requests=%q, want %q", requests, wantRequests)
				}
				fixture.assertCleaned(t)
			})
		}
	}
}

func TestUnixBootstrapsBinaryDownloadFailureNeverExecutesChild(t *testing.T) {
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(bootstrapPayload)))
	for _, script := range unixBootstrapScripts {
		t.Run(script.file, func(t *testing.T) {
			fixture := newUnixBootstrapFixture(t, digest+"  install-linux-amd64\n", bootstrapPayload, false)
			t.Setenv("TH_TEST_BOOTSTRAP_FAIL_BINARY", "true")
			code, output := fixture.run(t, script.file, script.args)
			if code != 1 {
				t.Errorf("failed binary download exit=%d, want 1: %s", code, output)
			}
			if _, err := os.Stat(fixture.marker); !os.IsNotExist(err) {
				t.Errorf("failed binary download executed the child: marker stat=%v", err)
			}
			requests, err := os.ReadFile(fixture.requests)
			if err != nil {
				t.Fatal(err)
			}
			wantRequests := "https://github.com/valianx/team-harness/releases/latest/download/SHA256SUMS\nhttps://github.com/valianx/team-harness/releases/latest/download/install-linux-amd64\n"
			if string(requests) != wantRequests {
				t.Errorf("release requests=%q, want %q", requests, wantRequests)
			}
			fixture.assertCleaned(t)
		})
	}
}

func TestUnixBootstrapsWithoutHashToolsNeverExecutesChild(t *testing.T) {
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(bootstrapPayload)))
	for _, script := range unixBootstrapScripts {
		t.Run(script.file, func(t *testing.T) {
			fixture := newUnixBootstrapFixture(t, digest+"  install-linux-amd64\n", bootstrapPayload, false)
			bin := filepath.Join(fixture.root, "bin")
			for _, utility := range []string{"awk", "chmod", "cp", "mktemp", "rm", "sh", "tr"} {
				path, err := exec.LookPath(utility)
				if err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(path, filepath.Join(bin, utility)); err != nil {
					t.Fatal(err)
				}
			}
			t.Setenv("PATH", bin)
			for _, hashTool := range []string{"sha256sum", "shasum"} {
				if _, err := exec.LookPath(hashTool); err == nil {
					t.Fatalf("isolated PATH unexpectedly contains %s", hashTool)
				}
			}
			code, output := fixture.run(t, script.file, script.args)
			if code != 1 {
				t.Errorf("missing checksum tools exit=%d, want 1: %s", code, output)
			}
			if _, err := os.Stat(fixture.marker); !os.IsNotExist(err) {
				t.Errorf("missing checksum tools executed the child: marker stat=%v", err)
			}
			requests, err := os.ReadFile(fixture.requests)
			if err != nil {
				t.Fatal(err)
			}
			if len(requests) != 0 {
				t.Errorf("missing checksum tools reached download: %s", requests)
			}
			fixture.assertCleaned(t)
		})
	}
}

func TestUnixBootstrapWithoutSubcommandNeverDownloads(t *testing.T) {
	for _, scenario := range []struct {
		name string
		args []string
	}{
		{"no arguments", nil}, {"help", []string{"--help"}},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			fixture := newUnixBootstrapFixture(t, "", bootstrapPayload, true)
			code, output := fixture.run(t, "install.sh", scenario.args)
			if code != 0 {
				t.Errorf("native guidance exit=%d, want 0: %s", code, output)
			}
			requests, err := os.ReadFile(fixture.requests)
			if err != nil {
				t.Fatal(err)
			}
			if len(requests) != 0 {
				t.Errorf("native guidance downloaded release assets: %s", requests)
			}
			if _, err := os.Stat(fixture.marker); !os.IsNotExist(err) {
				t.Errorf("native guidance executed the installer: marker stat=%v", err)
			}
			fixture.assertCleaned(t)
		})
	}
}
