package main

// opencodeMCPMigration carries values supplied by an explicit migration or
// compatibility caller. The normal setup flow preserves source-runtime MCP
// credentials and existing native entries; this value carrier remains because
// the active resolver and disclosure helpers use it.
//
// MemoryURL is a URL, not a secret. MemoryBearer and Context7Key are literal
// token strings when supplied by a caller; they are treated as potentially
// sensitive and are NEVER persisted to logs. They flow through a transient
// opencodeMCPSecrets struct only when an explicit caller requests literal
// output.
type opencodeMCPMigration struct {
	// MemoryURL is the HTTP URL supplied by an explicit caller (non-secret).
	// Empty when no migration value is available.
	MemoryURL string

	// MemoryBearer is a caller-supplied raw bearer token (without a Bearer
	// prefix). Empty when no auth value is supplied.
	MemoryBearer string

	// Context7Key is a caller-supplied Context7 API key. Empty when no key is
	// supplied.
	Context7Key string
}

// tokenMode controls whether secrets are written as literal values or as
// {env:VAR} references in the opencode.json MCP entries.
type tokenMode int

const (
	// tokenModeEnvRef is the default: secrets are written as {env:VAR} references.
	// opencode resolves the env var at runtime (SEC-OC-R1 preserved).
	tokenModeEnvRef tokenMode = iota

	// tokenModeLiteral writes caller-supplied literal secret values into
	// opencode.json. It is opt-in; the normal setup path remains env-ref.
	tokenModeLiteral
)

// opencodeMCPSecrets carries the literal token values for the tokenModeLiteral
// path. It is transient and passed only by an explicit caller that chooses
// literal output; the normal setup path uses tokenModeEnvRef.
type opencodeMCPSecrets struct {
	MemoryBearer string
	Context7Key  string
}
