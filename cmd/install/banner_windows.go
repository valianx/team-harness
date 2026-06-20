//go:build windows

package main

import (
	"golang.org/x/sys/windows"
)

// vtProcessingFlag is the Windows console mode flag for ANSI/VT escape
// sequence support (ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004).
const vtProcessingFlag uint32 = 0x0004

// enableVirtualTerminalProcessing enables ANSI/VT escape-sequence processing on
// the Windows console attached to stdout. It is called once at the start of
// printWelcomeBanner(), before any escape sequences are written.
//
// Mechanism: reads the current console mode with GetConsoleMode, then calls
// SetConsoleMode with ENABLE_VIRTUAL_TERMINAL_PROCESSING ORed in, preserving
// all existing mode bits. Only the flag is added; no flag is removed.
//
// SEC-005 (deliberate non-restore): the VT mode is intentionally NOT restored
// on exit. Enabling VT processing is the desired behavior on a modern console —
// it keeps escape sequences rendered for any subsequent output in the same
// console session. The process is short-lived, so there is no meaningful session
// impact. A syscall failure (e.g. a legacy console that pre-dates Windows 10
// 1511) is non-fatal and causes the caller to fall back to the plain ASCII banner.
//
// Returns true when VT processing was successfully enabled (or was already
// enabled), false on failure (caller treats false as "VT not available" and
// uses the ASCII fallback).
func enableVirtualTerminalProcessing() bool {
	handle, err := windows.GetStdHandle(windows.STD_OUTPUT_HANDLE)
	if err != nil {
		return false
	}

	var mode uint32
	if err := windows.GetConsoleMode(handle, &mode); err != nil {
		return false
	}

	if mode&vtProcessingFlag != 0 {
		// Flag already set — VT processing was already enabled (e.g. Windows Terminal).
		return true
	}

	return windows.SetConsoleMode(handle, mode|vtProcessingFlag) == nil
}
