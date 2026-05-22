package main

import (
	"io/fs"

	teamharness "github.com/valianx/team-harness"
)

// EmbeddedAssets returns the read-only embedded filesystem containing
// agents/, skills/, and hooks/. Populated at compile time via //go:embed in
// the root package (repo root level — embed paths must be subdirectories of
// the source file's package). Used by installAgents / installSkills /
// installHooks / readSourceFrontmatter as the canonical byte source for all
// file operations; the binary is fully self-contained and does NOT require a
// clone of the team-harness repo at runtime.
func EmbeddedAssets() fs.FS {
	return teamharness.FS()
}
