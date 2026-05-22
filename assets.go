// Package teamharness provides the embedded filesystem of agents, skills, and
// hooks for the team-harness installer binary. This file lives at the repo
// root so that //go:embed can reference the sibling directories — Go embed
// paths must be in or below the source file's directory.
package teamharness

import (
	"embed"
	"io/fs"
)

// embeddedAssets is populated at compile time by the //go:embed directive.
//
// Path rules (Go embed semantics):
//   - Always use forward slashes when reading, even on Windows.
//   - The "all:" prefix on agents/ overrides the default exclusion of files and
//     directories starting with "." or "_". This is required to embed the
//     agents/_shared/ subdirectory (shared cross-cutting snippets).
//   - The embedded layout mirrors the repo layout: `agents/architect.md`
//     in the repo becomes `agents/architect.md` inside embeddedAssets.

//go:embed all:agents skills hooks
var embeddedAssets embed.FS

// FS returns the read-only embedded filesystem containing agents/, skills/,
// and hooks/. Imported by the installer binary (cmd/install) as the canonical
// byte source; the binary is fully self-contained and does not require a repo
// clone at runtime.
func FS() fs.FS {
	return embeddedAssets
}
