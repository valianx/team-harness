package main

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// InstallMode controls whether agent frontmatter is transformed during install.
type InstallMode string

const (
	// ModeStandard is the default: agent files are copied byte-identical.
	ModeStandard InstallMode = "standard"
	// ModeLowCost rewrites model: and effort: frontmatter lines per lowCostMatrix.
	ModeLowCost InstallMode = "low-cost"
)

// AgentOverride declares the model and effort to write for a given agent in
// low-cost mode. Both fields must be non-empty strings.
type AgentOverride struct {
	Model  string
	Effort string
}

// lowCostMatrix is the canonical low-cost override for every agent.
// Source of truth: 01-architecture.md §"Canonical low-cost matrix".
// Mirrored (doc-only) in agents/README.md §"Low-cost mode".
//
// Invariants enforced at compile time by this package:
//   - every model value is "sonnet" (no opus, no haiku)
//   - every effort value is "medium" or "high" (no max, no low)
//
// Both are verified at test time by TestLowCostMatrixInvariants in modes_test.go.
var lowCostMatrix = map[string]AgentOverride{
	// Gate-makers, design heavyweights, acceptance auditors — effort: high
	"orchestrator":  {Model: "sonnet", Effort: "high"},
	"architect":     {Model: "sonnet", Effort: "high"},
	"agent-builder": {Model: "sonnet", Effort: "high"},
	"security":      {Model: "sonnet", Effort: "high"},
	"reviewer":      {Model: "sonnet", Effort: "high"},
	"qa":            {Model: "sonnet", Effort: "high"},

	// Advisory, executor, downstream generators — effort: medium
	"plan-reviewer":      {Model: "sonnet", Effort: "medium"},
	"gcp-cost-analyzer":  {Model: "sonnet", Effort: "medium"},
	"init":               {Model: "sonnet", Effort: "medium"},
	"implementer":        {Model: "sonnet", Effort: "medium"},
	"tester":             {Model: "sonnet", Effort: "medium"},
	"acceptance-checker": {Model: "sonnet", Effort: "medium"},
	"diagrammer":         {Model: "sonnet", Effort: "medium"},
	"likec4-diagrammer":  {Model: "sonnet", Effort: "medium"},
	"d2-diagrammer":      {Model: "sonnet", Effort: "medium"},
	"translator":         {Model: "sonnet", Effort: "medium"},
	"delivery":           {Model: "sonnet", Effort: "medium"},
}

// lowCostOverride returns the AgentOverride for the given agent name, and
// whether an entry was found. When not found, a pass-through is implied.
func lowCostOverride(agentName string) (AgentOverride, bool) {
	o, ok := lowCostMatrix[agentName]
	return o, ok
}

// transformAgentFile rewrites the model: and effort: YAML frontmatter lines
// of srcBytes according to mode. For ModeStandard the bytes are returned
// unchanged. For ModeLowCost the frontmatter block (between the opening ---
// and the first closing --- after it) is scanned line-by-line; only model:
// and effort: keys are replaced. All other bytes — including the rest of the
// agent system prompt — are preserved verbatim.
//
// If srcBytes have no valid YAML frontmatter block, or if agentName has no
// entry in lowCostMatrix, the bytes are returned unchanged and a warning is
// printed to stderr.
//
// This is a pure function with respect to the file content: no I/O, no side
// effects beyond the optional stderr warning.
func transformAgentFile(srcBytes []byte, agentName string, mode InstallMode) []byte {
	if mode == ModeStandard {
		return srcBytes
	}

	override, ok := lowCostOverride(agentName)
	if !ok {
		// Agent not in matrix — return unchanged (no-op transform is safe).
		// This handles reference files (ref-*.md) that are not invocable agents.
		return srcBytes
	}

	// Locate the frontmatter block. Accept both LF ("---\n") and CRLF
	// ("---\r\n") openers — Windows with core.autocrlf=true produces CRLF
	// in checked-out .md files, and we must not silently fall through on the
	// target platform.
	hasCRLF := bytes.HasPrefix(srcBytes, []byte("---\r\n"))
	hasLF := bytes.HasPrefix(srcBytes, []byte("---\n"))
	if !hasCRLF && !hasLF {
		fmt.Fprintf(os.Stderr, "  [warn] transformAgentFile(%s): no opening frontmatter '---'; leaving unchanged\n", agentName)
		return srcBytes
	}

	// preambleLen is the byte length of the opening fence including its newline.
	preambleLen := 4 // "---\n"
	if hasCRLF {
		preambleLen = 5 // "---\r\n"
	}

	// lineEnding is the newline sequence detected from the first line.
	// All output from rewriteFrontmatterLines will use this separator so that
	// a CRLF-encoded file is never silently normalised to LF (which would
	// mutate the bytes and trigger spurious conflict on re-install).
	lineEnding := "\n"
	if hasCRLF {
		lineEnding = "\r\n"
	}

	// Find the closing --- of the frontmatter. We search from preambleLen so
	// the opening marker itself is not matched.
	fmEnd := findFrontmatterEnd(srcBytes, preambleLen)
	if fmEnd < 0 {
		fmt.Fprintf(os.Stderr, "  [warn] transformAgentFile(%s): no closing frontmatter '---'; leaving unchanged\n", agentName)
		return srcBytes
	}

	// fmEnd points at the '\n' (or '\r') that precedes the closing "---" fence.
	// Split into three regions:
	//   preamble  = "---\n" or "---\r\n"          (bytes 0..preambleLen-1)
	//   fmBody    = YAML lines, no trailing newline (bytes preambleLen..fmEnd-1)
	//   suffix    = "---\n" + rest of file          (bytes fmEnd+1..)
	//
	// For CRLF the '\r' before the closing fence newline is part of fmEnd, so
	// we step back one extra byte when slicing fmBody to exclude it.
	fmBodyEnd := fmEnd
	if hasCRLF && fmBodyEnd > preambleLen && srcBytes[fmBodyEnd-1] == '\r' {
		fmBodyEnd--
	}
	frontmatter := srcBytes[preambleLen:fmBodyEnd] // YAML lines, no trailing newline
	suffix := srcBytes[fmEnd+1:]                   // "---\n" or "---\r\n" + prompt body

	rewritten := rewriteFrontmatterLines(frontmatter, override, lineEnding)
	var out bytes.Buffer
	out.WriteString("---" + lineEnding)
	out.Write(rewritten)
	out.Write(suffix)
	return out.Bytes()
}

// findFrontmatterEnd locates the end of the frontmatter block in src.
// The opening "---\n" or "---\r\n" at position 0 must already have been
// confirmed by the caller. preambleLen is the byte length of that opener
// (4 for LF, 5 for CRLF). Returns the byte offset of the '\n' (or '\r' for
// CRLF files) that immediately precedes the closing "---" line, or -1 if no
// closing fence is found.
//
// Example (LF): "---\nkey: val\n---\nrest" → returns offset of the '\n'
// before the second "---", i.e. the '\n' after "key: val".
func findFrontmatterEnd(src []byte, preambleLen int) int {
	// We look for "\n---" starting after the opening fence.
	search := []byte("\n---")
	idx := bytes.Index(src[preambleLen:], search)
	if idx < 0 {
		return -1
	}
	// idx is relative to src[preambleLen:]. Convert back to absolute and point at the '\n'.
	return preambleLen + idx
}

// rewriteFrontmatterLines scans each line in the frontmatter block (the bytes
// between the two "---" fences, not including the fences or the separating
// newlines) and replaces lines that begin with exactly "model:" or "effort:"
// (case-sensitive, with optional leading whitespace) with the override values.
// lineEnding is the newline sequence to emit (either "\n" or "\r\n") — it is
// preserved from the source file so that CRLF files are not silently normalised
// to LF. The caller is responsible for not including a trailing newline in block.
func rewriteFrontmatterLines(block []byte, override AgentOverride, lineEnding string) []byte {
	var out bytes.Buffer
	scanner := bufio.NewScanner(bytes.NewReader(block))
	for scanner.Scan() {
		line := scanner.Text()
		// scanner.Text() strips the trailing newline (and \r for CRLF) so
		// line contains the raw key: value content without any line endings.
		key := strings.TrimLeft(line, " \t")
		switch {
		case isExactKey(key, "model:"):
			out.WriteString("model: " + override.Model + lineEnding)
		case isExactKey(key, "effort:"):
			out.WriteString("effort: " + override.Effort + lineEnding)
		default:
			out.WriteString(line + lineEnding)
		}
	}
	return out.Bytes()
}

// isExactKey reports whether line starts with prefix where prefix ends in ':'
// and the character immediately following (if any) is a space or tab.
// This prevents false-positive matches on keys like "model_id:" or "effort_baseline:".
func isExactKey(line, prefix string) bool {
	if !strings.HasPrefix(line, prefix) {
		return false
	}
	// The prefix ends with ':', so len(prefix) is the index right after ':'.
	// If nothing follows, this is a bare "key:" with no value — still an exact match.
	if len(line) == len(prefix) {
		return true
	}
	next := line[len(prefix)]
	return next == ' ' || next == '\t'
}

// agentNameFromPath derives the agent name (filename stem without extension)
// from a filesystem path. Used by copyAgentFile to look up the matrix entry.
func agentNameFromPath(path string) string {
	return strings.TrimSuffix(filepath.Base(path), ".md")
}
