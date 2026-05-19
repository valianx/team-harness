package main

import "runtime"

// isWindowsRuntime returns true when running on Windows (runtime detection,
// as opposed to cross-compilation target).
func isWindowsRuntime() bool {
	return runtime.GOOS == "windows"
}
