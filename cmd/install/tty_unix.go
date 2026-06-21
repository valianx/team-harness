//go:build unix

package main

import "os"

// openTTYDevice opens /dev/tty for reading, giving the installer direct access
// to the user's terminal even when os.Stdin has been replaced by a pipe (the
// curl | bash case). Returns an error when the process has no controlling
// terminal (true CI / headless environments).
func openTTYDevice() (*os.File, error) {
	return os.OpenFile("/dev/tty", os.O_RDONLY, 0)
}

// openTTYForWrite opens /dev/tty for writing. Used by the AC-13 token
// disclosure path: secret values are written to the controlling terminal only,
// never to stdout or any redirectable stream.
// Returns an error when no controlling terminal is available.
func openTTYForWrite() (*os.File, error) {
	return os.OpenFile("/dev/tty", os.O_WRONLY, 0)
}
