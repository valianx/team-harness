//go:build !windows

package main

// enableVirtualTerminalProcessing is a no-op on non-Windows platforms:
// Unix/macOS terminals natively process ANSI/VT escape sequences without
// any mode flag configuration. Always returns true so the caller selects
// the color banner path when other conditions are met.
func enableVirtualTerminalProcessing() bool {
	return true
}
