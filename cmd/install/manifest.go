package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const manifestFilename = ".claude-dev-team-manifest.json"

// manifestEntry tracks a single installed file.
type manifestEntry struct {
	Hash string `json:"hash"`
}

// manifestData is the in-memory manifest, loaded from and saved to
// ~/.claude/.claude-dev-team-manifest.json.
var manifest = struct {
	FormatVersion    string                   `json:"format_version"`
	InstalledVersion string                   `json:"installed_version"`
	UpdatedAt        string                   `json:"updated_at,omitempty"`
	Files            map[string]manifestEntry `json:"files"`
}{
	FormatVersion: "1",
	Files:         map[string]manifestEntry{},
}

func manifestPath() string {
	return filepath.Join(claudeDir, manifestFilename)
}

// loadManifest reads the manifest from disk into the global manifest var.
// If the file is absent or corrupt it silently leaves the manifest at defaults.
func loadManifest() {
	data, err := os.ReadFile(manifestPath())
	if err != nil {
		return
	}
	var loaded struct {
		FormatVersion    string                   `json:"format_version"`
		InstalledVersion string                   `json:"installed_version"`
		UpdatedAt        string                   `json:"updated_at,omitempty"`
		Files            map[string]manifestEntry `json:"files"`
	}
	if jsonErr := json.Unmarshal(data, &loaded); jsonErr != nil {
		return
	}
	if loaded.Files == nil {
		return
	}
	manifest.FormatVersion = loaded.FormatVersion
	manifest.InstalledVersion = loaded.InstalledVersion
	manifest.UpdatedAt = loaded.UpdatedAt
	manifest.Files = loaded.Files
}

// saveManifest writes the current manifest to disk.
func saveManifest() {
	ensureDir(claudeDir)
	manifest.FormatVersion = "1"
	manifest.InstalledVersion = version
	manifest.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot marshal manifest: %v\n", err)
		return
	}
	data = append(data, '\n')
	if err := os.WriteFile(manifestPath(), data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot save manifest: %v\n", err)
	}
}

// recordManifest stores a file hash in the in-memory manifest.
func recordManifest(dest, hash string) {
	manifest.Files[dest] = manifestEntry{Hash: hash}
}
