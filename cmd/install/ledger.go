package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ledgerFilename is the default (claude-code) ownership ledger file.
const ledgerFilename = "ownership-ledger.jsonl"

// ledgerFilenameOpencode is the opencode runtime's ownership ledger file.
// Runtime-scoped filenames prevent a claude-code uninstall from removing
// opencode-owned files and vice-versa (Step 12 in the Work Plan).
const ledgerFilenameOpencode = "ownership-ledger-opencode.jsonl"

// ledgerFilenameCodex is stored below the selected Codex configuration root,
// not in the shared Team Harness data home.
const ledgerFilenameCodex = "ownership-ledger-codex.jsonl"

// activeLedgerFilename is the ledger filename for the current runtime.
// Initialized to the default (claude-code); call setActiveLedgerFilename
// before any ledger I/O when using the opencode runtime.
var activeLedgerFilename = ledgerFilename
var activeLedgerConfigRoot string
var activeLedgerRoot string

// setActiveLedgerFilename configures the ledger filename for the current
// runtime. Must be called before appendLedger / readLedger / isLedgerAbsent.
func setActiveLedgerFilename(name string) {
	activeLedgerFilename = name
}

func setActiveLedgerContext(name, configRoot string) {
	activeLedgerFilename = name
	activeLedgerConfigRoot = filepath.Clean(configRoot)
	activeLedgerRoot = ""
}

// configureLedger binds ledger I/O to the selected runtime and installation
// root. Codex keeps lifecycle state at <codex-root>/team-harness so project and
// global installations are isolated naturally.
func configureLedger(placer Placer) {
	name := ledgerFilename
	switch placer.Runtime() {
	case "opencode":
		name = ledgerFilenameOpencode
	case "codex":
		name = ledgerFilenameCodex
	}
	setActiveLedgerContext(name, placer.ConfigRoot())
	if placer.Runtime() == "codex" {
		activeLedgerRoot = filepath.Join(placer.ConfigRoot(), "team-harness")
	}
}

func activeLedgerDataHome() (string, error) {
	if activeLedgerRoot != "" {
		if err := lstatWalkPreResolution(activeLedgerRoot); err != nil {
			return "", fmt.Errorf("inspect runtime ledger root: %w", err)
		}
		return activeLedgerRoot, nil
	}
	return ResolveDataHome()
}

func openActiveLedger() (*os.File, error) {
	root, err := activeLedgerDataHome()
	if err != nil {
		return nil, err
	}
	if activeLedgerRoot != "" {
		root, err = secureAndVerify(root)
		if err != nil {
			return nil, err
		}
	}
	return openStateFilePlatform(root, activeLedgerFilename)
}

// LedgerEntry is one line of the ownership ledger. Self-contained: a malformed
// neighbour line never affects this entry's interpretation (SEC-06).
type LedgerEntry struct {
	TS            string        `json:"ts"`            // RFC3339 UTC
	Op            string        `json:"op"`            // install | update | remove
	Component     string        `json:"component"`     // component id
	Owns          OwnershipTags `json:"owns"`          // names + {config_root}-paths only (SEC-05)
	SchemaVersion int           `json:"schemaVersion"` // ledger-entry schema version == 1 (C-3)
	ConfigRoot    string        `json:"configRoot,omitempty"`
}

// ledgerError records a malformed ledger line (line number + reason).
type ledgerError struct {
	Line   int
	Reason string
}

func (e ledgerError) Error() string {
	return fmt.Sprintf("ledger line %d: %s", e.Line, e.Reason)
}

// appendLedger is the SINGLE write choke-point for the ownership ledger (SEC-04
// / SEC-DR-P3-1 / SEC-DR-P3-2). For each entry it:
//
//  1. Marshals to a compact JSON line + newline.
//  2. Runs the SEC-04 secret-scan + SEC-05 structural gate over the marshaled
//     bytes — fails closed and writes nothing on a violation.
//  3. Seeks to the end of the file (SEC-DR-P3-1: OpenStateFile opens O_RDWR
//     without O_APPEND; cursor is at offset 0 over an existing file — a write
//     without seek would overwrite line 1).
//  4. Writes the line to the end.
//
// SECURITY REQUIREMENT: appendLedger is the ONLY function that writes bytes to
// ownership-ledger.jsonl. ApplyPlan and Uninstall MUST call this function and
// MUST NOT construct or write JSONL lines directly (SEC-DR-P3-2).
func appendLedger(entries []LedgerEntry) error {
	f, err := openActiveLedger()
	if err != nil {
		return fmt.Errorf("open ledger for append: %w", err)
	}
	defer f.Close()

	for _, entry := range entries {
		// Ensure schemaVersion is always 1 (C-3 provenance).
		entry.SchemaVersion = 1
		if entry.TS == "" {
			entry.TS = time.Now().UTC().Format(time.RFC3339)
		}
		if activeLedgerConfigRoot != "" {
			entry.ConfigRoot = activeLedgerConfigRoot
		}

		line, err := json.Marshal(entry)
		if err != nil {
			return fmt.Errorf("marshal ledger entry for component %q: %w", entry.Component, err)
		}
		line = append(line, '\n')

		// SEC-04: secret-scan the marshaled bytes before writing.
		// Fail closed on a high-confidence match. The error names the class only —
		// never the matched value, and not the component name (which may itself be
		// a secret-shaped string in adversarial inputs).
		if matched, class := scanForSecrets(line); matched {
			return fmt.Errorf("SEC-04: ledger entry contains a high-confidence secret (%s) — write aborted", class)
		}

		// SEC-05 structural gate: validate Owns before persisting.
		if err := validateLedgerOwnership(entry); err != nil {
			return fmt.Errorf("SEC-05: ledger entry for component %q fails structural gate: %w", entry.Component, err)
		}

		// SEC-DR-P3-1: seek to end of file before each write.
		// OpenStateFile opens O_RDWR (no O_APPEND) so the cursor is at offset 0
		// over an existing file. Seeking here prevents overwriting prior lines.
		if _, err := f.Seek(0, io.SeekEnd); err != nil {
			return fmt.Errorf("seek to end of ledger: %w", err)
		}

		if _, err := f.Write(line); err != nil {
			return fmt.Errorf("write ledger entry for component %q: %w", entry.Component, err)
		}
	}
	return nil
}

// validateOwnershipTags applies the SEC-05 structural checks to an OwnershipTags
// value before any ledger write. This is the SAME gate applied at manifest
// validation time — both surfaces must agree.
func validateOwnershipTags(tags OwnershipTags) error {
	for _, f := range tags.Files {
		if !strings.HasPrefix(f, "{config_root}/") {
			return fmt.Errorf("Files entry %q must begin with {config_root}/", f)
		}
		rel := filepath.Clean(filepath.FromSlash(strings.TrimPrefix(f, "{config_root}/")))
		if rel == "." || filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("Files entry %q escapes {config_root}", f)
		}
	}
	for _, k := range tags.ConfigKeys {
		if !configKeyPattern.MatchString(k) {
			return fmt.Errorf("ConfigKeys entry %q fails structural pattern ^[A-Za-z0-9_.-]+$", k)
		}
		// Apply the same namespace gate as validateComponentManifest (SEC-DR-2 symmetry).
		if err := validateConfigKeyNamespace("ledger", k); err != nil {
			return err
		}
	}
	return nil
}

func validateLedgerOwnership(entry LedgerEntry) error {
	if activeLedgerFilename == ledgerFilenameCodex {
		if !strings.HasPrefix(entry.Component, "codex-agent-") {
			return fmt.Errorf("component %q does not belong to the Codex runtime ledger", entry.Component)
		}
	} else if strings.HasPrefix(entry.Component, "codex-agent-") {
		return fmt.Errorf("component %q is present in a non-Codex runtime ledger", entry.Component)
	}
	if err := validateOwnershipTags(entry.Owns); err != nil {
		return err
	}
	for _, key := range entry.Owns.ConfigKeys {
		switch key {
		case "default_agent", "logs-mode", "logs-path", "logs-subfolder", "language", "english_learning", "clickup.workspace_id", "mcp.memory", "mcp.context7":
		default:
			return fmt.Errorf("ConfigKeys entry %q is not installer-managed", key)
		}
	}
	for _, ownedPath := range entry.Owns.Files {
		rel := strings.TrimPrefix(ownedPath, "{config_root}/")
		clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(rel)))
		valid := false
		switch {
		case strings.HasPrefix(entry.Component, "agent-"):
			valid = clean == "agents/"+strings.TrimPrefix(entry.Component, "agent-")+".md"
		case strings.HasPrefix(entry.Component, "codex-agent-"):
			valid = clean == "agents/"+strings.TrimPrefix(entry.Component, "codex-agent-")+".toml"
		case strings.HasPrefix(entry.Component, "command-"):
			valid = clean == "commands/"+strings.TrimPrefix(entry.Component, "command-")+".md"
		case strings.HasPrefix(entry.Component, "skill-"):
			derived := strings.NewReplacer("/", "-", ".", "-", "_", "-").Replace(strings.TrimPrefix(clean, "skills/"))
			valid = strings.HasPrefix(clean, "skills/") && entry.Component == "skill-"+strings.Trim(derived, "-")
		case strings.HasPrefix(entry.Component, "hook-plugin-"):
			valid = historicalPluginOwnershipMatches(entry.Component, clean)
		}
		if !valid {
			return fmt.Errorf("Files entry %q does not match component %q", ownedPath, entry.Component)
		}
	}
	return nil
}

func historicalPluginOwnershipMatches(component, cleanPath string) bool {
	if component == "hook-plugin-entry" {
		return cleanPath == "plugins/team-harness.ts"
	}
	checks := []struct {
		prefix string
		dir    string
	}{
		{"hook-plugin-entry-", "plugins/entry/"},
		{"hook-plugin-body-", "plugins/bodies/"},
		{"hook-plugin-shim-", "plugins/shim/"},
	}
	for _, check := range checks {
		if strings.HasPrefix(component, check.prefix) && strings.HasPrefix(cleanPath, check.dir) {
			base := strings.TrimSuffix(filepath.Base(cleanPath), ".ts")
			base = strings.NewReplacer(".", "-", "_", "-").Replace(base)
			return component == check.prefix+base
		}
	}
	return false
}

// readLedger reads the ownership ledger and returns the set of well-formed
// entries plus any parse errors encountered. Malformed lines (including
// schemaVersion != 1) are collected into []ledgerError and skipped — never
// propagated as valid ownership claims (SEC-06).
//
// Read path: uses os.Open (read-only) on the resolved data-home path rather
// than OpenStateFile (which creates the file). ComputePlan calls readLedger
// as a pure read — it must NOT create the ledger as a side effect (AC-2).
func readLedger() ([]LedgerEntry, []ledgerError) {
	root, err := activeLedgerDataHome()
	if err != nil {
		return nil, []ledgerError{{Line: 0, Reason: fmt.Sprintf("resolve data home: %v", err)}}
	}
	p := filepath.Join(root, activeLedgerFilename)
	data, err := readLeafNoFollow(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, []ledgerError{{Line: 0, Reason: fmt.Sprintf("open ledger without following links: %v", err)}}
	}

	var entries []LedgerEntry
	var errs []ledgerError

	scanner := bufio.NewScanner(bytes.NewReader(data))
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		raw := scanner.Bytes()
		if len(raw) == 0 {
			continue // skip blank lines
		}

		var entry LedgerEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			errs = append(errs, ledgerError{Line: lineNum, Reason: fmt.Sprintf("JSON parse error: %v", err)})
			continue
		}

		// Forward-compat refusal: schemaVersion != 1 is treated as malformed (SEC-06).
		if entry.SchemaVersion != 1 {
			errs = append(errs, ledgerError{Line: lineNum, Reason: fmt.Sprintf("unsupported schemaVersion %d (want 1)", entry.SchemaVersion)})
			continue
		}

		if entry.Component == "" {
			errs = append(errs, ledgerError{Line: lineNum, Reason: "missing component field"})
			continue
		}
		validOps := map[string]bool{"install": true, "update": true, "remove": true}
		if !validOps[entry.Op] {
			errs = append(errs, ledgerError{Line: lineNum, Reason: fmt.Sprintf("invalid op %q (want install|update|remove)", entry.Op)})
			continue
		}
		if activeLedgerConfigRoot != "" {
			if entry.ConfigRoot != "" && filepath.Clean(entry.ConfigRoot) != activeLedgerConfigRoot {
				errs = append(errs, ledgerError{Line: lineNum, Reason: "config root does not match this installation"})
				continue
			}
			if entry.ConfigRoot == "" && activeLedgerFilename == ledgerFilenameOpencode {
				globalRoot, rootErr := opencodeGlobalConfigDir()
				if rootErr != nil || filepath.Clean(globalRoot) != activeLedgerConfigRoot {
					errs = append(errs, ledgerError{Line: lineNum, Reason: "legacy ledger entry has no config-root binding and cannot be replayed against a non-default root"})
					continue
				}
			}
			if entry.ConfigRoot == "" && activeLedgerFilename == ledgerFilenameCodex {
				errs = append(errs, ledgerError{Line: lineNum, Reason: "Codex ledger entry has no config-root binding"})
				continue
			}
		}
		if err := validateLedgerOwnership(entry); err != nil {
			errs = append(errs, ledgerError{Line: lineNum, Reason: fmt.Sprintf("invalid ownership: %v", err)})
			continue
		}

		entries = append(entries, entry)
	}
	if err := scanner.Err(); err != nil {
		errs = append(errs, ledgerError{Line: lineNum, Reason: fmt.Sprintf("scanner error: %v", err)})
	}
	return entries, errs
}

// isLedgerAbsent returns true when the ledger file does not exist yet (i.e.,
// the data-home directory itself does not exist, or the file is not present).
// This is distinct from a ledger that exists but contains only malformed lines.
// We check file existence directly rather than via OpenStateFile (which creates
// the file on O_CREAT / OPEN_ALWAYS). We use ResolveDataHome to get the path
// and then Stat the file without creating it.
func isLedgerAbsent() bool {
	root, err := activeLedgerDataHome()
	if err != nil {
		return true
	}
	p := filepath.Join(root, activeLedgerFilename)
	_, err = os.Stat(p)
	return os.IsNotExist(err)
}
