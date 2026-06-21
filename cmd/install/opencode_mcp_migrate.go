package main

// opencodeMCPMigration carries the CC MCP config values extracted from
// ~/.claude.json mcpServers. Only memory and context7 are ever read —
// no other servers are inspected (AC-4).
//
// All three fields are non-secret FROM THE PERSPECTIVE of the reader
// (MemoryURL is a URL, not a secret). MemoryBearer and Context7Key are
// literal token strings extracted from the CC config; they are treated
// as potentially sensitive and are NEVER persisted to any config file or
// log. They flow through a transient opencodeMCPSecrets struct only when
// the operator explicitly confirms literal import (AC-7).
type opencodeMCPMigration struct {
	// MemoryURL is the http URL from mcpServers.memory (non-secret).
	// Empty when the entry is absent or is a stdio-type entry.
	MemoryURL string

	// MemoryBearer is the raw bearer token from
	// mcpServers.memory.headers.Authorization (Bearer-prefix stripped).
	// Empty when no auth header is present.
	MemoryBearer string

	// Context7Key is the value of
	// mcpServers.context7.headers.CONTEXT7_API_KEY.
	// Empty when the entry or header is absent.
	Context7Key string
}

// readClaudeCodeMCPMigration reads the CC MCP config from ~/.claude.json and
// returns the migration candidate. It reuses the existing readExistingMCPServers
// helper and only ever indexes the "memory" and "context7" entries — no
// enumeration of other servers (AC-4 security contract).
//
// Errors (file absent, malformed JSON, missing entries) are silently swallowed:
// all fields default to empty, and the caller skips migration gracefully.
func readClaudeCodeMCPMigration() opencodeMCPMigration {
	servers := readExistingMCPServers()

	memEntry := mapGet(servers, "memory")
	ctx7Entry := mapGet(servers, "context7")

	return opencodeMCPMigration{
		MemoryURL:    urlFromEntry(memEntry),
		MemoryBearer: bearerFromEntry(memEntry),
		Context7Key:  mapGetString(ctx7Entry, "headers", "CONTEXT7_API_KEY"),
	}
}

// hasLiteralTokens reports whether the migration contains any detectable
// literal secret tokens (Memory bearer or context7 key).
func (m opencodeMCPMigration) hasLiteralTokens() bool {
	return m.MemoryBearer != "" || m.Context7Key != ""
}

// tokenMode controls whether secrets are written as literal values or as
// {env:VAR} references in the opencode.json MCP entries.
type tokenMode int

const (
	// tokenModeEnvRef is the default: secrets are written as {env:VAR} references.
	// opencode resolves the env var at runtime (SEC-OC-R1 preserved).
	tokenModeEnvRef tokenMode = iota

	// tokenModeLiteral writes the literal secret values into opencode.json.
	// This conditionally relaxes SEC-OC-R1:
	//   - Interactive path: reachable via the explicit token-import confirm
	//     (runTokenImportConfirm, AC-7 original behaviour).
	//   - Non-interactive CC→opencode migration path: reachable when the
	//     operator's ~/.claude.json carried literal tokens AND the apply path
	//     is non-interactive (fix(install): scoped relaxation, operator-locked
	//     at STAGE-GATE-1). Gated on ccMigration.hasLiteralTokens() so that
	//     an empty/absent CC token never writes an empty literal.
	tokenModeLiteral
)

// opencodeMCPSecrets carries the literal token values for the tokenModeLiteral
// path. It is constructed in two places:
//   - Interactive Yes branch of runTokenImportConfirm (original AC-7 contract).
//   - Non-interactive CC→opencode migration branch in runOpencodePostApply when
//     ccMigration.hasLiteralTokens() is true (fix(install): scoped relaxation).
//
// The struct is transient: it is passed down the call chain and is never
// stored in any persistent config file other than the deliberate
// literal-into-opencode.json write on the Yes/migration path.
type opencodeMCPSecrets struct {
	MemoryBearer string
	Context7Key  string
}
