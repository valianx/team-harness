package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// UninstallReport records the outcome of an Uninstall call, including any
// partial failures (SEC-DR-P3-4 / SEC-DR-P3-5).
type UninstallReport struct {
	// Removed is the per-component accounting of what was actually deleted.
	Removed []RemovedComponent
	// IncompleteComponents records components where the ledger remove entry
	// could not be appended after files/keys were removed (SEC-DR-P3-4).
	IncompleteComponents []IncompleteComponent
	// LedgerIntegrityWarning is set when the ledger is absent or all-malformed,
	// explaining why nothing was removed and directing the operator to plan.
	LedgerIntegrityWarning string
	// LedgerErrors are the per-line parse errors surfaced for operator review.
	LedgerErrors []ledgerError
}

// RemovedComponent records the files and keys actually removed for one component.
type RemovedComponent struct {
	Component   string
	FilesRemoved []string
	KeysRemoved  []string
}

// IncompleteComponent records a component whose files/keys were removed but
// whose ledger remove entry could not be appended (SEC-DR-P3-4).
type IncompleteComponent struct {
	Component string
	Err       string
}

// Uninstall removes the files and config keys owned by the selected components,
// as recorded in the ownership ledger.
//
// Fail-closed contract (SEC-06):
//   - If the ledger is absent or every line is malformed, Uninstall removes
//     NOTHING and sets LedgerIntegrityWarning in the report.
//   - Only ledger-owned items for well-formed entries are removed.
//   - NO heuristic deletion (e.g. "delete everything under ~/.claude/skills/").
//
// Ordering per component (SEC-DR-P3-4):
//  1. Delete owned files.
//  2. Rewrite settings doc (delete owned keys), backed up first.
//  3. Append the remove entry via appendLedger (single choke-point).
//
// On any failure at steps 1–2, the component is skipped and recorded in
// UninstallReport.IncompleteComponents — the ledger still claims ownership
// (correct conservative state). On failure at step 3, the inconsistency is
// recorded and surfaced.
func Uninstall(selected []string, placer Placer) (UninstallReport, error) {
	var report UninstallReport

	entries, ledgerErrs := readLedger()
	report.LedgerErrors = ledgerErrs

	// Fail-closed: no well-formed entries → remove nothing.
	if len(entries) == 0 {
		if len(ledgerErrs) > 0 {
			report.LedgerIntegrityWarning = "ledger contains only malformed lines — nothing removed; run 'installer plan' for the dry-run review"
		} else {
			report.LedgerIntegrityWarning = "ledger is absent or empty — nothing removed; run 'installer plan' for the dry-run review"
		}
		return report, nil
	}

	selectedSet := make(map[string]bool, len(selected))
	for _, s := range selected {
		selectedSet[s] = true
	}

	// Determine current ownership from the ledger.
	owned := latestOwnership(entries)

	for compID, tags := range owned {
		if len(selected) > 0 && !selectedSet[compID] {
			continue
		}

		// Resolve concrete file paths.
		concretePaths := make([]string, 0, len(tags.Files))
		for _, tpl := range tags.Files {
			concretePaths = append(concretePaths, resolveTemplatedPath(tpl, placer))
		}

		var removed RemovedComponent
		removed.Component = compID

		// Step 1: delete owned files.
		deleteErr := deleteFiles(concretePaths, &removed)
		if deleteErr != nil {
			report.IncompleteComponents = append(report.IncompleteComponents, IncompleteComponent{
				Component: compID,
				Err:       fmt.Sprintf("file delete failed: %v", deleteErr),
			})
			continue
		}

		// Step 2: rewrite settings doc — delete owned config keys (C-1).
		if len(tags.ConfigKeys) > 0 {
			rewriteErr := deleteConfigKeys(placer.SettingsDocPath(), tags.ConfigKeys, &removed)
			if rewriteErr != nil {
				report.IncompleteComponents = append(report.IncompleteComponents, IncompleteComponent{
					Component: compID,
					Err:       fmt.Sprintf("settings doc rewrite failed: %v", rewriteErr),
				})
				continue
			}
		} else {
			removed.KeysRemoved = []string{}
		}

		// Step 3: append the remove entry via appendLedger (single choke-point).
		ledgerEntry := LedgerEntry{
			Op:        "remove",
			Component: compID,
			Owns: OwnershipTags{
				Files:      tags.Files,      // {config_root}-templated paths (SEC-05)
				ConfigKeys: tags.ConfigKeys, // key names only (SEC-05)
			},
		}
		if appendErr := appendLedger([]LedgerEntry{ledgerEntry}); appendErr != nil {
			// Files/keys were removed but the ledger append failed.
			// Record the inconsistency and surface it (SEC-DR-P3-4).
			report.IncompleteComponents = append(report.IncompleteComponents, IncompleteComponent{
				Component: compID,
				Err:       fmt.Sprintf("files/keys removed but ledger remove entry could not be appended: %v", appendErr),
			})
			// Still record what was actually removed for traceability (SEC-DR-P3-5).
			report.Removed = append(report.Removed, removed)
			continue
		}

		report.Removed = append(report.Removed, removed)
	}

	return report, nil
}

// deleteFiles removes the given concrete paths. Already-absent files are
// skipped (idempotent). The removed paths are appended to r.FilesRemoved.
func deleteFiles(paths []string, r *RemovedComponent) error {
	for _, p := range paths {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove %q: %w", p, err)
		}
		r.FilesRemoved = append(r.FilesRemoved, p)
	}
	return nil
}

// deleteConfigKeys rewrites the settings doc (path) to remove the listed
// dotted key names. Preserves all other keys byte-for-byte (json.RawMessage
// whole-doc pattern mirroring registerMCPServers in claude_json.go).
//
// Before the rewrite, a timestamped .bak-<ts> copy is created with mode 0o600
// (INFO-r2-1: stronger than the 0o644 that copyFileRaw produces — fold the
// security finding here, not in copyFileRaw which is used elsewhere).
func deleteConfigKeys(settingsDocPath string, keys []string, r *RemovedComponent) error {
	// Read the existing doc as a raw map to preserve unknown keys byte-for-byte.
	raw := map[string]json.RawMessage{}
	existing, err := os.ReadFile(settingsDocPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read settings doc %q: %w", settingsDocPath, err)
	}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &raw); err != nil {
			return fmt.Errorf("parse settings doc %q: %w", settingsDocPath, err)
		}
	}

	// Backup before write (INFO-r2-1 fold: use 0o600, not 0o644).
	if len(existing) > 0 {
		ts := time.Now().UTC().Format("20060102-150405")
		bakPath := settingsDocPath + ".bak-" + ts
		if err := os.WriteFile(bakPath, existing, 0o600); err != nil {
			return fmt.Errorf("create backup %q: %w", bakPath, err)
		}
	}

	// Delete the owned keys.
	removed := make([]string, 0, len(keys))
	for _, k := range keys {
		if _, present := raw[k]; present {
			delete(raw, k)
			removed = append(removed, k)
		}
	}
	r.KeysRemoved = removed

	// Write the updated doc back (whole-doc read-merge-write pattern).
	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal updated settings doc: %w", err)
	}
	out = append(out, '\n')

	// Ensure parent directory exists.
	ensureDir(filepath.Dir(settingsDocPath))

	if err := os.WriteFile(settingsDocPath, out, 0o644); err != nil {
		return fmt.Errorf("write settings doc %q: %w", settingsDocPath, err)
	}
	return nil
}
