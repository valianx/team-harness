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
- **Emit exactly one operator-facing message: the final report** (step 5), after all steps complete. The sole exception is the confirmation gate (step 3) and any error that halts the flow — report it immediately, then stop.
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

**Steps:**
1. `curl -sf https://models.dev/api.json` — fetch the registry. On non-zero exit, empty body, or non-JSON response → **fallback: warn, make NO change**.
2. Locate the Anthropic models. The API returns entries keyed by provider-prefixed id (e.g., `anthropic/claude-opus-4-6`). Collect all keys whose bare form (strip leading `anthropic/` if present) matches `claude-<tier>-*` for each tier.
3. For each tier alias in `{opus, sonnet, haiku}`:
   - Filter to ids whose bare (stripped) form starts with `claude-opus-`, `claude-sonnet-`, or `claude-haiku-` respectively.
   - Among those, pick the one with the **newest `release_date`** by chronological date comparison — **NEVER lexical string sort** (lexical sort picks `4-9` over `4-10`; date comparison on the `release_date` ISO value picks the truly newest).
   - Parse `release_date` as an ISO date (`YYYY-MM-DD`). If any candidate lacks a parseable `release_date`, skip it (do not guess).
   - Produce `anthropic/<bare-id>` as the resolved value.
4. If a tier yields zero valid candidates or every candidate lacks a parseable `release_date` → that tier is **unresolved**; make NO change for files of that tier and report the gap.
5. Today's expected output: `opus → anthropic/claude-opus-4-6`, `sonnet → anthropic/claude-sonnet-4-6`, `haiku → anthropic/claude-haiku-4-5`.

**Fallback invariant (hard):** the skill NEVER writes an empty string, an unvalidated id, or an alias to any file. When the resolver fails (network error, schema drift, zero candidates, unparseable dates), the affected tier(s) are skipped entirely — the existing `model:` line is preserved byte-for-byte.

---

## Step 1 — Fetch and resolve model ids

Run the resolver. Execute the following python3 block via Bash. Pass the result as environment data — do not interpolate raw JSON into the shell command.

```bash
python3 - <<'PYEOF'
import subprocess
import sys
import json
from datetime import date

TIERS = {
    "opus":   "claude-opus-",
    "sonnet": "claude-sonnet-",
    "haiku":  "claude-haiku-",
}

def bare(model_id):
    """Strip provider prefix: 'anthropic/claude-opus-4-6' → 'claude-opus-4-6'."""
    return model_id.removeprefix("anthropic/")

def parse_date(s):
    """Parse ISO date string. Return date object or None on failure."""
    try:
        parts = s.split("-")
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

# models.dev returns a top-level object keyed by provider-prefixed id.
# Collect all Anthropic model entries.
anthropic_models = {}
for key, entry in data.items():
    b = bare(str(key))
    if b.startswith("claude-"):
        release_date = entry.get("release_date") if isinstance(entry, dict) else None
        anthropic_models[b] = release_date

if not anthropic_models:
    print("FALLBACK: no Anthropic models found in response", file=sys.stderr)
    print(json.dumps({"error": "no_models", "resolved": {}}))
    sys.exit(0)

# Resolve newest per tier by release_date date comparison
resolved = {}
gaps = {}
for tier, prefix in TIERS.items():
    candidates = [
        (bare_id, rd)
        for bare_id, rd in anthropic_models.items()
        if bare_id.startswith(prefix)
    ]
    if not candidates:
        gaps[tier] = "no_candidates"
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
        gaps[tier] = "no_parseable_dates"
        continue
    # Pick newest by date
    best = max(dated, key=lambda x: x[1])
    resolved[tier] = "anthropic/" + best[0]

output = {"error": None, "resolved": resolved, "gaps": gaps}
print(json.dumps(output))
PYEOF
```

Capture the JSON output of this block. If the block exits non-zero or prints an `error` field that is not null (other than expected fallback paths), treat that tier as unresolved and continue.

---

## Step 2 — Locate the opencode agents directory

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

---

## Step 3 — Enumerate targets and derive tier

Glob `*.md` under the resolved opencode agents directory. For each file:

1. Read the `model:` line from its YAML frontmatter.
2. Derive the tier from the `model:` value using this mapping:

   | `model:` value (any of these forms)         | Tier   |
   |---------------------------------------------|--------|
   | `anthropic/opus`, `opus`                     | opus   |
   | `anthropic/claude-opus-*` (any dated form)   | opus   |
   | `anthropic/sonnet`, `sonnet`                 | sonnet |
   | `anthropic/claude-sonnet-*`                  | sonnet |
   | `anthropic/haiku`, `haiku`                   | haiku  |
   | `anthropic/claude-haiku-*`                   | haiku  |
   | anything else                                | SKIP   |

3. For files whose tier is SKIP: record them as "skipped (unrecognized model line)" in the final report. Never guess.
4. For files whose tier is resolved but whose tier has no resolver result (gap): record "skipped (resolver gap: <gap reason>)".
5. For files that already have the resolved `anthropic/<id>` as their `model:` value: record as "already current".

Build the planned-rewrites list: only files where the current `model:` value differs from the resolved `anthropic/<id>` for their tier and where the resolver produced a result for that tier.

---

## Step 4 — Confirmation gate (read-only until confirmed)

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
On `Y`: proceed to step 5.

If the planned-rewrites list is empty (all files are already current, skipped, or in gap): report the outcome directly without a confirmation prompt (there is nothing to apply).

---

## Step 5 — Backup and write

Before the first write, take a single rolling backup of the opencode agents directory by copying each target file to `<path>.bak` (overwritten each run, never accumulates). This is a single rolling backup — one `.bak` sibling per target file, not a versioned history.

Rewrite ONLY the `model:` line of each target file. All other bytes are preserved byte-for-byte.

**The agent runs the matching-OS command block below verbatim — do NOT improvise shell commands.**

**Windows (PowerShell) — run this block verbatim on Windows:**
```powershell
# $TARGET_FILES is an array of absolute paths to rewrite
# $RESOLVED is a hashtable mapping tier name to resolved anthropic/<id>
# $TIER_MAP is a hashtable mapping file path to tier name (built in step 3)

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
# RESOLVED is a bash associative array: tier -> anthropic/<id>

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

## Step 6 — Final report

Emit the single operator-facing message. Use the template below verbatim in structure, filling the values from the run.

**(a) Changes applied:**
```
update-models — done

  opus id     anthropic/claude-opus-4-6
  sonnet id   anthropic/claude-sonnet-4-6
  haiku id    anthropic/claude-haiku-4-5

  updated     N file(s)
  current     M file(s) (already on latest id)
  skipped     K file(s) (unrecognized model line or resolver gap)
  backup      written (<path>.bak per updated file — single rolling copy)
```

**(b) Nothing to apply (all current):**
```
update-models — already current

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
- **No opencode agents directory found:** report as shown in step 2 and stop.
- **Partial resolver failure (some tiers gap, others resolved):** apply only the resolved tiers; report gaps. Never block on a single-tier gap.
- **Write error on a specific file:** report the file and the error in the report; continue with remaining files.

Surface every error verbatim. No silent retries.

---

## Important

- This skill refreshes `model:` lines in the operator's opencode agent files only. It never edits source-repository agent files or `~/.claude/agents/*.md`.
- The resolver uses chronological `release_date` comparison (never lexical string sort) so `4-10` correctly beats `4-9`.
- The `.bak` backup per target file is a single rolling copy — it is overwritten each run and does not accumulate.
- The reuse seam: the resolver contract above is authored as a documented, self-contained unit so a future PR can lift it into `cmd/install` (alongside `toProviderPrefixedModel`) and `/th:update`. The extraction is out of scope for this skill.
