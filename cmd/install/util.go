package main

import (
	"fmt"
	"os"
	"os/exec"
)

// requireCLI exits with a helpful message if the named CLI is not in PATH.
func requireCLI(cmd, hint string) {
	if _, err := exec.LookPath(cmd); err != nil {
		fmt.Fprintf(os.Stderr, "Error: required CLI '%s' not found in PATH.\n", cmd)
		fmt.Fprintf(os.Stderr, "  %s\n", hint)
		os.Exit(1)
	}
}
