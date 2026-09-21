package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// ansiSupported returns true when the terminal is likely to render ANSI colour
// escape sequences correctly.
//
// Criteria (conservative — prefer plain over garbled):
//   - stdin must be an interactive terminal (isTerminal())
//   - TERM must not be "dumb"
//   - On Windows: true when ANY of WT_SESSION, TERM_PROGRAM, TERM, COLORTERM is
//     set, OR when enableVirtualTerminalProcessing() succeeds (Windows 10 1511+).
//     Only a true legacy console (VT-enable fails AND no terminal signals) falls
//     back to plain ASCII. This mirrors the isAccessibleMode() WT_SESSION gate
//     in tui.go:407.
//   - On non-Windows: true (Unix/macOS terminals natively support ANSI).
func ansiSupported() bool {
	if !isTerminal() {
		return false
	}
	term := os.Getenv("TERM")
	if term == "dumb" {
		return false
	}
	if isWindowsRuntime() {
		// Accept any explicit terminal signal (mirrors isAccessibleMode precedent).
		if os.Getenv("WT_SESSION") != "" ||
			os.Getenv("TERM_PROGRAM") != "" ||
			term != "" ||
			os.Getenv("COLORTERM") != "" {
			return true
		}
		// No explicit signal — attempt to enable VT processing via syscall.
		// Returns false on legacy consoles where the syscall is unavailable.
		return enableVirtualTerminalProcessing()
	}
	return true
}

// printWelcomeBanner prints a large block-letter banner to stdout. It is called
// once at the very start of runApplyCommand(), before any prompt fires.
//
// Design goals:
//   - Big block-letter wordmark (ANSI Shadow font) styled like Claude Code / Gemini CLI.
//   - ANSI 256-color brand palette: orange wordmark, purple orbital dots, grey rings.
//   - Plain-ASCII fallback for legacy terminals (legacy cmd.exe, CI piped output).
//   - Height ≤ 25 lines, width ≤ 65 cols.
//
// On Windows, enableVirtualTerminalProcessing() is called first (no-op on
// non-Windows). This ensures VT mode is active before the ANSI gate decision
// so that ansiSupported() can observe the live console state rather than relying
// solely on environment variables. The huh TUI also enables VT, but only when
// form.Run() starts — after this banner prints.
func printWelcomeBanner() {
	// Attempt VT-enable before the gate decision so the banner can observe the
	// result. On non-Windows this is a no-op returning true.
	enableVirtualTerminalProcessing()

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
	ansiGreen   = "\033[38;5;114m" // soft green     — success, OK, values
	ansiBold    = "\033[1m"
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

// sectionHeader prints a visually distinct section header with box-drawing
// characters and extra vertical spacing. Used by the installer to separate
// major steps so they don't blend together on small terminal fonts.
func sectionHeader(title string) {
	w := len(title) + 4
	border := strings.Repeat("─", w)
	fmt.Println()
	if ansiSupported() {
		fmt.Printf("%s┌%s┐%s\n", ansiGrey244, border, ansiReset)
		fmt.Printf("%s│  %s%s%s  %s│%s\n", ansiGrey244, ansiReset+ansiOrange, title, ansiReset, ansiGrey244, ansiReset)
		fmt.Printf("%s└%s┘%s\n", ansiGrey244, border, ansiReset)
	} else {
		fmt.Printf("+%s+\n", border)
		fmt.Printf("|  %s  |\n", title)
		fmt.Printf("+%s+\n", border)
	}
	fmt.Println()
}

// colorValue formats a value string with green color when ANSI is supported,
// or returns it plain otherwise. Used for highlighting important values
// (URLs, paths, counts) in installer output.
func colorValue(s string) string {
	if ansiSupported() {
		return ansiGreen + s + ansiReset
	}
	return s
}

// colorLabel formats a label string with purple color when ANSI is supported.
func colorLabel(s string) string {
	if ansiSupported() {
		return ansiPurple + s + ansiReset
	}
	return s
}

// colorWarn formats a warning string with orange color when ANSI is supported.
func colorWarn(s string) string {
	if ansiSupported() {
		return ansiOrange + s + ansiReset
	}
	return s
}

// pressEnterToExit pauses with a "Press Enter to exit..." prompt when stdin is
// an interactive terminal (i.e. the install was run by a human double-clicking
// the binary or running it from a shell). In non-interactive mode (CI / script
// / piped input) it returns immediately so automation is never blocked.
//
// Call this at the end of a successful install path.
func pressEnterToExit() {
	if !isTerminal() {
		return
	}
	fmt.Println()
	fmt.Print("Press Enter to exit...")
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')
}
