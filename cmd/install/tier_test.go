package main

// Tests for the per-provider cost-tiering layer (issue #424):
//
//  AC-1 [automated]: curated provider->tier->family map sourced from one
//                    checked-in map, no per-agent hardcoding.
//  AC-3 [automated]: ragged-tier fallback resolves to the nearest cheaper
//                    neighbor, never a previous-generation backfill.
//  AC-7 [automated]: resolveActiveTierProvider precedence — flag > persisted
//                    config > absent (model-less baseline); unknown provider
//                    fails closed.
//  AC-8 [automated]: cross-surface structural parity — the curated map and
//                    its concrete-id pin are byte-identical across
//                    cmd/install/transform.go, tools/harness-migrate/migrate.mjs,
//                    and the embedded skills/update-models/SKILL.md copy.

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// ---------------------------------------------------------------------------
// AC-1: curated map content
// ---------------------------------------------------------------------------

func TestProviderTierMaps_AnthropicValues_AC1(t *testing.T) {
	wantFamily := map[string]string{
		"default": "claude-opus",
		"medium":  "claude-sonnet",
		"low":     "claude-haiku",
	}
	assertTierMapEquals(t, "providerTierFamily[anthropic]", providerTierFamily["anthropic"], wantFamily)

	wantConcrete := map[string]string{
		"default": "claude-opus-4-6",
		"medium":  "claude-sonnet-4-6",
		"low":     "claude-haiku-4-5",
	}
	assertTierMapEquals(t, "providerTierConcrete[anthropic]", providerTierConcrete["anthropic"], wantConcrete)
}

func assertTierMapEquals(t *testing.T, label string, got, want map[string]string) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("%s: got %d entries, want %d (got=%v want=%v)", label, len(got), len(want), got, want)
	}
	for tier, wantVal := range want {
		if gotVal := got[tier]; gotVal != wantVal {
			t.Errorf("%s[%q] = %q, want %q", label, tier, gotVal, wantVal)
		}
	}
}

// ---------------------------------------------------------------------------
// AC-3: ragged-tier fallback (nearest cheaper neighbor)
// ---------------------------------------------------------------------------

// TestResolveTierMap_RaggedFallback_AC3 exercises the fallback against a
// synthetic ragged provider (not the real curated map) so the AC-3 contract
// is not coupled to whichever real provider ships next.
func TestResolveTierMap_RaggedFallback_AC3(t *testing.T) {
	ragged := map[string]map[string]string{
		"onlydefault": {"default": "big-model"},
		"missingmid":  {"default": "big-model", "low": "small-model"},
		"full":        {"default": "d", "medium": "m", "low": "l"},
	}

	tests := []struct {
		name     string
		provider string
		tier     string
		want     string
		wantOK   bool
	}{
		{"low falls back to the only populated tier (default)", "onlydefault", "low", "big-model", true},
		{"medium falls back to the only populated tier (default)", "onlydefault", "medium", "big-model", true},
		{"default resolves directly when present", "onlydefault", "default", "big-model", true},
		{"medium falls back to low (cheaper), never back to default", "missingmid", "medium", "small-model", true},
		{"low resolves directly when present", "full", "low", "l", true},
		{"unknown provider", "ghost", "default", "", false},
		{"unknown tier", "full", "premium", "", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := resolveTierMap(ragged, tc.provider, tc.tier)
			if ok != tc.wantOK || got != tc.want {
				t.Errorf("resolveTierMap(%q, %q) = (%q, %v), want (%q, %v)",
					tc.provider, tc.tier, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

// TestResolveTierMap_WorstCaseOneModelServesAllTiers_AC3 asserts the explicit
// AC-3 worst case: a provider curated with only its most expensive tier still
// resolves every tier request (medium, low) to that one model, rather than
// leaving the cheaper tiers unresolved.
func TestResolveTierMap_WorstCaseOneModelServesAllTiers_AC3(t *testing.T) {
	tiers := map[string]map[string]string{
		"x": {"default": "only-model"},
	}
	for _, tier := range []string{"default", "medium", "low"} {
		got, ok := resolveTierMap(tiers, "x", tier)
		if !ok || got != "only-model" {
			t.Errorf("resolveTierMap(%q) = (%q, %v), want (%q, true) — one curated model must serve every tier", tier, got, ok, "only-model")
		}
	}
}

// TestResolveTierMap_PrefersCheaperOverMoreExpensive_AC3 asserts that when
// BOTH a cheaper and a more-expensive neighbor are available, the cheaper one
// wins — the more-expensive fallback is strictly a last resort.
func TestResolveTierMap_PrefersCheaperOverMoreExpensive_AC3(t *testing.T) {
	tiers := map[string]map[string]string{
		"x": {"default": "expensive", "low": "cheap"}, // "medium" absent
	}
	got, ok := resolveTierMap(tiers, "x", "medium")
	if !ok || got != "cheap" {
		t.Errorf("resolveTierMap(medium) = (%q, %v), want (%q, true) — cheaper neighbor (low) must win over the more expensive one (default)", got, ok, "cheap")
	}
}

// ---------------------------------------------------------------------------
// AC-7: resolveActiveTierProvider precedence + fail-closed validation
// ---------------------------------------------------------------------------

func TestResolveActiveTierProvider_FlagTakesPrecedence_AC7(t *testing.T) {
	prevRuntime, prevFlag := runtimeFlag, opencodeTierFlag
	defer func() { runtimeFlag, opencodeTierFlag = prevRuntime, prevFlag }()

	runtimeFlag = "opencode"
	opencodeTierFlag = "anthropic"

	placer := newOpencodePlacerAt(t.TempDir())
	got, err := resolveActiveTierProvider(placer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "anthropic" {
		t.Errorf("resolveActiveTierProvider() = %q, want %q (flag precedence)", got, "anthropic")
	}
}

func TestResolveActiveTierProvider_AbsentEverywhereIsModelLess_AC7(t *testing.T) {
	prevRuntime, prevFlag := runtimeFlag, opencodeTierFlag
	defer func() { runtimeFlag, opencodeTierFlag = prevRuntime, prevFlag }()

	runtimeFlag = "opencode"
	opencodeTierFlag = ""

	placer := newOpencodePlacerAt(t.TempDir())
	got, err := resolveActiveTierProvider(placer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "" {
		t.Errorf("resolveActiveTierProvider() = %q, want \"\" (absent flag + absent config = model-less baseline)", got)
	}
}

// TestSelectTransform_ClaudeCodeRuntimeIsAlwaysModelLess_AC7 asserts the
// runtime gate lives in selectTransform (not resolveActiveTierProvider,
// which only resolves precedence given a placer): the claude-code runtime
// never tiers, even when --opencode-tier happens to be set.
func TestSelectTransform_ClaudeCodeRuntimeIsAlwaysModelLess_AC7(t *testing.T) {
	prevRuntime, prevFlag := runtimeFlag, opencodeTierFlag
	defer func() { runtimeFlag, opencodeTierFlag = prevRuntime, prevFlag }()

	runtimeFlag = "claude-code"
	opencodeTierFlag = "anthropic" // even if set, claude-code never tiers

	placer := newOpencodePlacerAt(t.TempDir())
	transform, err := selectTransform(placer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if transform != nil {
		t.Error("selectTransform() returned a non-nil transform for the claude-code runtime — claude-code must use identity (nil)")
	}
}

func TestResolveActiveTierProvider_UnknownProviderFailsClosed_AC7(t *testing.T) {
	prevRuntime, prevFlag := runtimeFlag, opencodeTierFlag
	defer func() { runtimeFlag, opencodeTierFlag = prevRuntime, prevFlag }()

	runtimeFlag = "opencode"
	opencodeTierFlag = "not-a-real-provider"

	placer := newOpencodePlacerAt(t.TempDir())
	_, err := resolveActiveTierProvider(placer)
	if err == nil {
		t.Error("resolveActiveTierProvider() with an unrecognized provider should fail closed (return an error), got nil")
	}
}

func TestResolveActiveTierProvider_PersistedConfigReadOnRerun_AC7(t *testing.T) {
	prevRuntime, prevFlag := runtimeFlag, opencodeTierFlag
	defer func() { runtimeFlag, opencodeTierFlag = prevRuntime, prevFlag }()

	runtimeFlag = "opencode"
	opencodeTierFlag = "" // no flag on this re-run — must read the persisted value

	configRoot := t.TempDir()
	cfgPath := opencodeSettingsConfigPath(configRoot)
	if err := os.WriteFile(cfgPath, []byte(`{"opencode.cost_tier_provider":"anthropic"}`), 0o600); err != nil {
		t.Fatalf("write fixture config: %v", err)
	}

	placer := newOpencodePlacerAt(configRoot)
	got, err := resolveActiveTierProvider(placer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "anthropic" {
		t.Errorf("resolveActiveTierProvider() = %q, want %q (persisted config read on re-run)", got, "anthropic")
	}
}

// ---------------------------------------------------------------------------
// AC-8: cross-surface structural parity
// ---------------------------------------------------------------------------

// TestProviderTierMaps_CrossSurfaceParity_AC8 asserts that providerTierFamily
// and providerTierConcrete (the Go source of truth) are byte-identical in
// VALUE to the PROVIDER_TIER_FAMILY / PROVIDER_TIER_CONCRETE maps declared in
// tools/harness-migrate/migrate.mjs and to every occurrence of the same two
// maps embedded in skills/update-models/SKILL.md.
//
// This is the multi-site invariant lock (01-plan.md § Multi-site invariants):
// a drift at ANY one of the three sites reds this test and names exactly
// which site and which (provider, tier) drifted.
func TestProviderTierMaps_CrossSurfaceParity_AC8(t *testing.T) {
	repoRoot := repoRootForTierTest(t)

	migratePath := filepath.Join(repoRoot, "tools", "harness-migrate", "migrate.mjs")
	skillPath := filepath.Join(repoRoot, "skills", "update-models", "SKILL.md")

	migrateSrc := mustReadFile(t, migratePath)
	skillSrc := mustReadFile(t, skillPath)

	jsFamily := extractJSProviderTierMap(t, migrateSrc, "PROVIDER_TIER_FAMILY")
	jsConcrete := extractJSProviderTierMap(t, migrateSrc, "PROVIDER_TIER_CONCRETE")

	skillFamilyOccurrences := extractQuotedProviderTierMapOccurrences(t, skillSrc, "PROVIDER_TIER_FAMILY")
	skillConcreteOccurrences := extractQuotedProviderTierMapOccurrences(t, skillSrc, "PROVIDER_TIER_CONCRETE")

	if len(skillFamilyOccurrences) == 0 {
		t.Fatalf("no PROVIDER_TIER_FAMILY occurrence found in %s — embedded curated map is missing or its format drifted", skillPath)
	}
	if len(skillConcreteOccurrences) == 0 {
		t.Fatalf("no PROVIDER_TIER_CONCRETE occurrence found in %s — embedded curated map is missing or its format drifted", skillPath)
	}

	for provider, goTiers := range providerTierFamily {
		compareProviderTierMap(t, "PROVIDER_TIER_FAMILY", "migrate.mjs", provider, goTiers, jsFamily[provider])
		for i, occ := range skillFamilyOccurrences {
			compareProviderTierMap(t, "PROVIDER_TIER_FAMILY", fmt.Sprintf("SKILL.md (occurrence %d)", i+1), provider, goTiers, occ[provider])
		}
	}

	for provider, goTiers := range providerTierConcrete {
		compareProviderTierMap(t, "PROVIDER_TIER_CONCRETE", "migrate.mjs", provider, goTiers, jsConcrete[provider])
		for i, occ := range skillConcreteOccurrences {
			compareProviderTierMap(t, "PROVIDER_TIER_CONCRETE", fmt.Sprintf("SKILL.md (occurrence %d)", i+1), provider, goTiers, occ[provider])
		}
	}
}

func compareProviderTierMap(t *testing.T, mapName, site, provider string, want, got map[string]string) {
	t.Helper()
	if got == nil {
		t.Errorf("%s: %s has no entry for provider %q (present in Go providerTierFamily/providerTierConcrete)", mapName, site, provider)
		return
	}
	for tier, wantVal := range want {
		if gotVal := got[tier]; gotVal != wantVal {
			t.Errorf("%s drift at site=%s provider=%q tier=%q: Go=%q %s=%q", mapName, site, provider, tier, wantVal, site, gotVal)
		}
	}
	for tier := range got {
		if _, ok := want[tier]; !ok {
			t.Errorf("%s: %s declares tier %q for provider %q that Go's curated map does not have", mapName, site, tier, provider)
		}
	}
}

// extractJSProviderTierMap parses a `const VARNAME = { provider: { tier: "value", ... }, ... };`
// declaration out of migrate.mjs (unquoted JS object keys).
func extractJSProviderTierMap(t *testing.T, src, varName string) map[string]map[string]string {
	t.Helper()
	outer := regexp.MustCompile(`(?s)const\s+` + regexp.QuoteMeta(varName) + `\s*=\s*\{(.*?)\n\};`)
	m := outer.FindStringSubmatch(src)
	if m == nil {
		t.Fatalf("migrate.mjs: %s declaration not found (format drift?)", varName)
	}
	return parseProviderTierBlocks(m[1], `(\w+)\s*:\s*\{([^}]*)\}`, `(\w+)\s*:\s*"([^"]+)"`)
}

// extractQuotedProviderTierMapOccurrences parses every fenced
// `VARNAME = { "provider": { "tier": "value", ... }, ... }` block in
// SKILL.md (quoted JSON/Python-dict-style keys). SKILL.md embeds the curated
// map twice — once in the human-readable contract summary, once inside the
// executable Python resolver block — both occurrences are checked.
func extractQuotedProviderTierMapOccurrences(t *testing.T, src, varName string) []map[string]map[string]string {
	t.Helper()
	outer := regexp.MustCompile(`(?s)` + regexp.QuoteMeta(varName) + `\s*=\s*\{(.*?)\n\}`)
	matches := outer.FindAllStringSubmatch(src, -1)
	var results []map[string]map[string]string
	for _, m := range matches {
		results = append(results, parseProviderTierBlocks(m[1], `"(\w+)"\s*:\s*\{([^}]*)\}`, `"(\w+)"\s*:\s*"([^"]+)"`))
	}
	return results
}

// parseProviderTierBlocks finds provider sub-blocks within body using
// providerPattern, then finds tier:value pairs within each sub-block using
// tierPattern. Both patterns must each have exactly two capture groups.
func parseProviderTierBlocks(body, providerPattern, tierPattern string) map[string]map[string]string {
	providerRE := regexp.MustCompile(providerPattern)
	tierRE := regexp.MustCompile(tierPattern)

	result := map[string]map[string]string{}
	for _, pm := range providerRE.FindAllStringSubmatch(body, -1) {
		provider := pm[1]
		tiers := map[string]string{}
		for _, tm := range tierRE.FindAllStringSubmatch(pm[2], -1) {
			tiers[tm[1]] = tm[2]
		}
		result[provider] = tiers
	}
	return result
}

func mustReadFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

// repoRootForTierTest resolves the repository root from this test file's own
// location (cmd/install/tier_test.go is two directories below the root).
func repoRootForTierTest(t *testing.T) string {
	t.Helper()
	dir := sourceDir(t)
	root := filepath.Clean(filepath.Join(dir, "..", ".."))
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("repoRootForTierTest: %s does not look like the repo root (no go.mod): %v", root, err)
	}
	return root
}
