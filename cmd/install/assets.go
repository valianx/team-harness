package main

import (
	"io/fs"

	teamharness "github.com/valianx/team-harness"
)

// EmbeddedAssets returns the read-only embedded filesystem containing the
// canonical runtime assets and shipped installer projections. It is populated
// at compile time via //go:embed in the root package (repo root level — embed
// paths must be subdirectories of the source file's package) and is the byte
// source used by installer planning, application, and manifest generation.
// The installer binary is fully self-contained and does not require a clone of
// the team-harness repository at runtime.
func EmbeddedAssets() fs.FS {
	return teamharness.FS()
}
