package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func catalogRecordForTest(provider, id string) string {
	return provider + "/" + id + "\n{\n  \"id\": " + strconv.Quote(id) + ",\n  \"providerID\": " + strconv.Quote(provider) + ",\n  \"capabilities\": {\"reasoning\": true},\n  \"api\": {\"id\": \"not-the-native-model-id\"},\n  \"ignored\": {\"quoted\": \"brace } and \\\" quote\", \"nested\": [1, {\"ok\": true}]}\n}\n"
}

func TestOpencodeCatalogCompleteVerboseRecords(t *testing.T) {
	categories := workerCategoriesForTest(t)
	input := catalogRecordForTest("native", "owner/model") + catalogRecordForTest("other", "café-東京")
	models, err := parseOpencodeModelCatalog([]byte(input), defaultOpencodeCatalogLimits(), categories)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 || models[0].Provider != "native" || models[0].ID != "owner/model" || !models[0].Reasoning || models[1].Provider != "other" || models[1].ID != "café-東京" {
		t.Fatalf("native identities/capabilities = %+v", models)
	}
	for _, newline := range []string{"\n", "\r\n"} {
		withoutProvider := "native/model" + newline + `{ "id":"model", "capabilities":{"reasoning":false} }` + newline
		got, err := parseOpencodeModelCatalog([]byte(withoutProvider), defaultOpencodeCatalogLimits(), categories)
		if err != nil || len(got) != 1 || got[0].Provider != "native" || got[0].Reasoning {
			t.Fatalf("header-authoritative provider = %+v, %v", got, err)
		}
	}
	empty, err := parseOpencodeModelCatalog([]byte(" \r\n\t"), defaultOpencodeCatalogLimits(), categories)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty catalog = %+v, %v", empty, err)
	}
}

func TestOpencodeCatalogRejectsIncompleteOrContradictoryRecords(t *testing.T) {
	categories := workerCategoriesForTest(t)
	record := catalogRecordForTest("native", "model")
	tests := []struct{ name, input string }{
		{"truncated JSON", strings.TrimSuffix(record, "}\n")},
		{"header without JSON", "native/model\n"},
		{"JSON without header", `{"id":"model","providerID":"native"}`},
		{"NDJSON assumption", "native/model\n{\"id\":\"model\"\n{\"capabilities\":{}}\n"},
		{"array metadata", "native/model\n[]\n"},
		{"null metadata", "native/model\nnull\n"},
		{"model mismatch", strings.Replace(record, `"id": "model"`, `"id": "different"`, 1)},
		{"provider mismatch", strings.Replace(record, `"providerID": "native"`, `"providerID": "different"`, 1)},
		{"invalid identity", catalogRecordForTest("native", " synthetic-canary")},
		{"leading header whitespace", " " + record},
		{"malformed Unicode model metadata", "native/�\n{\"id\":\"\\ud800\"}\n"},
		{"malformed Unicode provider metadata", "�/model\n{\"id\":\"model\",\"providerID\":\"\\ud800\"}\n"},
		{"malformed trailing record", record + "synthetic-canary\n"},
		{"duplicate identity", record + record},
		{"missing model metadata", "native/model\n{}\n"},
		{"invalid capabilities", "native/model\n{\"id\":\"model\",\"capabilities\":\"synthetic-canary\"}\n"},
		{"no record delimiter", strings.TrimSuffix(record, "\n") + record},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			models, err := parseOpencodeModelCatalog([]byte(tc.input), defaultOpencodeCatalogLimits(), categories)
			if err == nil || models != nil {
				t.Fatalf("invalid catalog returned partial/empty success: %+v, %v", models, err)
			}
			if strings.Contains(err.Error(), "synthetic-canary") {
				t.Fatal("parser error echoed catalog content")
			}
		})
	}
}

func catalogExecutableForTest(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	name := "literal CLI with spaces"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	destination := filepath.Join(root, name)
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.Open(executable)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	target, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		t.Fatal(err)
	}
	_, copyErr := io.Copy(target, source)
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil {
		t.Fatalf("fixture executable copy: %v %v", copyErr, closeErr)
	}
	t.Setenv("TH_CATALOG_FIXTURE", "1")
	return destination
}

func TestOpencodeCatalogLiteralProbeAndFailureDistinctions(t *testing.T) {
	executable := catalogExecutableForTest(t)
	categories := workerCategoriesForTest(t)
	argsPath := filepath.Join(t.TempDir(), "args.json")
	t.Setenv("TH_CATALOG_ARGS", argsPath)
	tests := []struct{ name, mode, code string }{
		{"native metadata", "valid", ""},
		{"valid empty", "empty", ""},
		{"nonzero exit", "failure", "catalog_unavailable"},
		{"malformed output", "malformed", "catalog_invalid"},
		{"bounded timeout", "hold", "catalog_timeout"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("TH_CATALOG_MODE", tc.mode)
			limits := defaultOpencodeCatalogLimits()
			if tc.mode == "hold" {
				limits.Timeout = 100 * time.Millisecond
			}
			started := time.Now()
			models, err := probeOpencodeModelCatalog(context.Background(), executable, t.TempDir(), limits, categories)
			if tc.code == "" && (err != nil || (tc.mode == "valid" && (len(models) != 1 || models[0].ID != "owner/model"))) {
				t.Fatalf("successful catalog = %+v, %v", models, err)
			}
			if tc.code != "" && (err == nil || err.Error() != "worker_models_"+tc.code || models != nil) {
				t.Fatalf("failure classification = %+v %v, want %s", models, err, tc.code)
			}
			if time.Since(started) > 3*time.Second {
				t.Fatal("bounded native probe exceeded independent fixture deadline")
			}
			args, readErr := os.ReadFile(argsPath)
			if readErr != nil || string(args) != `["models","--verbose"]` {
				t.Fatalf("literal native argv = %s, %v", args, readErr)
			}
		})
	}
	_, err := probeOpencodeModelCatalog(context.Background(), filepath.Join(t.TempDir(), "missing"), t.TempDir(), defaultOpencodeCatalogLimits(), categories)
	if err == nil || err.Error() != "worker_models_catalog_launcher_unavailable" {
		t.Fatalf("missing executable error = %v", err)
	}
}

func TestOpencodeCatalogDeclaredBoundaries(t *testing.T) {
	executable := catalogExecutableForTest(t)
	categories := workerCategoriesForTest(t)
	limits := defaultOpencodeCatalogLimits()
	tests := []struct {
		name, mode, code string
		count            int
	}{
		{"stdout exact", "stdout", "", limits.StdoutBytes},
		{"stdout plus one", "stdout", "catalog_output_limit", limits.StdoutBytes + 1},
		{"stderr exact", "stderr", "", limits.StderrBytes},
		{"stderr plus one", "stderr", "catalog_diagnostics_limit", limits.StderrBytes + 1},
		{"records exact", "records", "", limits.Records},
		{"records plus one", "records", "catalog_record_limit", limits.Records + 1},
		{"record bytes exact", "record", "", limits.RecordBytes},
		{"record bytes plus one", "record", "catalog_record_size_limit", limits.RecordBytes + 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("TH_CATALOG_MODE", tc.mode)
			t.Setenv("TH_CATALOG_COUNT", strconv.Itoa(tc.count))
			models, err := probeOpencodeModelCatalog(context.Background(), executable, t.TempDir(), limits, categories)
			if tc.code == "" && (err != nil || len(models) == 0) {
				t.Fatalf("exact declared boundary refused: %d models, %v", len(models), err)
			}
			if tc.code != "" && (err == nil || err.Error() != "worker_models_"+tc.code || models != nil) {
				t.Fatalf("overflow = %d models, %v; want %s", len(models), err, tc.code)
			}
		})
	}
}

func init() {
	if os.Getenv("TH_CATALOG_FIXTURE") != "1" {
		return
	}
	args, _ := json.Marshal(os.Args[1:])
	if path := os.Getenv("TH_CATALOG_CONTEXT"); path != "" {
		cwd, _ := os.Getwd()
		context, _ := json.Marshal(map[string]string{"config_root": os.Getenv("OPENCODE_CONFIG_DIR"), "cwd": cwd})
		_ = os.WriteFile(path, context, 0o600)
	}
	if path := os.Getenv("TH_CATALOG_ARGS"); path != "" {
		_ = os.WriteFile(path, args, 0o600)
	}
	if string(args) != `["models","--verbose"]` {
		os.Exit(9)
	}
	count, _ := strconv.Atoi(os.Getenv("TH_CATALOG_COUNT"))
	valid := catalogRecordForTest("native", "owner/model")
	switch os.Getenv("TH_CATALOG_MODE") {
	case "valid":
		fmt.Print(valid)
	case "empty":
	case "failure":
		fmt.Fprint(os.Stderr, "synthetic-credential-canary")
		os.Exit(7)
	case "malformed":
		fmt.Print("synthetic-credential-canary\n{")
	case "hold":
		time.Sleep(time.Hour)
	case "stdout":
		fmt.Print(valid + strings.Repeat(" ", count-len(valid)))
	case "stderr":
		fmt.Print(valid)
		fmt.Fprint(os.Stderr, strings.Repeat("x", count))
	case "records":
		for i := 0; i < count; i++ {
			fmt.Print(catalogRecordForTest("native", fmt.Sprintf("model-%04d", i)))
		}
	case "record":
		object := `{"id":"model","padding":""}`
		object = strings.Replace(object, `"padding":""`, `"padding":"`+strings.Repeat("x", count-len(object))+`"`, 1)
		fmt.Print("native/model\n" + object + "\n")
	default:
		os.Exit(8)
	}
	os.Exit(0)
}
