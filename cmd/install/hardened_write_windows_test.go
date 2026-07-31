//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteLeafNoFollowRejectsReparsePoint(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target.json")
	link := filepath.Join(dir, "opencode.json")
	if err := os.WriteFile(target, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := writeLeafNoFollow([]byte("changed"), link, 0o600); err == nil {
		t.Fatal("reparse point was followed")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "original" {
		t.Fatalf("target changed: %q", data)
	}
}
