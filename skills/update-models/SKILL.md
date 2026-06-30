---
name: update-models
description: Refresh the model: lines in the operator's opencode agent files to the latest concrete Anthropic id per tier, resolved from models.dev at run time.
---

**IMPORTANT:** This skill runs directly — do NOT invoke the `orchestrator` agent or any other agent. Execute all steps yourself using the tools available to you (Bash, Read, Write, Edit, Glob).

Usage: `/th:update-models`

Analyze the input: $ARGUMENTS

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

---

## Output discipline — run quietly, report once

- **Do not narrate intermediate steps.** Execute the contract steps without emitting prose between tool calls — no "Now fetching…", no per-command commentary, no restating what a command returned. Work silently until the end.
- **Emit exactly one operator-facing message: the final report** (step 7), after all steps complete. The sole exception is the confirmation gate (step 5) and any error that halts the flow — report it immediately, then stop.
- **The report is the product.** A titled status block with left-aligned labels and aligned values, neutral declarative voice, no emoji, no celebration, no filler.

---

## Scope — OPENCODE-ONLY

This skill reads and writes **only** the operator's opencode agent directory. It NEVER reads or writes:
- `~/.claude/agents/*.md` (Claude Code agent files — their `model: opus` lines are correct and out of scope)
- `agents/*.md` in any repository (source files — installer-managed, not operator-managed)

The configured opencode agents directory is the only write surface.

---

## Resolver contract (self-contained, liftable unit)

This contract is the reusable core. A future PR may extract it into `cmd/install` (alongside `toProviderPrefixedModel`) and `/th:update`, but the extraction is out of scope here.

**Curated provider→tier→family map (#424).** This is one of three sites that must stay byte-identical (locked by `cmd/install/tier_test.go`): the Go installer (`cmd/install/transform.go` — `providerTierFamily`), the JS contributor tool (`tools/harness-migrate/migrate.mjs` — `PROVIDER_TIER_FAMILY`), and this skill. Anthropic is the only launch provider; the shape is provider-generic so a future provider is a map edit, not a code change.

```
PROVIDER_TIER_FAMILY = {
  "anthropic": { "default": "claude-opus", "medium": "claude-sonnet", "low": "claude-haiku" },
}
```

The Go installer and `migrate.mjs` also pin a release-time concrete id per tier (network-free install bake); this skill always resolves the live equivalent instead of reading the pin, but the pin is reproduced here as the parity anchor and as the "today's expected output" baseline (Resolver Steps, item 5, below):

```
PROVIDER_TIER_CONCRETE = {
  "anthropic": { "default": "claude-opus-4-6", "medium": "claude-sonnet-4-6", "low": "claude-haiku-4-5" },
}
```

This skill's UI vocabulary uses the CC alias names instead of the generic tier labels: `opus = default`, `sonnet = medium`, `haiku = low`.

**Real models.dev shape (`https://models.dev/api.json`, verified live):** the root object is keyed by **provider** (`"anthropic"`, `"openai"`, …). Each provider entry carries a nested **`models`** object keyed by **bare model id** (`"claude-opus-4-6"`). Each model entry carries `id`, `name`, **`family`** (e.g. `"claude-opus"`), `release_date`, and more. This is `data[provider]["models"][bare_id]` — **not** a flat top-level map of provider-prefixed ids. An earlier version of this resolver iterated the top level as if it were keyed by model id; against the live API the top-level keys are provider names, none of which start with `claude-`, so it silently collected zero models and made no change. Always read the nested shape.

**Steps:**
1. `curl -sf https://models.dev/api.json` — fetch the registry. On non-zero exit, empty body, or non-JSON response → **fallback: warn, make NO change**.
2. Read `data[provider]["models"]` for the selected provider (resolved in step 2 of the main flow below) — **not** the top level. Group the entries by each model's **`family`** field — **not** by prefix-matching the bare id.
3. For each tier in `{default, medium, low}` (UI alias `{opus, sonnet, haiku}`):
   - Resolve the tier's family via `PROVIDER_TIER_FAMILY[provider][tier]`, applying the nearest-cheaper-neighbor fallback when the provider's map omits that tier (walk `default → medium → low`, never backfill with a more expensive tier — AC-3).
   - Among the models grouped under that family, pick the one with the **newest `release_date`** by chronological date comparison — **NEVER lexical string sort** (lexical sort picks `4-9` over `4-10`; date comparison on the `release_date` ISO value picks the truly newest).
   - Parse `release_date` as an ISO date (`YYYY-MM-DD`). If any candidate lacks a parseable `release_date`, skip it (do not guess).
   - Produce `<provider>/<bare-id>` as the resolved value.
4. If a tier yields zero valid candidates, every candidate lacks a parseable `release_date`, or the provider has no family at or below the tier → that tier is **unresolved**; make NO change for files of that tier and report the gap.
5. Today's expected output (provider `anthropic`): `opus → anthropic/claude-opus-4-6`, `sonnet → anthropic/claude-sonnet-4-6`, `haiku → anthropic/claude-haiku-4-5`.

**Fallback invariant (hard):** the skill NEVER writes an empty string, an unvalidated id, or an alias to any file. When the resolver fails (network error, schema drift, zero candidates, unparseable dates), the affected tier(s) are skipped entirely — the existing `model:` line is preserved byte-for-byte.

---

## Step 1 — Locate the opencode agents directory

Resolve the operator's opencode agents directory. Check in order:

1. **`$OPENCODE_CONFIG_DIR/agents/`** — if the env var is set, use it directly.
2. **`~/.config/opencode/agents/`** — the standard XDG path on Linux/macOS.
3. **`~/.opencode/agents/`** — the legacy path used by older opencode builds and the team-harness installer (opencode placer).
4. **`%APPDATA%\opencode\agents\`** — Windows path.

On Windows (PowerShell): check `$env:OPENCODE_CONFIG_DIR`, then `$env:APPDATA\opencode\agents`.

Use the first path that exists and is a directory. If none exist, report:

```
update-models — error

  error   no opencode agents directory found
          checked: ~/.config/opencode/agents, ~/.opencode/agents
          action  install opencode or run /th:setup with runtime opencode
```

Then stop.

The **config root** is the parent of the resolved agents directory (e.g. `~/.config/opencode/agents` → config root `~/.config/opencode`). Step 2 reads `<config-root>/.team-harness.json`.

---

## Step 2 — Resolve the selected provider (#424)

Read `opencode.cost_tier_provider` from `<config-root>/.team-harness.json` (the file the installer writes — see Step 1 for `<config-root>`). This is the opt-in per-provider cost-tiering selection (CLAUDE.md §5 single-config-file, merge-write contract — read-only here, this skill never writes that key).

- **Key present and a curated provider** (currently only `"anthropic"`): use it as `PROVIDER` for the rest of this flow.
- **Key absent, file absent, or file unreadable:** default `PROVIDER` to `"anthropic"` — this preserves the skill's pre-#424 behavior (Anthropic-only) and is harmless even when the operator never opted into tiering, because the model-less baseline leaves no `model:` line for this skill to refresh in that case (every file is skipped in Step 4 as "unrecognized model line").
- **Key present but not a curated provider** (a typo, or a provider with no curated map yet): report the gap and stop — do not guess a provider.

```
update-models — error

  error   unrecognized opencode.cost_tier_provider value: "<value>"
          supported providers: anthropic
          action  fix ~/.claude/.team-harness.json (or the opencode-side copy) or re-run install --opencode-tier anthropic
```

---

## Step 3 — Fetch and resolve model ids

Run the resolver. Execute the following python3 block via Bash. Pass the result as environment data — do not interpolate raw JSON into the shell command. Set `TH_PROVIDER` to the value resolved in Step 2.

```bash
TH_PROVIDER="<provider from Step 2>" python3 - <<'PYEOF'
import subprocess
import sys
import json
import os
from datetime import date

PROVIDER = os.environ.get("TH_PROVIDER", "anthropic")

# Curated provider -> tier -> family map. Must stay byte-identical to
# providerTierFamily (cmd/install/transform.go) and PROVIDER_TIER_FAMILY
# (tools/harness-migrate/migrate.mjs) — locked by cmd/install/tier_test.go.
PROVIDER_TIER_FAMILY = {
    "anthropic": {"default": "claude-opus", "medium": "claude-sonnet", "low": "claude-haiku"},
}
TIER_ORDER = ["default", "medium", "low"]
TIER_TO_ALIAS = {"default": "opus", "medium": "sonnet", "low": "haiku"}

def resolve_family_for_tier(provider, tier):
    """Nearest-cheaper-neighbor fallback (AC-3): walk TIER_ORDER from tier
    downward until a populated family entry is found for provider."""
    by_tier = PROVIDER_TIER_FAMILY.get(provider)
    if not by_tier or tier not in TIER_ORDER:
        return None
    start = TIER_ORDER.index(tier)
    for t in TIER_ORDER[start:]:
        if t in by_tier:
            return by_tier[t]
    return None

def parse_date(s):
    """Parse ISO date string. Return date object or None on failure."""
    try:
        parts = str(s).split("-")
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except Exception:
        pass
    return None

# Fetch models.dev
result = subprocess.run(
    ["curl", "-sf", "https://models.dev/api.json"],
    capture_output=True, text=True, timeout=15
)
if result.returncode != 0 or not result.stdout.strip():
    print("FALLBACK: curl failed or empty response", file=sys.stderr)
    print(json.dumps({"error": "fetch_failed", "resolved": {}}))
    sys.exit(0)

try:
    data = json.loads(result.stdout)
except json.JSONDecodeError:
    print("FALLBACK: non-JSON response from models.dev", file=sys.stderr)
    print(json.dumps({"error": "parse_failed", "resolved": {}}))
    sys.exit(0)

# Real models.dev shape: root keyed by provider; each provider carries a
# nested "models" object keyed by bare id (#424 AC-2 fix — the prior resolver
# iterated the top level as if it were keyed by model id, which silently
# collected zero models against the live API).
provider_obj = data.get(PROVIDER) if isinstance(data, dict) else None
models = provider_obj.get("models", {}) if isinstance(provider_obj, dict) else {}

if not models:
    print(f"FALLBACK: no models found for provider {PROVIDER!r} in response", file=sys.stderr)
    print(json.dumps({"error": "no_models", "resolved": {}}))
    sys.exit(0)

# Group candidates by the model's "family" field — NOT by id-prefix matching.
by_family = {}
for bare_id, entry in models.items():
    if not isinstance(entry, dict):
        continue
    family = entry.get("family")
    if not family:
        continue
    by_family.setdefault(family, []).append((bare_id, entry.get("release_date")))

# Resolve newest per tier by release_date date comparison
resolved = {}
gaps = {}
for tier in TIER_ORDER:
    alias = TIER_TO_ALIAS[tier]
    family = resolve_family_for_tier(PROVIDER, tier)
    if not family:
        gaps[alias] = "no_family_for_tier"
        continue
    candidates = by_family.get(family, [])
    if not candidates:
        gaps[alias] = "no_candidates"
        continue
    # Filter to those with a parseable release_date
    dated = []
    for bare_id, rd_str in candidates:
        if not rd_str:
            continue
        d = parse_date(str(rd_str))
        if d is not None:
            dated.append((bare_id, d))
    if not dated:
        gaps[alias] = "no_parseable_dates"
        continue
    # Pick newest by date
    best = max(dated, key=lambda x: x[1])
    resolved[alias] = PROVIDER + "/" + best[0]

output = {"error": None, "provider": PROVIDER, "resolved": resolved, "gaps": gaps}
print(json.dumps(output))
PYEOF
```

Capture the JSON output of this block. If the block exits non-zero or prints an `error` field that is not null (other than expected fallback paths), treat that tier as unresolved and continue.

---

## Step 4 — Enumerate targets, derive tier, and detect a provider switch

Glob `*.md` under the resolved opencode agents directory. For each file:

1. Read the `model:` line from its YAML frontmatter.
2. Derive the tier and the file's **current provider** (the segment before `/`, or `anthropic` for a bare alias with no prefix) from the `model:` value using this mapping:

   | `model:` value (any of these forms)              | Tier   | Current provider          |
   |---------------------------------------------------|--------|----------------------------|
   | `<provider>/opus`, `opus`                          | opus   | `<provider>` or `anthropic`|
   | `<provider>/claude-opus-*` (any dated form)        | opus   | `<provider>`               |
   | `<provider>/sonnet`, `sonnet`                      | sonnet | `<provider>` or `anthropic`|
   | `<provider>/claude-sonnet-*`                       | sonnet | `<provider>`               |
   | `<provider>/haiku`, `haiku`                        | haiku  | `<provider>` or `anthropic`|
   | `<provider>/claude-haiku-*`                        | haiku  | `<provider>`               |
   | anything else                                      | SKIP   | —                          |

3. For files whose tier is SKIP: record them as "skipped (unrecognized model line)" in the final report. Never guess.
4. For files whose tier is resolved but whose tier has no resolver result (gap): record "skipped (resolver gap: <gap reason>)".
5. For files that already have the resolved `<PROVIDER>/<id>` (PROVIDER from Step 2) as their `model:` value: record as "already current".

**Never-mix-providers regeneration (#424 AC-6):** if ANY recognized-tier file's current provider differs from the PROVIDER selected in Step 2, the operator previously tiered with a different provider. Treat this as a full provider switch: regenerate **every** recognized-tier file to `<PROVIDER>/<resolved-id>`, not only the files whose value already differs from the freshly resolved id. This guarantees the installed set never carries a mix of providers (which opencode would reject with `ProviderModelNotFoundError` for the off-provider ids the moment the operator's global model selection points at PROVIDER).

Build the planned-rewrites list:
- **No provider switch detected:** only files where the current `model:` value differs from the resolved `<PROVIDER>/<id>` for their tier and where the resolver produced a result for that tier.
- **Provider switch detected:** every recognized-tier file whose tier has a resolver result, regardless of whether its current value happens to already equal the freshly resolved id.

---

## Step 5 — Confirmation gate (read-only until confirmed)

Render the planned rewrites as a table and wait for explicit operator confirmation. No file is written until confirmation is given.

```
update-models — planned changes

  resolved ids
    opus     anthropic/claude-opus-4-6
    sonnet   anthropic/claude-sonnet-4-6
    haiku    anthropic/claude-haiku-4-5

  files to update (N)
    <path/agent.md>   model: anthropic/opus → anthropic/claude-opus-4-6
    <path/agent.md>   model: anthropic/sonnet → anthropic/claude-sonnet-4-6
    ...

  already current (M)
    <path/agent.md>   model: anthropic/claude-opus-4-6

  skipped (K)
    <path/agent.md>   unrecognized model line
    <path/agent.md>   resolver gap: no_candidates (haiku)

Apply these changes? [Y/n]
```

On `n` or empty (treat empty as `n`): print `No changes made.` and stop.
On `Y`: proceed to step 6.

If the planned-rewrites list is empty (all files are already current, skipped, or in gap): report the outcome directly without a confirmation prompt (there is nothing to apply).

---

## Step 6 — Backup and write

Before the first write, take a single rolling backup of the opencode agents directory by copying each target file to `<path>.bak` (overwritten each run, never accumulates). This is a single rolling backup — one `.bak` sibling per target file, not a versioned history.

Rewrite ONLY the `model:` line of each target file. All other bytes are preserved byte-for-byte.

**The agent runs the matching-OS command block below verbatim — do NOT improvise shell commands.**

**Windows (PowerShell) — run this block verbatim on Windows:**
```powershell
# $TARGET_FILES is an array of absolute paths to rewrite
# $RESOLVED is a hashtable mapping tier name to resolved <PROVIDER>/<id>
# $TIER_MAP is a hashtable mapping file path to tier name (built in step 4)

foreach ($filePath in $TARGET_FILES) {
    $tier = $TIER_MAP[$filePath]
    $newModelValue = $RESOLVED[$tier]
    if (-not $newModelValue) { continue }

    # Single rolling backup (overwrite each run — never accumulates)
    Copy-Item $filePath "$filePath.bak"

    # Rewrite only the model: line — all other bytes preserved
    $TH_FILE = $filePath
    $TH_NEW_MODEL = $newModelValue
    $content = Get-Content $filePath -Raw
    $updated = [regex]::Replace($content, '(?m)^model:[ \t].*$', "model: $TH_NEW_MODEL")
    Set-Content $filePath $updated -NoNewline
}
```

**Unix/macOS (bash) — run this block verbatim on Linux/macOS:**
```bash
# TARGET_FILES is a newline-separated list of absolute paths
# TIER_MAP is a bash associative array: file -> tier
# RESOLVED is a bash associative array: tier -> <PROVIDER>/<id>

while IFS= read -r file_path; do
    tier="${TIER_MAP[$file_path]}"
    new_model="${RESOLVED[$tier]}"
    [ -z "$new_model" ] && continue

    # Single rolling backup (overwrite each run — never accumulates)
    cp "$file_path" "$file_path.bak"

    # Rewrite only the model: line — all other bytes preserved
    # Values passed via environment (not interpolated into python source)
    TH_FILE="$file_path" TH_NEW_MODEL="$new_model" python3 -c '
import os, re
path = os.environ["TH_FILE"]
new_model = os.environ["TH_NEW_MODEL"]
content = open(path, "r", encoding="utf-8").read()
updated = re.sub(r"(?m)^model:[ \t].*$", "model: " + new_model, content)
open(path, "w", encoding="utf-8").write(updated)
'
done <<< "$TARGET_FILES"
```

---

## Step 7 — Final report

Emit the single operator-facing message. Use the template below verbatim in structure, filling the values from the run.

**(a) Changes applied:**
```
update-models — done

  provider    anthropic
  opus id     anthropic/claude-opus-4-6
  sonnet id   anthropic/claude-sonnet-4-6
  haiku id    anthropic/claude-haiku-4-5

  updated     N file(s)
  current     M file(s) (already on latest id)
  skipped     K file(s) (unrecognized model line or resolver gap)
  backup      written (<path>.bak per updated file — single rolling copy)
```

Add a `provider-switch  yes (regenerated all N file(s))` row when Step 4 detected a provider switch (AC-6).

**(b) Nothing to apply (all current):**
```
update-models — already current

  provider    anthropic
  opus id     anthropic/claude-opus-4-6
  sonnet id   anthropic/claude-sonnet-4-6
  haiku id    anthropic/claude-haiku-4-5

  current     N file(s)
  skipped     K file(s)
```

**(c) Partial (resolver gaps for some tiers):**
Include a `gaps` row naming the affected tiers and reasons. Apply only for the resolved tiers; skip the rest.

```
update-models — partial

  provider    anthropic
  opus id     anthropic/claude-opus-4-6
  sonnet id   anthropic/claude-sonnet-4-6
  haiku id    UNRESOLVED (no_candidates)

  updated     N file(s)
  skipped     K file(s) (includes haiku files — resolver gap)
  gaps        haiku: no_candidates
```

**(d) Operator declined:**
```
update-models — no changes made

  action  operator declined at confirmation gate
```

In all cases: if a resolver fallback was triggered, include a `fallback` row with the reason.

---

## Error handling

- **`curl` not on PATH:** report `curl not found on PATH; cannot fetch models.dev.` and stop.
- **`python3` not on PATH:** report `python3 not found on PATH; cannot run the resolver or write files.` and stop.
- **`models.dev` unreachable or non-JSON:** report the fallback row in the final report; make NO change.
- **No opencode agents directory found:** report as shown in step 1 and stop.
- **Unrecognized `opencode.cost_tier_provider` value:** report as shown in step 2 and stop — never guess a provider.
- **Partial resolver failure (some tiers gap, others resolved):** apply only the resolved tiers; report gaps. Never block on a single-tier gap.
- **Write error on a specific file:** report the file and the error in the report; continue with remaining files.

Surface every error verbatim. No silent retries.

---

## Important

- This skill refreshes `model:` lines in the operator's opencode agent files only. It never edits source-repository agent files or `~/.claude/agents/*.md`.
- The resolver uses chronological `release_date` comparison (never lexical string sort) so `4-10` correctly beats `4-9`.
- The resolver groups models.dev candidates by the model's `family` field within the SELECTED provider's nested `models` object — never by prefix-matching the bare id and never across the top level of the response (#424 AC-2).
- Providers are never mixed: a provider switch (Step 2 resolves a different provider than what is currently baked into the agent files) regenerates the WHOLE set for the newly selected provider (#424 AC-6).
- The `.bak` backup per target file is a single rolling copy — it is overwritten each run and does not accumulate.
- The reuse seam: the resolver contract above is authored as a documented, self-contained unit so a future PR can lift it into `cmd/install` (alongside `toProviderPrefixedModel`) and `/th:update`. The extraction is out of scope for this skill.
