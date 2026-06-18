package main

import (
	"fmt"
	"os"
)

// ApplyPlan executes the diff produced by ComputePlan:
//   - Writes ToCreate and ToUpdate files via the placer.
//   - Deletes files in ToRemove.
//   - Appends install/update/remove ledger entries EXCLUSIVELY via appendLedger
//     (the single SEC-04 choke-point — no direct JSONL writes here).
//
// Idempotent: a PlanDiff whose buckets are all ToSkipHashMatch produces zero
// writes and zero ledger appends.
func ApplyPlan(diff PlanDiff, placer Placer) error {
	// Process creates and updates, grouped by component for ledger efficiency.
	installEntries := componentInstallEntries(diff.ToCreate, "install", placer)
	updateEntries := componentInstallEntries(diff.ToUpdate, "update", placer)

	// Write created files.
	for _, pf := range diff.ToCreate {
		if _, err := placer.Place(pf.SrcData, pf.TemplatedDst, ""); err != nil {
			return fmt.Errorf("apply: create %q: %w", pf.ConcreteDst, err)
		}
	}

	// Append install entries through the single choke-point.
	if len(installEntries) > 0 {
		if err := appendLedger(installEntries); err != nil {
			return fmt.Errorf("apply: append install ledger entries: %w", err)
		}
	}

	// Write updated files.
	for _, pf := range diff.ToUpdate {
		if _, err := placer.Place(pf.SrcData, pf.TemplatedDst, ""); err != nil {
			return fmt.Errorf("apply: update %q: %w", pf.ConcreteDst, err)
		}
	}

	// Append update entries through the single choke-point.
	if len(updateEntries) > 0 {
		if err := appendLedger(updateEntries); err != nil {
			return fmt.Errorf("apply: append update ledger entries: %w", err)
		}
	}

	// Remove files for ToRemove components.
	var removeEntries []LedgerEntry
	for _, item := range diff.ToRemove {
		for _, f := range item.Files {
			if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("apply: remove %q: %w", f, err)
			}
		}
		removeEntries = append(removeEntries, LedgerEntry{
			Op:        "remove",
			Component: item.Component,
			Owns: OwnershipTags{
				Files:      templatedFilePaths(item, placer),
				ConfigKeys: item.ConfigKeys,
			},
		})
	}

	// Append remove entries through the single choke-point.
	if len(removeEntries) > 0 {
		if err := appendLedger(removeEntries); err != nil {
			return fmt.Errorf("apply: append remove ledger entries: %w", err)
		}
	}

	return nil
}

// componentInstallEntries groups PlannedFiles by component and produces one
// LedgerEntry per distinct component with op=install or op=update.
func componentInstallEntries(files []PlannedFile, op string, placer Placer) []LedgerEntry {
	// Collect file paths per component.
	byComp := make(map[string][]string)
	for _, pf := range files {
		byComp[pf.Component] = append(byComp[pf.Component], pf.TemplatedDst)
	}
	// Preserve deterministic order.
	seen := make(map[string]bool)
	var order []string
	for _, pf := range files {
		if !seen[pf.Component] {
			order = append(order, pf.Component)
			seen[pf.Component] = true
		}
	}

	entries := make([]LedgerEntry, 0, len(order))
	for _, compID := range order {
		entries = append(entries, LedgerEntry{
			Op:        op,
			Component: compID,
			Owns: OwnershipTags{
				Files: byComp[compID],
			},
		})
	}
	return entries
}

// templatedFilePaths reconstructs the {config_root}-prefixed paths for a
// ToRemove item (concrete paths → templated form for the ledger, SEC-05).
func templatedFilePaths(item OwnedItem, placer Placer) []string {
	// The OwnedItem.Files already contains concrete paths; we need to recover
	// the {config_root}-templated form for the ledger (SEC-05 requires the token).
	// We reverse-resolve by stripping the configRoot prefix.
	configRoot := placer.ConfigRoot()
	result := make([]string, 0, len(item.Files))
	for _, f := range item.Files {
		rel := f
		if len(f) > len(configRoot) && f[:len(configRoot)] == configRoot {
			rel = "{config_root}" + f[len(configRoot):]
		}
		result = append(result, rel)
	}
	return result
}
