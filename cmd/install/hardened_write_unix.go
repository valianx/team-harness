//go:build !windows

package main

import (
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

// writeLeafNoFollow writes data to dest using O_NOFOLLOW on the leaf open,
// refusing to follow a symlink at the final path component (SEC-DR-3).
func writeLeafNoFollow(data []byte, dest string, executable bool) error {
	mode := os.FileMode(0o644)
	if executable {
		mode = 0o755
	}

	// O_NOFOLLOW: if a symlink was planted at dest between our Lstat walk and
	// this open, the syscall refuses it.
	flags := unix.O_WRONLY | unix.O_CREAT | unix.O_TRUNC | unix.O_NOFOLLOW | unix.O_CLOEXEC
	fd, err := unix.Open(dest, flags, uint32(mode))
	if err != nil {
		return fmt.Errorf("open O_NOFOLLOW %q: %w", dest, err)
	}
	f := os.NewFile(uintptr(fd), dest)
	defer f.Close()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write %q: %w", dest, err)
	}
	return nil
}

// copyBackupHardened reads src and writes its contents to dest using
// O_NOFOLLOW|O_EXCL so a pre-placed symlink at the backup destination is
// rejected rather than followed. The backup path contains a timestamp and must
// not already exist under normal conditions; O_EXCL also catches a pre-created
// symlink (which counts as EEXIST on Linux).
func copyBackupHardened(src, dest string, mode os.FileMode) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read source %q: %w", src, err)
	}
	// O_NOFOLLOW: refuse if dest is a symlink.
	// O_EXCL: refuse if dest already exists (a pre-created symlink is EEXIST).
	flags := unix.O_WRONLY | unix.O_CREAT | unix.O_EXCL | unix.O_NOFOLLOW | unix.O_CLOEXEC
	fd, err := unix.Open(dest, flags, uint32(mode))
	if err != nil {
		return fmt.Errorf("open O_NOFOLLOW|O_EXCL %q: %w", dest, err)
	}
	f := os.NewFile(uintptr(fd), dest)
	defer f.Close()
	if _, wErr := f.Write(data); wErr != nil {
		return fmt.Errorf("write %q: %w", dest, wErr)
	}
	return nil
}
