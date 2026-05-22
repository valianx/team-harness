package main

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Tests: bigBannerLines (ANSI-color path source)
// ---------------------------------------------------------------------------

// TestBigBannerLines_ContainsTEAMWordmark verifies the big banner includes
// block-letter "TEAM" (identified by the box-drawing block character █).
func TestBigBannerLines_ContainsTEAMWordmark(t *testing.T) {
	found := false
	for _, l := range bigBannerLines() {
		if strings.ContainsRune(l, '█') && strings.Contains(l, "TEAM") {
			found = true
			break
		}
	}
	// The block-letter wordmark uses █ characters; at least one line must
	// contain both █ and originate from the TEAM section. We check by
	// confirming at least one █ line references the glyph for "T": ████████╗.
	if !found {
		// Looser check: any line containing the TEAM glyph prefix.
		for _, l := range bigBannerLines() {
			if strings.Contains(l, "████████╗") {
				found = true
				break
			}
		}
	}
	if !found {
		t.Error("expected bigBannerLines to contain TEAM block-letter glyph (████████╗)")
	}
}

// TestBigBannerLines_ContainsHARNESSWordmark verifies the big banner includes
// block-letter "HARNESS" (identified by the wide glyph opener ██╗  ██╗).
func TestBigBannerLines_ContainsHARNESSWordmark(t *testing.T) {
	found := false
	for _, l := range bigBannerLines() {
		if strings.Contains(l, "██╗  ██╗") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected bigBannerLines to contain HARNESS block-letter glyph (██╗  ██╗)")
	}
}

// TestBigBannerLines_ContainsTagline verifies the tagline is present.
func TestBigBannerLines_ContainsTagline(t *testing.T) {
	found := false
	for _, l := range bigBannerLines() {
		if strings.Contains(l, "hub + peer-to-peer") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected bigBannerLines to contain tagline 'hub + peer-to-peer'")
	}
}

// TestBigBannerLines_ContainsVersionLine verifies the version/repo line is present.
func TestBigBannerLines_ContainsVersionLine(t *testing.T) {
	found := false
	for _, l := range bigBannerLines() {
		if strings.Contains(l, "github.com/valianx") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected bigBannerLines to contain version line with 'github.com/valianx'")
	}
}

// TestBigBannerLines_HeightBound verifies the big banner fits within 25 lines.
func TestBigBannerLines_HeightBound(t *testing.T) {
	lines := bigBannerLines()
	if len(lines) > 25 {
		t.Errorf("bigBannerLines has %d lines, exceeds 25-line cap", len(lines))
	}
}

// TestBigBannerLines_WidthBound verifies every line fits within 65 columns.
// Width is measured in bytes (all non-ANSI content uses ASCII + Unicode box
// characters; each box-drawing rune is 3 bytes in UTF-8 but 1 terminal column,
// so we measure visible columns by counting runes, not bytes).
func TestBigBannerLines_WidthBound(t *testing.T) {
	for i, l := range bigBannerLines() {
		cols := countVisibleCols(l)
		if cols > 65 {
			t.Errorf("line %d exceeds 65 visible cols (%d): %q", i, cols, l)
		}
	}
}

// TestBigBannerLines_NoEscapeSequences verifies no ANSI escape sequences
// appear in the raw (non-colored) variant.
func TestBigBannerLines_NoEscapeSequences(t *testing.T) {
	for i, l := range bigBannerLines() {
		if strings.Contains(l, "\033[") {
			t.Errorf("line %d contains ANSI escape sequence in bigBannerLines: %q", i, l)
		}
	}
}

// ---------------------------------------------------------------------------
// Tests: plainBannerLines (legacy fallback)
// ---------------------------------------------------------------------------

// TestPlainBannerLines_ContainsWordmark verifies the plain banner includes
// the "TEAM" and "HARNESS" text (via # block chars or plain text markers).
func TestPlainBannerLines_ContainsWordmark(t *testing.T) {
	// The plain banner uses # block chars; verify at least one wordmark-style
	// line exists (a line with multiple # segments).
	found := false
	for _, l := range plainBannerLines() {
		if strings.Contains(l, "##") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected plainBannerLines to contain # block-letter wordmark")
	}
}

// TestPlainBannerLines_ContainsTagline verifies the plain banner includes the tagline.
func TestPlainBannerLines_ContainsTagline(t *testing.T) {
	found := false
	for _, l := range plainBannerLines() {
		if strings.Contains(l, "hub + peer-to-peer") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected plainBannerLines to contain tagline 'hub + peer-to-peer'")
	}
}

// TestPlainBannerLines_NoEscapeSequences verifies no ANSI escape sequences
// appear in the plain variant.
func TestPlainBannerLines_NoEscapeSequences(t *testing.T) {
	for i, l := range plainBannerLines() {
		if strings.Contains(l, "\033[") {
			t.Errorf("line %d contains ANSI escape sequence in plain banner: %q", i, l)
		}
	}
}

// TestPlainBannerLines_WidthBound verifies every plain banner line fits within
// 65 columns.
func TestPlainBannerLines_WidthBound(t *testing.T) {
	for i, l := range plainBannerLines() {
		if len([]rune(l)) > 65 {
			t.Errorf("line %d exceeds 65 cols (%d): %q", i, len([]rune(l)), l)
		}
	}
}

// TestPlainBannerLines_HeightBound verifies the plain banner fits within 25 lines.
func TestPlainBannerLines_HeightBound(t *testing.T) {
	lines := plainBannerLines()
	if len(lines) > 25 {
		t.Errorf("plain banner has %d lines, exceeds 25-line cap", len(lines))
	}
}

// ---------------------------------------------------------------------------
// Tests: printWelcomeBanner — output written to stdout
// ---------------------------------------------------------------------------

// TestPrintWelcomeBanner_ProducesOutput verifies that printWelcomeBanner writes
// at least some bytes to stdout regardless of whether the terminal supports ANSI.
func TestPrintWelcomeBanner_ProducesOutput(t *testing.T) {
	origStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	os.Stdout = w

	printWelcomeBanner()

	w.Close()
	os.Stdout = origStdout

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(r); err != nil {
		t.Fatalf("reading captured output: %v", err)
	}
	r.Close()

	if buf.Len() == 0 {
		t.Error("expected printWelcomeBanner to write output, got empty buffer")
	}
	// In test runner, stdin is non-interactive so the plain banner fires.
	// The plain banner contains "hub + peer-to-peer".
	if !strings.Contains(buf.String(), "hub + peer-to-peer") {
		t.Error("expected output to contain tagline 'hub + peer-to-peer'")
	}
}

// ---------------------------------------------------------------------------
// Tests: pressEnterToExit — non-interactive path is a no-op
// ---------------------------------------------------------------------------

// TestPressEnterToExit_NonInteractiveReturnsImmediately verifies that
// pressEnterToExit does not block or write anything when stdin is not a
// terminal. In the test runner stdin is always non-interactive (piped), so
// this test exercises the guard directly without needing a subprocess.
func TestPressEnterToExit_NonInteractiveReturnsImmediately(t *testing.T) {
	if isTerminal() {
		t.Skip("stdin appears to be a TTY in this test environment; skipping non-interactive guard test")
	}

	origStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	os.Stdout = w

	pressEnterToExit() // must return immediately (no blocking Read)

	w.Close()
	os.Stdout = origStdout

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(r); err != nil {
		t.Fatalf("reading captured output: %v", err)
	}
	r.Close()

	if buf.Len() != 0 {
		t.Errorf("pressEnterToExit wrote output in non-interactive mode: %q", buf.String())
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// countVisibleCols returns the number of terminal columns a line occupies.
// Each Unicode code point counts as 1 column (this is a safe approximation for
// the box-drawing characters used in ANSI Shadow font — they are all single-width).
func countVisibleCols(s string) int {
	return len([]rune(s))
}
