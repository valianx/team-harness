package main

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
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

	// Locate the frontmatter block: must start with "---\n" at byte 0, then
	// find the first "\n---\n" (or "\n---" at EOF) after position 3.
	if !bytes.HasPrefix(srcBytes, []byte("---\n")) {
		fmt.Fprintf(os.Stderr, "  [warn] transformAgentFile(%s): no opening frontmatter '---'; leaving unchanged\n", agentName)
		return srcBytes
	}

	// Find the closing --- of the frontmatter. We search from position 4 so
	// the opening marker itself is not matched.
	fmEnd := findFrontmatterEnd(srcBytes)
	if fmEnd < 0 {
		fmt.Fprintf(os.Stderr, "  [warn] transformAgentFile(%s): no closing frontmatter '---'; leaving unchanged\n", agentName)
		return srcBytes
	}

	// fmEnd points at the '\n' that precedes the closing "---" fence.
	// Split into three regions:
	//   preamble  = "---\n"                        (bytes 0..3)
	//   fmBody    = YAML lines, no trailing '\n'   (bytes 4..fmEnd-1)
	//   suffix    = "---\n" + rest of file         (bytes fmEnd+1..)
	//
	// We skip the '\n' at fmEnd when reconstructing so the rewritten lines
	// (each ending with '\n') directly adjoin the closing "---" without an
	// extra blank line.
	frontmatter := srcBytes[4:fmEnd]  // YAML lines, no trailing '\n'
	suffix := srcBytes[fmEnd+1:]      // "---\n" + prompt body

	rewritten := rewriteFrontmatterLines(frontmatter, override)
	var out bytes.Buffer
	out.WriteString("---\n")
	out.Write(rewritten)
	out.Write(suffix)
	return out.Bytes()
}

// findFrontmatterEnd locates the end of the frontmatter block in src.
// The opening "---\n" at position 0 must already have been confirmed by the caller.
// Returns the byte offset of the '\n' that immediately precedes the closing "---"
// line, or -1 if no closing fence is found.
//
// Example: "---\nkey: val\n---\nrest" → returns offset of the '\n' before the
// second "---", i.e. the '\n' after "key: val".
func findFrontmatterEnd(src []byte) int {
	// We look for "\n---" starting at offset 4 (after the opening "---\n").
	search := []byte("\n---")
	idx := bytes.Index(src[4:], search)
	if idx < 0 {
		return -1
	}
	// idx is relative to src[4:]. Convert back to absolute and point at the '\n'.
	return 4 + idx
}

// rewriteFrontmatterLines scans each line in the frontmatter block (the bytes
// between the two "---" fences, not including the fences or the separating
// newlines) and replaces lines that begin with "model:" or "effort:"
// (case-sensitive, with optional leading whitespace) with the override values.
// Every scanned line is re-emitted with a trailing '\n'. The caller is
// responsible for not including a trailing '\n' in block (see transformAgentFile).
func rewriteFrontmatterLines(block []byte, override AgentOverride) []byte {
	var out bytes.Buffer
	scanner := bufio.NewScanner(bytes.NewReader(block))
	for scanner.Scan() {
		line := scanner.Text()
		key := strings.TrimLeft(line, " \t")
		switch {
		case strings.HasPrefix(key, "model:"):
			out.WriteString("model: " + override.Model + "\n")
		case strings.HasPrefix(key, "effort:"):
			out.WriteString("effort: " + override.Effort + "\n")
		default:
			out.WriteString(line + "\n")
		}
	}
	return out.Bytes()
}

// agentNameFromPath derives the agent name (filename stem without extension)
// from a filesystem path. Used by copyAgentFile to look up the matrix entry.
func agentNameFromPath(path string) string {
	base := path
	// Strip directory component.
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			base = path[i+1:]
			break
		}
	}
	// Strip ".md" extension.
	if strings.HasSuffix(base, ".md") {
		return base[:len(base)-3]
	}
	return base
}
