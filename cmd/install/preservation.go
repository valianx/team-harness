package main

import (
	"strings"
)

// _FAKE_CONTEXT7_KEY is the placeholder used in manual test instructions.
// It must never be treated as a real key.
const _FAKE_CONTEXT7_KEY = "ctx7sk-fake-test-key"

// looksLikeValidMemoryEntry returns true if the entry has the minimum shape of
// a usable memory mcpServer:
//   - type=stdio  with a non-empty command, OR
//   - type=http   with a url starting with http:// or https://
func looksLikeValidMemoryEntry(entry map[string]interface{}) bool {
	if len(entry) == 0 {
		return false
	}
	kind, _ := entry["type"].(string)
	switch kind {
	case "stdio":
		cmd, _ := entry["command"].(string)
		return strings.TrimSpace(cmd) != ""
	case "http":
		url, _ := entry["url"].(string)
		return strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://")
	}
	return false
}

// isValidContext7Key returns true if the key looks like a real context7 key:
//   - non-empty
//   - starts with "ctx7sk-"
//   - length >= 12
//   - is not the fake test placeholder
func isValidContext7Key(key string) bool {
	return key != "" &&
		strings.HasPrefix(key, "ctx7sk-") &&
		len(key) >= 12 &&
		key != _FAKE_CONTEXT7_KEY
}
