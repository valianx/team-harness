//go:build windows

package main

import (
	"fmt"
	"io"
	"os"
	"syscall"

	"golang.org/x/sys/windows"
)

func pathComponentIsLink(path string, fi os.FileInfo) (bool, error) {
	if fi.Mode()&os.ModeSymlink != 0 {
		return true, nil
	}
	attrs, err := windows.GetFileAttributes(windows.StringToUTF16Ptr(path))
	if err != nil {
		return false, err
	}
	return attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0, nil
}

func readLeafNoFollow(path string) ([]byte, error) {
	h, err := windows.CreateFile(
		windows.StringToUTF16Ptr(path),
		windows.GENERIC_READ,
		windows.FILE_SHARE_READ,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return nil, err
	}
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		windows.CloseHandle(h)
		return nil, err
	}
	if info.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		windows.CloseHandle(h)
		return nil, fmt.Errorf("file %q is a reparse point", path)
	}
	f := os.NewFile(uintptr(h), path)
	defer f.Close()
	return io.ReadAll(f)
}

// writeLeafNoFollow writes data to dest on Windows.
// O_NOFOLLOW is a no-op on Windows (documented residual, per-plan SEC-DR-3).
// Protection on Windows rests on the per-component Lstat reparse-point
// rejection that runs in lstatWalkForWrite before this write.
func writeLeafNoFollow(data []byte, dest string, mode os.FileMode) error {
	h, err := windows.CreateFile(
		windows.StringToUTF16Ptr(dest),
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ,
		nil,
		windows.OPEN_ALWAYS,
		windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return fmt.Errorf("open %q: %w", dest, err)
	}
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		windows.CloseHandle(h)
		return fmt.Errorf("inspect %q: %w", dest, err)
	}
	if info.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		windows.CloseHandle(h)
		return fmt.Errorf("file %q is a reparse point", dest)
	}
	f := os.NewFile(uintptr(h), dest)
	defer f.Close()
	if err := f.Truncate(0); err != nil {
		return fmt.Errorf("truncate %q: %w", dest, err)
	}
	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write %q: %w", dest, err)
	}
	return nil
}

// copyBackupHardened reads src and writes its contents to dest using O_EXCL so
// a pre-created file at the backup path is rejected. O_NOFOLLOW is not available
// on Windows (documented residual — see hardened_write_windows.go); symlink
// protection on Windows rests on the caller's use of Lstat-based checks.
func copyBackupHardened(src, dest string, mode os.FileMode) error {
	data, err := readLeafNoFollow(src)
	if err != nil {
		return fmt.Errorf("read source %q: %w", src, err)
	}
	out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("open O_EXCL %q: %w", dest, err)
	}
	defer out.Close()
	if _, wErr := out.Write(data); wErr != nil {
		return fmt.Errorf("write %q: %w", dest, wErr)
	}
	return nil
}
