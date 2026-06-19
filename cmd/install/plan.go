package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
)

// PlannedFile is a file action in the computed diff.
type PlannedFile struct {
	Component    string // component id that owns this file
	TemplatedDst string // {config_root}-prefixed destination path
	ConcreteDst  string // resolved concrete destination path
	SrcData      []byte // embedded source bytes
	SrcHash      string // sha256 of src bytes
	DstHash      string // sha256 of on-disk bytes (empty when absent)
}

// OwnedItem is a ledger-owned item scheduled for removal.
type OwnedItem struct {
	Component   string
	Files       []string // concrete paths
	ConfigKeys  []string // bare dotted key names
}

// PlanDiff is the pure, write-nothing diff produced by ComputePlan.
type PlanDiff struct {
	ToCreate        []PlannedFile // file absent at dest
	ToUpdate        []PlannedFile // file present, hash differs
	ToSkipHashMatch []PlannedFile // file present, hash matches (idempotent skip)
	ToRemove        []OwnedItem   // ledger-owned components not in selected set
	LedgerErrors    []ledgerError // surfaced for operator review (SEC-06)
}

// ComputePlan reads manifests and the ledger, then buckets each file into
// to-create / to-update / to-skip-hash-match / to-remove. It writes nothing.
// LedgerErrors from readLedger are carried into the diff so the operator sees
// integrity problems in the dry-run (SEC-06 binding).
func ComputePlan(
	modules []ModuleManifest,
	components []ComponentManifest,
	selected []string,
	placer Placer,
	embeddedFS fs.FS,
) (PlanDiff, error) {
	selectedSet := make(map[string]bool, len(selected))
	for _, s := range selected {
		selectedSet[s] = true
	}

	// Build a quick lookup for components by id.
	compByID := make(map[string]ComponentManifest, len(components))
	for _, c := range components {
		compByID[c.Component] = c
	}

	var diff PlanDiff

	// Read the ledger; collect errors for the diff surface (SEC-06).
	ledgerEntries, ledgerErrs := readLedger()
	diff.LedgerErrors = ledgerErrs

	// Compute ToRemove: ledger-owned components no longer in the selected set.
	// Use the LAST install/update entry per component as the authoritative owner.
	lastOwned := latestOwnership(ledgerEntries)
	for compID, owned := range lastOwned {
		if selectedSet[compID] {
			continue // still selected — not a removal candidate
		}
		item := OwnedItem{Component: compID}
		for _, tpl := range owned.Files {
			item.Files = append(item.Files, resolveTemplatedPath(tpl, placer))
		}
		item.ConfigKeys = owned.ConfigKeys
		diff.ToRemove = append(diff.ToRemove, item)
	}

	// Compute ToCreate / ToUpdate / ToSkipHashMatch for selected components.
	for _, compID := range selected {
		c, ok := compByID[compID]
		if !ok {
			return PlanDiff{}, fmt.Errorf("plan: selected component %q has no manifest", compID)
		}

		// Read source bytes from embedded FS.
		srcData, err := fs.ReadFile(embeddedFS, c.Source)
		if err != nil {
			return PlanDiff{}, fmt.Errorf("plan: cannot read source %q for component %q: %w", c.Source, compID, err)
		}
		srcHash := hashBytes(srcData)

		for _, tpl := range c.Emits.Files {
			dst := resolveTemplatedPath(tpl, placer)
			pf := PlannedFile{
				Component:    compID,
				TemplatedDst: tpl,
				ConcreteDst:  dst,
				SrcData:      srcData,
				SrcHash:      srcHash,
			}

			dstHash, err := hashFile(dst)
			if os.IsNotExist(err) {
				diff.ToCreate = append(diff.ToCreate, pf)
				continue
			}
			if err != nil {
				return PlanDiff{}, fmt.Errorf("plan: cannot hash destination %q: %w", dst, err)
			}
			pf.DstHash = dstHash
			if dstHash == srcHash {
				diff.ToSkipHashMatch = append(diff.ToSkipHashMatch, pf)
			} else {
				diff.ToUpdate = append(diff.ToUpdate, pf)
			}
		}
	}

	return diff, nil
}

// PrintPlan writes a human-readable summary of the PlanDiff to w.
func PrintPlan(d PlanDiff, w io.Writer) {
	fmt.Fprintf(w, "Plan:\n")
	fmt.Fprintf(w, "  to create:    %d\n", len(d.ToCreate))
	fmt.Fprintf(w, "  to update:    %d\n", len(d.ToUpdate))
	fmt.Fprintf(w, "  to skip:      %d\n", len(d.ToSkipHashMatch))
	fmt.Fprintf(w, "  to remove:    %d\n", len(d.ToRemove))
	if len(d.LedgerErrors) > 0 {
		fmt.Fprintf(w, "  ledger errors: %d (see below)\n", len(d.LedgerErrors))
	}

	for _, pf := range d.ToCreate {
		fmt.Fprintf(w, "  + create  [%s] %s\n", pf.Component, pf.ConcreteDst)
	}
	for _, pf := range d.ToUpdate {
		fmt.Fprintf(w, "  ~ update  [%s] %s\n", pf.Component, pf.ConcreteDst)
	}
	for _, pf := range d.ToSkipHashMatch {
		fmt.Fprintf(w, "  = skip    [%s] %s\n", pf.Component, pf.ConcreteDst)
	}
	for _, item := range d.ToRemove {
		for _, f := range item.Files {
			fmt.Fprintf(w, "  - remove  [%s] %s\n", item.Component, f)
		}
		for _, k := range item.ConfigKeys {
			fmt.Fprintf(w, "  - remove  [%s] config key: %s\n", item.Component, k)
		}
	}
	for _, le := range d.LedgerErrors {
		fmt.Fprintf(w, "  ! ledger error: %s\n", le.Error())
	}
}

// latestOwnership returns a map of componentID → OwnershipTags reflecting the
// most recent install or update ledger entry for each component. Remove entries
// are excluded (they signal the component is no longer owned).
func latestOwnership(entries []LedgerEntry) map[string]OwnershipTags {
	owned := make(map[string]OwnershipTags)
	for _, e := range entries {
		switch e.Op {
		case "install", "update":
			owned[e.Component] = e.Owns
		case "remove":
			delete(owned, e.Component)
		}
	}
	return owned
}
