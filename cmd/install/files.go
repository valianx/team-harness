package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// skipNames mirrors bin/install.py's SKIP_NAMES.
var skipNames = map[string]bool{
	".venv":       true,
	"__pycache__": true,
	".server.pid": true,
	"server.log":  true,
	"README.md":   true,
}

// stats tracks install outcomes for the summary.
var stats = struct {
	Installed []string
	Updated   []string
	Unchanged []string
	Conflicts []string
}{}

// shouldSkip returns true for names that must never be installed.
func shouldSkip(name string) bool {
	return skipNames[name] || strings.HasSuffix(name, ".pyc")
}

// hashFile returns the sha256 hex of the file at p.
func hashFile(p string) (string, error) {
	f, err := os.Open(p)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ensureDir creates a directory (and all parents) if it doesn't exist.
func ensureDir(p string) {
	if err := os.MkdirAll(p, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot create directory %s: %v\n", p, err)
		os.Exit(1)
	}
}

// copyFileRaw performs a raw byte copy from src to dest (both filesystem paths).
func copyFileRaw(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// writeBytesToDest writes the given bytes to dest and optionally sets executable bits.
func writeBytesToDest(data []byte, dest string, executable bool) error {
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return err
	}
	if executable && !isWindows() {
		info, err := os.Stat(dest)
		if err != nil {
			return err
		}
		return os.Chmod(dest, info.Mode()|0o111)
	}
	return nil
}

// copyEmbeddedFile installs a single file from the embedded FS with idempotency
// and conflict detection.
func copyEmbeddedFile(srcPath, dest string, executable bool) {
	ensureDir(filepath.Dir(dest))

	srcData, err := fs.ReadFile(EmbeddedAssets(), srcPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot read embedded %s: %v\n", srcPath, err)
		return
	}
	srcHash := hashBytes(srcData)
	recordedHash := manifest.Files[dest].Hash

	if _, statErr := os.Stat(dest); os.IsNotExist(statErr) {
		if writeErr := writeBytesToDest(srcData, dest, executable); writeErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot install %s: %v\n", dest, writeErr)
			return
		}
		recordManifest(dest, srcHash)
		stats.Installed = append(stats.Installed, dest)
		return
	}

	destHash, err := hashFile(dest)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot hash %s: %v\n", dest, err)
		return
	}

	if destHash == srcHash {
		recordManifest(dest, srcHash)
		stats.Unchanged = append(stats.Unchanged, dest)
		return
	}

	// Destination differs from source.
	if recordedHash != "" && recordedHash == destHash {
		// We installed this before and the user hasn't touched it — safe update.
		if writeErr := writeBytesToDest(srcData, dest, executable); writeErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot update %s: %v\n", dest, writeErr)
			return
		}
		recordManifest(dest, srcHash)
		stats.Updated = append(stats.Updated, dest)
		return
	}

	// User-modified or never tracked — leave it alone.
	stats.Conflicts = append(stats.Conflicts, dest)
}

// copyAgentFile installs a single agent .md file from the embedded FS with
// optional in-flight frontmatter transformation. The transformer rewrites
// model: and effort: lines per the lowCostMatrix when mode is ModeLowCost; for
// ModeStandard the bytes are passed through unchanged. The sha256 is computed
// from the TRANSFORMED bytes — this is load-bearing for conflict detection:
// a same-mode re-install will hash-match and report unchanged; a cross-mode
// re-install will diverge and report conflict.
func copyAgentFile(srcPath, dest string, mode InstallMode) {
	ensureDir(filepath.Dir(dest))

	srcBytes, err := fs.ReadFile(EmbeddedAssets(), srcPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot read embedded %s: %v\n", srcPath, err)
		return
	}

	agentName := agentNameFromPath(srcPath)
	transformed := transformAgentFile(srcBytes, agentName, mode)

	// Compute the hash of the TRANSFORMED content (not the raw source).
	// The manifest stores this transformed hash so a same-mode re-install
	// finds destHash == transformedHash (unchanged) and a cross-mode
	// re-install finds destHash != transformedHash (conflict).
	transformedHash := hashBytes(transformed)

	if _, statErr := os.Stat(dest); os.IsNotExist(statErr) {
		if writeErr := os.WriteFile(dest, transformed, 0o644); writeErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot install %s: %v\n", dest, writeErr)
			return
		}
		recordManifest(dest, transformedHash)
		stats.Installed = append(stats.Installed, dest)
		return
	}

	destHash, hashErr := hashFile(dest)
	if hashErr != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot hash %s: %v\n", dest, hashErr)
		return
	}

	if destHash == transformedHash {
		recordManifest(dest, transformedHash)
		stats.Unchanged = append(stats.Unchanged, dest)
		return
	}

	// Destination differs from what this mode would produce.
	if forceFlag {
		// --force overrides all conflict detection: overwrite unconditionally.
		if writeErr := os.WriteFile(dest, transformed, 0o644); writeErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot update %s: %v\n", dest, writeErr)
			return
		}
		recordManifest(dest, transformedHash)
		stats.Updated = append(stats.Updated, dest)
		return
	}

	// Without --force: report conflict whenever the on-disk content would need
	// to change. See the full rationale in the original copyAgentFile comment.
	stats.Conflicts = append(stats.Conflicts, dest)
}

// hashBytes returns the sha256 hex of the given byte slice.
func hashBytes(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// readEmbeddedDir reads directory entries from the embedded FS, sorted by name.
func readEmbeddedDir(dir string) ([]fs.DirEntry, error) {
	entries, err := fs.ReadDir(EmbeddedAssets(), dir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})
	return entries, nil
}

// copyEmbeddedDirFlat installs all files with the given suffix from an embedded
// directory to destDir (one level deep, no recursion).
func copyEmbeddedDirFlat(srcDir, destDir, suffix string, executable bool) {
	entries, err := readEmbeddedDir(srcDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || shouldSkip(e.Name()) {
			continue
		}
		if suffix != "" && !strings.HasSuffix(e.Name(), suffix) {
			continue
		}
		copyEmbeddedFile(srcDir+"/"+e.Name(), filepath.Join(destDir, e.Name()), executable)
	}
}

// copyEmbeddedDirRecursive installs an entire embedded directory tree, marking
// files with the given extension as executable.
func copyEmbeddedDirRecursive(srcDir, destDir, executableExt string) {
	entries, err := readEmbeddedDir(srcDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if shouldSkip(e.Name()) {
			continue
		}
		srcPath := srcDir + "/" + e.Name()
		dest := filepath.Join(destDir, e.Name())
		if e.IsDir() {
			copyEmbeddedDirRecursive(srcPath, dest, executableExt)
		} else {
			isExec := executableExt != "" && strings.HasSuffix(e.Name(), executableExt)
			copyEmbeddedFile(srcPath, dest, isExec)
		}
	}
}

// isWindows returns true when running on Windows.
func isWindows() bool {
	return os.Getenv("GOOS") == "windows" || isWindowsRuntime()
}

// toSlash converts a Windows path to forward-slash notation for JSON output,
// matching the Python installer's behaviour (Path.as_posix()).
func toSlash(p string) string {
	return filepath.ToSlash(p)
}

// mapGet retrieves a nested map[string]interface{} value by key from a parent map.
func mapGet(m map[string]interface{}, key string) map[string]interface{} {
	v, _ := m[key].(map[string]interface{})
	return v
}

// mapGetString retrieves a string value following a chain of keys in nested maps.
func mapGetString(m map[string]interface{}, keys ...string) string {
	cur := m
	for i, k := range keys {
		if i == len(keys)-1 {
			s, _ := cur[k].(string)
			return s
		}
		next, _ := cur[k].(map[string]interface{})
		if next == nil {
			return ""
		}
		cur = next
	}
	return ""
}
