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

// applyFile copies src to dest; sets executable bits on non-Windows when requested.
func applyFile(src, dest string, executable bool) error {
	if err := copyFileRaw(src, dest); err != nil {
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

// copyFileRaw performs a raw byte copy from src to dest.
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

// copyFile installs a single file with idempotency / conflict detection.
func copyFile(src, dest string, executable bool) {
	ensureDir(filepath.Dir(dest))

	srcHash, err := hashFile(src)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot hash %s: %v\n", src, err)
		return
	}

	recordedHash := manifest.Files[dest].Hash

	if _, statErr := os.Stat(dest); os.IsNotExist(statErr) {
		// Brand-new file.
		if applyErr := applyFile(src, dest, executable); applyErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot install %s: %v\n", dest, applyErr)
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
		// File already matches — keep manifest in sync.
		recordManifest(dest, srcHash)
		stats.Unchanged = append(stats.Unchanged, dest)
		return
	}

	// Destination differs from source.
	if recordedHash != "" && recordedHash == destHash {
		// We installed this before and the user hasn't touched it — safe update.
		if applyErr := applyFile(src, dest, executable); applyErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot update %s: %v\n", dest, applyErr)
			return
		}
		recordManifest(dest, srcHash)
		stats.Updated = append(stats.Updated, dest)
		return
	}

	// User-modified or never tracked — leave it alone.
	stats.Conflicts = append(stats.Conflicts, dest)
}

// copyAgentFile installs a single agent .md file with optional in-flight
// frontmatter transformation. The transformer rewrites model: and effort: lines
// per the lowCostMatrix when mode is ModeLowCost; for ModeStandard the bytes
// are passed through unchanged. The sha256 is computed from the TRANSFORMED
// bytes — this is load-bearing for conflict detection (AC-5): a same-mode
// re-install will hash-match and report unchanged; a cross-mode re-install will
// diverge and report conflict.
func copyAgentFile(src, dest string, mode InstallMode) {
	ensureDir(filepath.Dir(dest))

	srcBytes, err := os.ReadFile(src)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot read %s: %v\n", src, err)
		return
	}

	agentName := agentNameFromPath(src)
	transformed := transformAgentFile(srcBytes, agentName, mode)

	// Compute the hash of the TRANSFORMED content (not the raw source).
	// The manifest stores this transformed hash so a same-mode re-install
	// finds destHash == transformedHash (unchanged) and a cross-mode
	// re-install finds destHash != transformedHash (conflict).
	transformedHash := hashBytes(transformed)

	if _, statErr := os.Stat(dest); os.IsNotExist(statErr) {
		// Brand-new file.
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
		// On-disk already matches what this mode would produce — keep manifest in sync.
		recordManifest(dest, transformedHash)
		stats.Unchanged = append(stats.Unchanged, dest)
		return
	}

	// Destination differs from what this mode would produce.
	if forceFlag {
		// --force overrides all conflict detection: overwrite unconditionally.
		if writeErr := os.WriteFile(dest, transformed, 0o644); writeErr != nil {
			fmt.Fprintf(os.Stderr, "  [warn] cannot install %s: %v\n", dest, writeErr)
			return
		}
		recordManifest(dest, transformedHash)
		stats.Installed = append(stats.Installed, dest)
		return
	}

	// Without --force: report conflict whenever the on-disk content would need
	// to change. This covers two situations:
	//
	//   (a) Mode switch (cross-mode re-install): manifest recorded a hash for
	//       the previous mode; the current mode produces a different hash.
	//       The operator must delete the file and re-run with --force.
	//
	//   (b) User-modified file: manifest differs from on-disk (user touched it).
	//       Leave it alone — same behaviour as the original copyFile.
	//
	// In case (a) recordedHash == destHash (user hasn't touched it) but
	// transformedHash != recordedHash (mode changed). We treat this as a
	// conflict rather than a "safe update" because the manifest cannot
	// distinguish "same mode, upstream source changed" from "mode switched"
	// without persisting the install mode (out of scope per intake §"Excluded").
	// The safe, operator-visible choice is always conflict. A future feature
	// could persist the mode in the manifest to enable silent same-mode updates.
	stats.Conflicts = append(stats.Conflicts, dest)
}

// hashBytes returns the sha256 hex of the given byte slice.
func hashBytes(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// copyDirFlat installs all files with the given suffix from srcDir → destDir
// (one level deep, no recursion).
func copyDirFlat(srcDir, destDir, suffix string, executable bool) {
	entries, err := sortedEntries(srcDir)
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
		copyFile(filepath.Join(srcDir, e.Name()), filepath.Join(destDir, e.Name()), executable)
	}
}

// copyDirRecursive installs an entire directory tree, marking files with the
// given extension as executable.
func copyDirRecursive(srcDir, destDir, executableExt string) {
	entries, err := sortedEntries(srcDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if shouldSkip(e.Name()) {
			continue
		}
		src := filepath.Join(srcDir, e.Name())
		dest := filepath.Join(destDir, e.Name())
		if e.IsDir() {
			copyDirRecursive(src, dest, executableExt)
		} else {
			isExec := executableExt != "" && strings.HasSuffix(e.Name(), executableExt)
			copyFile(src, dest, isExec)
		}
	}
}

// sortedEntries reads a directory and returns entries sorted by name.
func sortedEntries(dir string) ([]fs.DirEntry, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})
	return entries, nil
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
