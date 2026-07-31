package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"
)

// PlannedFile is a file action in the computed diff.
type PlannedFile struct {
	Component    string // component id that owns this file
	TemplatedDst string // {config_root}-prefixed destination path
	ConcreteDst  string // resolved concrete destination path
	ConfigKeys   []string
	OwnedFiles   []string
	SrcData      []byte // embedded source bytes
	SrcHash      string // sha256 of src bytes
	DstHash      string // sha256 of on-disk bytes (empty when absent)
}

// OwnedItem is a ledger-owned item scheduled for removal.
type OwnedItem struct {
	Component  string
	Files      []string // concrete paths
	ConfigKeys []string // bare dotted key names
}

// PlanDiff is the pure, write-nothing diff produced by ComputePlan.
type PlanDiff struct {
	ToCreate        []PlannedFile // file absent at dest
	ToUpdate        []PlannedFile // file present, hash differs
	ToSkipHashMatch []PlannedFile // file present, hash matches (idempotent skip)
	ToRemove        []OwnedItem   // ledger-owned components not in selected set
	ToRecord        []PlannedFile // unchanged component whose ownership metadata needs repair
	LedgerErrors    []ledgerError // surfaced for operator review (SEC-06)
}

// ComputePlan reads manifests and the ledger, then buckets each file into
// to-create / to-update / to-skip-hash-match / to-remove. It writes nothing.
// LedgerErrors from readLedger are carried into the diff so the operator sees
// integrity problems in the dry-run (SEC-06 binding).
//
// The transform parameter is applied to each component's source bytes BEFORE
// hashBytes is computed (S-1 idempotency fix). For the claude-code runtime,
// pass nil (identity). For the opencode runtime, pass opencodeRuntimeTransform
// which applies the generic CC→opencode transform AND the mode-by-role override
// using the source path to identify the orchestrator. This ensures PlannedFile.SrcHash
// is the hash of the transformed bytes and ApplyPlan writes the same transformed
// bytes — a second apply will find dstHash == srcHash and produce no writes.
//
// Transform signature: func(src, kind, sourcePath) ([]byte, error)
//   - src:        embedded source bytes
//   - kind:       component kind ("agent", "skill", "hook", "command")
//   - sourcePath: embedded FS path (e.g. "agents/orchestrator.md") — used by
//     the opencode transform to identify mode-by-role targets
func ComputePlan(
	modules []ModuleManifest,
	components []ComponentManifest,
	selected []string,
	placer Placer,
	embeddedFS fs.FS,
	transform func(src []byte, kind, sourcePath string) ([]byte, error),
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
		if !isRetirableLedgerComponent(compID, placer) {
			diff.LedgerErrors = append(diff.LedgerErrors, ledgerError{Line: 0, Reason: fmt.Sprintf("ledger component %q is neither currently managed nor an explicitly retired plugin component", compID)})
			continue
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

		// S-1: apply the runtime transform BEFORE hashing so that SrcHash is
		// the hash of the bytes that will be written on disk. A nil transform is
		// treated as identity (claude-code path). The source path (c.Source) is
		// passed so the transform can apply mode-by-role logic for agents.
		if transform != nil {
			srcData, err = transform(srcData, c.Kind, c.Source)
			if err != nil {
				return PlanDiff{}, fmt.Errorf("plan: transform component %q (source %q): %w", compID, c.Source, err)
			}
		}

		srcHash := hashBytes(srcData)
		var firstPlanned *PlannedFile
		componentChanged := false

		for _, tpl := range c.Emits.Files {
			dst := resolveTemplatedPath(tpl, placer)
			pf := PlannedFile{
				Component:    compID,
				TemplatedDst: tpl,
				ConcreteDst:  dst,
				ConfigKeys:   c.Emits.ConfigKeys,
				OwnedFiles:   c.Emits.Files,
				SrcData:      srcData,
				SrcHash:      srcHash,
			}
			if firstPlanned == nil {
				copy := pf
				firstPlanned = &copy
			}

			dstHash, err := hashFile(dst)
			if os.IsNotExist(err) {
				diff.ToCreate = append(diff.ToCreate, pf)
				componentChanged = true
				continue
			}
			if err != nil {
				return PlanDiff{}, fmt.Errorf("plan: cannot hash destination %q: %w", dst, err)
			}
			pf.DstHash = dstHash
			if dstHash == srcHash {
				diff.ToSkipHashMatch = append(diff.ToSkipHashMatch, pf)
			} else {
				// A same-name Codex custom agent that is not proven as ours by this
				// runtime/root's ledger belongs to the operator. Refuse to replace it.
				if placer.Runtime() == "codex" {
					owned, wasOwned := lastOwned[compID]
					if !wasOwned || !ownershipTagsEqual(owned, c.Emits) {
						return PlanDiff{}, fmt.Errorf("plan: refusing to overwrite unowned Codex agent %q; move or rename the conflicting file, then retry", dst)
					}
				}
				diff.ToUpdate = append(diff.ToUpdate, pf)
				componentChanged = true
			}
		}
		if !componentChanged && firstPlanned != nil && !ownershipTagsEqual(lastOwned[compID], c.Emits) {
			diff.ToRecord = append(diff.ToRecord, *firstPlanned)
		}
	}

	return diff, nil
}

func isRetirableLedgerComponent(component string, placer Placer) bool {
	return strings.HasPrefix(component, "hook-plugin-") ||
		(placer.Runtime() == "codex" && strings.HasPrefix(component, "codex-agent-"))
}

func ownershipTagsEqual(a, b OwnershipTags) bool {
	return stringSlicesEqual(a.Files, b.Files) && stringSlicesEqual(a.ConfigKeys, b.ConfigKeys)
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
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
