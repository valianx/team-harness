---
name: update
description: Update the th plugin — refresh catalog, download the new version, sync managed CLAUDE.md blocks. Reload is operator-driven.
---

Refresh the `team-harness` plugin marketplace catalog, report whether a new `th` release is available, and keep the managed `~/.claude/CLAUDE.md` blocks aligned with the running plugin version. This is a standalone utility — it does NOT route through the orchestrator. It is the repeatable update command; `/th:setup` is the one-time bootstrap and is never part of this flow.

Usage: `/th:update`

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
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

---

## Output discipline — run quietly, report once

Operators run this skill routinely; the value is a clean result, not a play-by-play.

- **Do not narrate intermediate steps.** Execute the contract steps without emitting prose between tool calls — no "Now refreshing…", no per-command commentary, no restating what a command returned, no step-by-step headers. Work silently until the end.
- **The harness's activity indicator is the progress bar.** While the tool calls run, Claude Code shows its own running-command indicator; that is the progress signal. A skill cannot render an animated progress bar of its own, and must not simulate one with repeated text, percentage prints, or spinner characters. Rely on the harness indicator during execution and the single final report after it.
- **Emit exactly one operator-facing message: the final report** (step 7), after all steps complete. The sole exception is an error that halts the flow (see Error handling) — report it immediately, then stop.
- **The report is the product.** It must read like the output of a mature CLI tool: a titled status block with left-aligned labels and aligned values, neutral declarative voice, no emoji, no celebration, no filler. Keep it scannable in a couple of seconds.

---

## The update flow has THREE steps — the skill does two, the operator does one

A `th` update is not "refresh catalog + reload". It is three distinct steps, and skipping the middle one leaves `/reload-plugins` with nothing new to activate:

1. **Refresh the catalog** — `claude plugin marketplace update team-harness-marketplace`. Updates the marketplace metadata (`marketplace.json`) so the CLI knows a newer version exists. **This does NOT download any plugin files.**
2. **Download the new version** — `claude plugin update th@team-harness-marketplace`. Fetches the new version into the plugin cache (`~/.claude/plugins/cache/.../th/<new-version>/`). The CLI prints `Restart to apply changes`. **This is the step that actually downloads; the catalog refresh alone does not.**
3. **Activate** — `/reload-plugins` (or restart Claude Code). Loads the downloaded version into the running session.

This skill performs steps 1 and 2 via the `claude` CLI (both are runnable from Bash). It **cannot** perform step 3: `/reload-plugins` and `/plugin …` are Claude Code UI commands with no agent-callable tool. So the skill refreshes, downloads, syncs the managed blocks, reports — then stops. Do not claim the new version is active; it is not until the operator reloads.

(Historical note: `claude plugin update` is only a no-op when the installed version already equals the catalog's latest. Once the catalog refresh in step 1 surfaces a newer version, step 2 does real work — it is mandatory, not optional.)

---

## Contract

1. **Capture the installed version.** Run `claude plugin list`. Parse the block for `th@team-harness-marketplace` and extract its `Version:` value. If the plugin is not listed, report `th plugin not installed via team-harness-marketplace.` and stop — direct the operator to `/plugin install th@team-harness-marketplace`.

2. **Refresh the marketplace catalog.** Run `claude plugin marketplace update team-harness-marketplace`. Surface any error verbatim and stop on failure — do not proceed to the version comparison with stale data.

3. **Read the latest available version.** Read `~/.claude/plugins/marketplaces/team-harness-marketplace/.claude-plugin/marketplace.json` (refreshed by step 2). Take the `version` field of the `th` entry under `plugins`. On Windows the path resolves under the operator's home directory — use the Read tool, not a shell `cat`, so the path is portable.

4. **Compare.** Compare installed (step 1) vs latest (step 3) using semantic-version ordering:
   - **Update available** (latest > installed): proceed to step 5 (download).
   - **Already current** (latest == installed): no download needed; skip to step 6 (block sync still runs). State that the plugin is current; no reload required.
   - **Installed ahead** (installed > latest): unusual; report both versions, note the catalog may not have propagated the latest release yet, and skip the download.

5. **Download the new version** (only when an update is available). Run `claude plugin update th@team-harness-marketplace`. This fetches the new version into the plugin cache and prints `… updated from <X> to <Y>. Restart to apply changes.` Surface any error verbatim and stop on failure. Do NOT skip this — the catalog refresh in step 2 does not download files, so without this step `/reload-plugins` has nothing new to activate.

6. **Sync the managed `~/.claude/CLAUDE.md` blocks (always — idempotent).** This is the recurring counterpart to `/th:setup`'s one-time bootstrap: `/th:setup` runs once to configure MCP servers and workspace mode; `/th:update` keeps the managed blocks aligned on every run. Do NOT tell the operator to re-run `/th:setup` for this — `/th:update` owns the recurring sync.
   - **Source of truth.** The two active managed blocks live in canonical files under `skills/setup/managed-blocks/` in the plugin cache. Read each file directly from the **highest version directory** present under `~/.claude/plugins/cache/team-harness-marketplace/th/` (semver-sorted) — after step 5 that is the just-downloaded version, so the synced blocks match the version the operator is about to activate:
     - `managed-blocks/orchestrator-dispatch-rule.md` (markers: `<!-- orchestrator-dispatch-rule:start -->` … `<!-- orchestrator-dispatch-rule:end -->`)
     - `managed-blocks/voice-rule.md` (markers: `<!-- voice-rule:start -->` … `<!-- voice-rule:end -->`)
     Full paths under the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<latest>/skills/setup/managed-blocks/{orchestrator-dispatch-rule,voice-rule}.md`
   - **Cleanup — remove retired blocks.** Three blocks were retired in v2.89.0 and must be removed from existing `~/.claude/CLAUDE.md` files if present:
     - `<!-- dev-mode:start -->` … `<!-- dev-mode:end -->` (retired — dev mode is no longer a mode)
     - `<!-- nested-dispatch-takeover:start -->` … `<!-- nested-dispatch-takeover:end -->` (retired — takeover machinery scoped to opencode docs only)
     - `<!-- dev-mode-entry:start -->` … `<!-- dev-mode-entry:end -->` (retired earlier — trigger-phrase mechanism replaced by output style)
     For each: if both start and end markers are present in `~/.claude/CLAUDE.md`, remove the entire block (inclusive of markers). If absent, no action.
   - **Developer-mode output style sync.** After syncing managed blocks, re-copy `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (create the directory if absent). This keeps the output style aligned with the installed plugin version.
   - **Back up** `~/.claude/CLAUDE.md` to a single rolling backup `~/.claude/CLAUDE.md.bak` (overwritten each run) before the first write. If the file does not exist, create it (blocks-only) and skip the backup. No backup history accumulates and nothing is ever deleted — exactly one rolling backup is kept.
   - **Write each block — DESTRUCTIVE replace, no content validation beyond marker-presence.** For each of the two canonical files: read its full content (that is the block, start marker to end marker inclusive). If both its start and end markers are present in `~/.claude/CLAUDE.md`, replace everything from the start marker to the end marker inclusive with the canonical file content. If the markers are absent, append the canonical file content at the end of the file. This is a DESTRUCTIVE replace: no comparison of existing content; only marker presence is checked. The agent runs the matching-OS command block below verbatim — do NOT improvise shell commands.
   - Also migrate legacy orchestrator markers (`<!-- th-orchestrator-inline-rule:start -->`, `<!-- th-orchestrator-dispatch-rule:start -->`) by replacing them with the current `orchestrator-dispatch-rule` block.
   - **Never touch anything outside the marker-delimited blocks.** All other content in `~/.claude/CLAUDE.md` is the operator's and is preserved byte-for-byte.
   - **Record** each block's outcome (`updated` / `inserted` / `already current` / `removed`) for the `managed blocks` row of the final report (step 7). Do not print it inline — the report is the only operator-facing message.

   **Windows (PowerShell) — run this block verbatim on Windows:**
   ```powershell
   # Resolve the highest-version plugin directory
   $pluginBase = "$env:USERPROFILE\.claude\plugins\cache\team-harness-marketplace\th"
   $latestDir = Get-ChildItem -Path $pluginBase -Directory |
       Sort-Object { [Version]($_.Name -replace '[^0-9.]','') } |
       Select-Object -Last 1
   $mbDir = "$($latestDir.FullName)\skills\setup\managed-blocks"
   $claudeMd = "$env:USERPROFILE\.claude\CLAUDE.md"

   # Backup (single rolling backup — overwritten each run, never accumulates)
   Copy-Item $claudeMd "$claudeMd.bak"

   # Sync active managed blocks (DESTRUCTIVE replace between markers, or append)
   foreach ($block in @("orchestrator-dispatch-rule", "voice-rule")) {
       $canonicalPath = "$mbDir\$block.md"
       $canonical = Get-Content $canonicalPath -Raw
       $startMarker = "<!-- $block`:start -->"
       $endMarker   = "<!-- $block`:end -->"
       $content = Get-Content $claudeMd -Raw
       if ($content -match [regex]::Escape($startMarker) -and $content -match [regex]::Escape($endMarker)) {
           # DESTRUCTIVE replace between markers (inclusive)
           $pattern = [regex]::Escape($startMarker) + "[\s\S]*?" + [regex]::Escape($endMarker)
           $content = [regex]::Replace($content, $pattern, $canonical.TrimEnd())
           Set-Content $claudeMd $content -NoNewline
       } else {
           # Append
           Add-Content $claudeMd "`n$canonical"
       }
   }

   # Remove retired blocks (dev-mode, nested-dispatch-takeover, dev-mode-entry)
   $content = Get-Content $claudeMd -Raw
   foreach ($retiredBlock in @("dev-mode", "nested-dispatch-takeover", "dev-mode-entry")) {
       $retiredStart = "<!-- $retiredBlock`:start -->"
       $retiredEnd   = "<!-- $retiredBlock`:end -->"
       if ($content -match [regex]::Escape($retiredStart) -and $content -match [regex]::Escape($retiredEnd)) {
           $pattern = [regex]::Escape($retiredStart) + "[\s\S]*?" + [regex]::Escape($retiredEnd)
           $content = [regex]::Replace($content, $pattern, "")
       }
   }
   Set-Content $claudeMd $content -NoNewline

   # Sync developer-mode output style (skip-if-identical write — no -Force copy)
   $outputStyleSrc = "$($latestDir.FullName)\output-styles\developer-mode.md"
   $outputStyleDst = "$env:USERPROFILE\.claude\output-styles\developer-mode.md"
   $outputStyleDir = Split-Path $outputStyleDst
   if (-not (Test-Path $outputStyleDir)) { New-Item -ItemType Directory -Path $outputStyleDir | Out-Null }
   $srcContent = Get-Content $outputStyleSrc -Raw
   if (-not (Test-Path $outputStyleDst) -or (Get-Content $outputStyleDst -Raw) -ne $srcContent) {
       Set-Content $outputStyleDst $srcContent -NoNewline
   }
   ```

   **Unix/macOS (bash) — run this block verbatim on Linux/macOS:**
   ```bash
   # Resolve the highest-version plugin directory
   PLUGIN_BASE="$HOME/.claude/plugins/cache/team-harness-marketplace/th"
   LATEST_DIR=$(ls -1 "$PLUGIN_BASE" | sort -V | tail -1)
   MB_DIR="$PLUGIN_BASE/$LATEST_DIR/skills/setup/managed-blocks"
   CLAUDE_MD="$HOME/.claude/CLAUDE.md"

   # Backup (single rolling backup — overwritten each run, never accumulates)
   cp "$CLAUDE_MD" "$CLAUDE_MD.bak"

   # Sync active managed blocks (DESTRUCTIVE replace between markers, or append)
   for BLOCK in orchestrator-dispatch-rule voice-rule; do
       CANONICAL=$(cat "$MB_DIR/$BLOCK.md")
       START_MARKER="<!-- ${BLOCK}:start -->"
       END_MARKER="<!-- ${BLOCK}:end -->"
       if grep -qF "$START_MARKER" "$CLAUDE_MD" && grep -qF "$END_MARKER" "$CLAUDE_MD"; then
           # DESTRUCTIVE replace between markers (inclusive) using sed
           sed -i.tmp "/${START_MARKER//\//\\/}/,/${END_MARKER//\//\\/}/d" "$CLAUDE_MD"
           # Append canonical block at position of removed block
           printf '\n%s\n' "$CANONICAL" >> "$CLAUDE_MD"
       else
           printf '\n%s\n' "$CANONICAL" >> "$CLAUDE_MD"
       fi
   done

   # Remove retired blocks (dev-mode, nested-dispatch-takeover, dev-mode-entry)
   for RETIRED in dev-mode nested-dispatch-takeover dev-mode-entry; do
       if grep -qF "<!-- ${RETIRED}:start -->" "$CLAUDE_MD" && grep -qF "<!-- ${RETIRED}:end -->" "$CLAUDE_MD"; then
           sed -i.tmp "/<!-- ${RETIRED}:start -->/,/<!-- ${RETIRED}:end -->/d" "$CLAUDE_MD"
       fi
   done

   # Sync developer-mode output style (write-if-different — no unconditional cp)
   OUTPUT_STYLE_SRC="$PLUGIN_BASE/$LATEST_DIR/output-styles/developer-mode.md"
   OUTPUT_STYLE_DST="$HOME/.claude/output-styles/developer-mode.md"
   [ -d "$(dirname "$OUTPUT_STYLE_DST")" ] || mkdir -p "$(dirname "$OUTPUT_STYLE_DST")"
   cmp -s "$OUTPUT_STYLE_SRC" "$OUTPUT_STYLE_DST" || cp "$OUTPUT_STYLE_SRC" "$OUTPUT_STYLE_DST"
   ```

6b. **Runtime probe — python3 presence (advisory).** After the managed-block sync, run `command -v python3`. This step is advisory — update always completes regardless of the outcome. If python3 is available, record `python3: available` for the final report (Step 7) and continue silently.

If python3 is absent: record `python3: WARN: absent — policy gate running degraded` for the final report, then recommend installing python3 with the rationale and offer a Y/n prompt. Because Step 6's output discipline requires a single final report, the Y/n prompt for python3 install is the ONLY inline message permitted by this step (all other progress is silent).

## python3

Present:

```
python3 not found on PATH — policy gate running in degraded mode.
  Bash denylist, sensitive-path, and HIGH_CONFIDENCE_SECRETS checks remain active (bash fallback).
  Medium-confidence entropy scan requires python3.
Install python3 now for full coverage? [Y/n]
```

**On `n` (decline):** continue to Step 7. Print nothing further for this step; the degraded status appears in the `python3` row of the final report.

**On `Y` (consent):** run the OS-appropriate install command:

- **Windows:** run `winget install -e --id Python.Python.3.12`
  - If `winget` is absent: print `winget not found — install manually: https://www.python.org/downloads/` and continue.
  - If the command exits non-zero: print the error and the manual URL, then continue.
- **macOS:** run `brew install python3`
  - If `brew` is absent: print `brew not found — install manually: https://www.python.org/downloads/` and continue.
  - If the command exits non-zero: print the error and continue.
- **Linux:** detect the available manager in order (`apt-get` → `dnf` → `pacman`):
  - `apt-get`: run `sudo apt-get install -y python3`
  - `dnf`: run `sudo dnf install -y python3`
  - `pacman`: run `sudo pacman -S --noconfirm python`
  - The skill never escalates privileges itself. If `sudo` elevation fails, print the exact command for the operator to run manually and continue.
  - If no manager is found: print manual install instructions and continue.

**Post-install re-probe:** run `command -v python3` after a consented install.
- If available: update the `python3` row to `python3 installed — full coverage active`.
- If still absent: **Windows PATH caveat** — a winget-installed python3 may not appear on PATH in the current Git Bash session. When the re-probe fails immediately after a reported-successful winget install, update the row to `python3 installed — restart the terminal for PATH refresh`. On other platforms: record the degraded advisory and continue.

**Failed install / declined / unavailable manager:** record the degraded status in the `python3` row and continue. The bash fallback floor remains the enforcement guarantee.

7. **Emit the final report** — the single operator-facing message. Use the matching template below verbatim in structure (a fenced status block), filling the values from the run. Align the values into one column. Keep the labels lowercase as shown. Render the closing line outside the fence.

   **(a) A new version was downloaded** (step 5 ran):
   ```
   th update — new version downloaded

     catalog refresh     done
     installed version   <X>
     downloaded version  <Y>
     managed blocks      <per-block outcome, e.g. "synced (orchestrator-dispatch-rule updated, dev-mode removed)" or "in sync (2/2)">
     python3             <"available" | "WARN: absent — policy gate running degraded" | "installed — full coverage active" | "installed — restart the terminal for PATH refresh">
   ```
   Closing line: `Next: /reload-plugins (or restart Claude Code) to activate <Y>.`

   **(b) Already current** (no download):
   ```
   th update — already current

     catalog refresh     done
     installed version   <X>
     latest version      <X>
     managed blocks      <e.g. "in sync (2/2)" or "synced (orchestrator-dispatch-rule updated)">
     python3             <"available" | "WARN: absent — policy gate running degraded" | "installed — full coverage active" | "installed — restart the terminal for PATH refresh">
   ```
   Closing line: `No action required.`

   **(c) Installed ahead** (installed > latest): use template (b) with the title `th update — installed ahead of catalog`, show both versions, and a closing line noting the catalog may not have propagated the latest release yet.

   In every case the `managed blocks` row reflects step 6's outcome. If the block sync wrote changes, the closing line for template (a)/(b) also notes that a backup of `~/.claude/CLAUDE.md` was written.

## Error handling

- If `claude` is not on PATH, report `claude CLI not found on PATH; cannot refresh the marketplace.` and stop.
- If the catalog file is missing after a successful `marketplace update`, report the path checked and stop — do not fabricate a version.
- Surface every CLI error verbatim. No silent retries.

## Important

- This skill is for **plugin installations**. For legacy Go-installer installations, file syncing is a different path (deprecated).
- The skill refreshes the marketplace catalog, downloads the new version into the plugin cache (`claude plugin update`), reports the version delta, syncs the marker-delimited managed blocks in `~/.claude/CLAUDE.md` to the version being activated, and removes retired blocks (`dev-mode`, `nested-dispatch-takeover`, `dev-mode-entry`). It never edits repository files, **never writes `~/.claude/.team-harness.json`** (that config is `/th:setup`'s domain), never touches `~/.claude/CLAUDE.md` content outside the managed-block markers, and never reloads the session — the reload/restart is always operator-driven.
- **New hooks reach installed machines without re-running `/th:setup`.** The `session-start.sh` unified SessionStart hook is registered in `.claude-plugin/hooks.json`; the plugin runtime loads it automatically on the next update+reload (`/th:update` downloads the new version → `/reload-plugins` activates it). For Go-installer paths, the hook command is registered in `hooks/config.json` and is applied via the `mergeHookEntries` path on the next install run.
- Division of labour with `/th:setup`: setup is the one-time bootstrap (MCP servers, workspace mode, first write of the managed blocks); update is the repeatable command that keeps the catalog and the managed blocks in sync on every run. Re-running setup is never required as part of the update flow.
