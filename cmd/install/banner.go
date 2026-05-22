package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// ansiSupported returns true when the terminal is likely to render ANSI colour
// escape sequences correctly. It checks for Windows legacy cmd (no ANSI) by
// examining the TERM and COLORTERM env vars and the isTerminal guard.
//
// Criteria (conservative — prefer plain over garbled):
//   - stdin must be an interactive terminal (isTerminal())
//   - TERM must not be "dumb"
//   - On Windows, TERM or COLORTERM must be set (Windows Terminal / Git Bash /
//     VS Code integrated terminal all set one of these; legacy cmd.exe does not)
func ansiSupported() bool {
	if !isTerminal() {
		return false
	}
	term := os.Getenv("TERM")
	if term == "dumb" {
		return false
	}
	// On Windows the native console (cmd.exe / old PowerShell) does not set TERM.
	// Windows Terminal, VS Code, and Git Bash do. Accept COLORTERM as a fallback.
	if isWindowsRuntime() {
		if term == "" && os.Getenv("COLORTERM") == "" {
			return false
		}
	}
	return true
}

// printWelcomeBanner prints a large block-letter banner to stdout. It is called
// once at the very start of main(), before any prompt fires. It is never
// called on --version or --help paths.
//
// Design goals:
//   - Big block-letter wordmark (ANSI Shadow font) styled like Claude Code / Gemini CLI.
//   - ANSI 256-color brand palette: orange wordmark, purple orbital dots, grey rings.
//   - Plain-ASCII fallback for legacy terminals (legacy cmd.exe, CI piped output).
//   - Height ≤ 25 lines, width ≤ 65 cols.
func printWelcomeBanner() {
	if ansiSupported() {
		printBannerColor()
	} else {
		printBannerPlain()
	}
}

// ANSI 256-color escape sequences for the brand palette.
const (
	ansiOrange  = "\033[38;5;208m" // bright orange  — wordmark, hub dot
	ansiPurple  = "\033[38;5;135m" // soft purple    — orbital agent dots
	ansiGrey244 = "\033[38;5;244m" // medium grey    — orbital rings, tagline
	ansiGrey240 = "\033[38;5;240m" // dim grey       — version line
	ansiReset   = "\033[0m"
	ansiDim     = "\033[2m"
)

func printBannerColor() {
	lines := colorBannerLines()
	for _, l := range lines {
		fmt.Println(l)
	}
}

func printBannerPlain() {
	lines := plainBannerLines()
	for _, l := range lines {
		fmt.Println(l)
	}
}

// colorBannerLines returns the big banner with ANSI 256-color applied per zone:
//   - Orbital ring chars (`. `) → medium grey (244)
//   - Orbital agent dots (`o`) → soft purple (135)
//   - Hub dot (`O`) → orange (208)
//   - Block-letter wordmark lines → orange (208)
//   - Tagline → medium grey (244)
//   - Version → dim grey (240)
func colorBannerLines() []string {
	raw := bigBannerLines()
	out := make([]string, len(raw))
	for i, l := range raw {
		switch {
		case isWordmarkLine(l):
			out[i] = ansiOrange + l + ansiReset
		case isOrbitalLine(l):
			out[i] = colorOrbitalLine(l)
		case strings.Contains(l, "hub + peer-to-peer"):
			out[i] = ansiGrey244 + l + ansiReset
		case strings.Contains(l, "github.com/valianx"):
			out[i] = ansiGrey240 + l + ansiReset
		default:
			out[i] = l
		}
	}
	return out
}

// isWordmarkLine returns true for lines that are part of the ANSI Shadow
// block-letter wordmark (they contain the box-drawing block character █).
func isWordmarkLine(l string) bool {
	return strings.ContainsRune(l, '█')
}

// isOrbitalLine returns true for lines that are part of the orbital decoration
// (they contain the ring character `.` or orbital dots `o`/`O`).
func isOrbitalLine(l string) bool {
	t := strings.TrimSpace(l)
	return strings.HasPrefix(t, ".") || strings.Contains(t, "o") && strings.Contains(t, ".")
}

// colorOrbitalLine applies per-character colors within a single orbital line:
// hub dot `O` → orange, agent dots `o` → purple, everything else → grey244.
func colorOrbitalLine(l string) string {
	var sb strings.Builder
	sb.WriteString(ansiGrey244)
	for _, ch := range l {
		switch ch {
		case 'O':
			sb.WriteString(ansiReset + ansiOrange + string(ch) + ansiReset + ansiGrey244)
		case 'o':
			sb.WriteString(ansiReset + ansiPurple + string(ch) + ansiReset + ansiGrey244)
		default:
			sb.WriteRune(ch)
		}
	}
	sb.WriteString(ansiReset)
	return sb.String()
}

// bigBannerLines returns the large block-letter banner (no escape sequences).
//
// Layout zones:
//  1. Blank top padding
//  2. Orbital decoration (4 lines) — hub + peer-to-peer agent motif
//  3. Block-letter "TEAM" (6 lines) — ANSI Shadow font
//  4. Block-letter "HARNESS" (6 lines) — ANSI Shadow font
//  5. Tagline (1 line)
//  6. Version line (1 line)
//  7. Blank bottom padding
//
// Width: ≤ 65 cols. Height: 23 lines (including blank padding).
//
// ANSI Shadow font reference — each glyph is 6 lines tall:
//
//	T: ████████╗
//	   ╚══██╔══╝
//	      ██║
//	      ██║
//	      ██║
//	      ╚═╝
func bigBannerLines() []string {
	return []string{
		// 1. Top padding
		"",
		// 2. Orbital decoration — width ≤ 65, centered
		"          . . . . . . .          ",
		"        .     o     o   .        ",
		"      .    o    O    o    .      ",
		"        .     o     o   .        ",
		"          . . . . . . .          ",
		// 3. Block-letter "TEAM" (ANSI Shadow, 6 lines)
		"████████╗███████╗ █████╗ ███╗   ███╗",
		"╚══██╔══╝██╔════╝██╔══██╗████╗ ████║",
		"   ██║   █████╗  ███████║██╔████╔██║",
		"   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║",
		"   ██║   ███████╗██║  ██║██║ ╚═╝ ██║",
		"   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝",
		// 4. Block-letter "HARNESS" (ANSI Shadow, 6 lines)
		"██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗",
		"██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝",
		"███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗",
		"██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║",
		"██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║",
		"╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝",
		// 5. Tagline
		"  hub + peer-to-peer agents, orchestrated for Claude Code",
		// 6. Version line
		"  v" + version + "  ·  github.com/valianx/team-harness",
		// 7. Bottom padding
		"",
	}
}

// plainBannerLines returns a compact plain-ASCII banner for legacy terminals
// (no Unicode block characters, no ANSI colours). Width ≤ 65 cols.
func plainBannerLines() []string {
	return []string{
		"",
		"          * . . . . . *          ",
		"        *    o     o    *        ",
		"      *    o    O    o    *      ",
		"        *    o     o    *        ",
		"          * . . . . . *          ",
		"",
		"  #######  #####    ##   ##   ##",
		"     ##    ##      ##   ####  ##",
		"     ##    #####  ##   ## ## ##",
		"     ##    ##      ##   ##  ####",
		"     ##    #####  ##   ##   ###",
		"",
		"  ##  ##   #####  ######  ##   ##  #####   #####   #####",
		"  ##  ##  ##   ## ##   ## ####  ## ##      ##      ##",
		"  ######  ####### ######  ## ## ## #####   #####   #####",
		"  ##  ##  ##   ## ##  ##  ##  #### ##      ##      ##",
		"  ##  ##  ##   ## ##   ## ##   ### ######  ######  ######",
		"",
		"  hub + peer-to-peer agents, orchestrated for Claude Code",
		"  v" + version + "  ·  github.com/valianx/team-harness",
		"",
	}
}

// pressEnterToExit pauses with a "Press Enter to exit..." prompt when stdin is
// an interactive terminal (i.e. the install was run by a human double-clicking
// the binary or running it from a shell). In non-interactive mode (CI / script
// / piped input) it returns immediately so automation is never blocked.
//
// Call this at the end of a successful install path, after printSummary.
func pressEnterToExit() {
	if !isTerminal() {
		return
	}
	fmt.Println()
	fmt.Print("Press Enter to exit...")
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')
}
