package main

import (
	"bufio"
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

// activeLedgerFilename is the ledger filename for the current runtime.
// Initialized to the default (claude-code); call setActiveLedgerFilename
// before any ledger I/O when using the opencode runtime.
var activeLedgerFilename = ledgerFilename

// setActiveLedgerFilename configures the ledger filename for the current
// runtime. Must be called before appendLedger / readLedger / isLedgerAbsent.
func setActiveLedgerFilename(name string) {
	activeLedgerFilename = name
}

// LedgerEntry is one line of the ownership ledger. Self-contained: a malformed
// neighbour line never affects this entry's interpretation (SEC-06).
type LedgerEntry struct {
	TS            string        `json:"ts"`            // RFC3339 UTC
	Op            string        `json:"op"`            // install | update | remove
	Component     string        `json:"component"`     // component id
	Owns          OwnershipTags `json:"owns"`          // names + {config_root}-paths only (SEC-05)
	SchemaVersion int           `json:"schemaVersion"` // ledger-entry schema version == 1 (C-3)
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
	f, err := OpenStateFile(activeLedgerFilename)
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
		if err := validateOwnershipTags(entry.Owns); err != nil {
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
		if !strings.HasPrefix(f, "{config_root}") {
			return fmt.Errorf("Files entry %q must begin with {config_root}", f)
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

// readLedger reads the ownership ledger and returns the set of well-formed
// entries plus any parse errors encountered. Malformed lines (including
// schemaVersion != 1) are collected into []ledgerError and skipped — never
// propagated as valid ownership claims (SEC-06).
//
// Read path: uses os.Open (read-only) on the resolved data-home path rather
// than OpenStateFile (which creates the file). ComputePlan calls readLedger
// as a pure read — it must NOT create the ledger as a side effect (AC-2).
func readLedger() ([]LedgerEntry, []ledgerError) {
	root, err := ResolveDataHome()
	if err != nil {
		// Absent/unresolvable data-home is treated as absent ledger.
		return nil, nil
	}
	p := filepath.Join(root, activeLedgerFilename)
	f, err := os.Open(p)
	if err != nil {
		// Absent ledger is not an error here; callers distinguish absent vs malformed.
		return nil, nil
	}
	defer f.Close()

	var entries []LedgerEntry
	var errs []ledgerError

	scanner := bufio.NewScanner(f)
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
	root, err := ResolveDataHome()
	if err != nil {
		return true
	}
	p := filepath.Join(root, activeLedgerFilename)
	_, err = os.Stat(p)
	return os.IsNotExist(err)
}
