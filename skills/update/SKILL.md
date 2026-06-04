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
   - **Source of truth.** The four managed blocks live in canonical files under `skills/setup/managed-blocks/` in the plugin cache. Read each file directly from the **highest version directory** present under `~/.claude/plugins/cache/team-harness-marketplace/th/` (semver-sorted) — after step 5 that is the just-downloaded version, so the synced blocks match the version the operator is about to activate:
     - `managed-blocks/orchestrator-dispatch-rule.md` (markers: `<!-- orchestrator-dispatch-rule:start -->` … `<!-- orchestrator-dispatch-rule:end -->`)
     - `managed-blocks/nested-dispatch-takeover.md` (markers: `<!-- nested-dispatch-takeover:start -->` … `<!-- nested-dispatch-takeover:end -->`)
     - `managed-blocks/voice-rule.md` (markers: `<!-- voice-rule:start -->` … `<!-- voice-rule:end -->`)
     - `managed-blocks/dev-mode.md` (markers: `<!-- dev-mode:start -->` … `<!-- dev-mode:end -->`)
     Full paths under the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<latest>/skills/setup/managed-blocks/{orchestrator-dispatch-rule,nested-dispatch-takeover,voice-rule,dev-mode}.md`
   - **Note:** The `dev-mode-entry` block is no longer distributed (the `/dev-mode` skill trigger-phrase mechanism was replaced by the `developer-mode` output style). If the `<!-- dev-mode-entry:start -->` … `<!-- dev-mode-entry:end -->` markers exist in `~/.claude/CLAUDE.md`, remove the block between them (inclusive) as part of this sync.
   - **Developer-mode output style sync.** After syncing managed blocks, re-copy `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (create the directory if absent). This keeps the output style aligned with the installed plugin version.
   - **Sync the `/dev-mode` skill.** Re-copy `skills/dev-mode/SKILL.md` from the plugin cache to the USER-LEVEL path `~/.claude/skills/dev-mode/SKILL.md` (create the directory if absent), overwriting any existing version. This is the opt-in toggle that activates/deactivates the `developer-mode` output style; it must stay aligned with the installed plugin version (a bare `/dev-mode` requires a user-level skill, since plugin skills are namespaced).
   - **Back up** `~/.claude/CLAUDE.md` to `~/.claude/CLAUDE.md.bak-YYYYMMDD-HHMMSS` (UTC) before the first write. If the file does not exist, create it (blocks-only) and skip the backup. Retention: only the last 3 `CLAUDE.md.bak-*` backups are kept; older ones are pruned after each sync.
   - **Write each block — DESTRUCTIVE replace, no content validation beyond marker-presence.** For each of the three canonical files: read its full content (that is the block, start marker to end marker inclusive). If both its start and end markers are present in `~/.claude/CLAUDE.md`, replace everything from the start marker to the end marker inclusive with the canonical file content. If the markers are absent, append the canonical file content at the end of the file. This is a DESTRUCTIVE replace: no comparison of existing content; only marker presence is checked. The agent runs the matching-OS command block below verbatim — do NOT improvise shell commands.
   - Also migrate legacy orchestrator markers (`<!-- th-orchestrator-inline-rule:start -->`, `<!-- th-orchestrator-dispatch-rule:start -->`) by replacing them with the current `orchestrator-dispatch-rule` block.
   - **Never touch anything outside the marker-delimited blocks.** All other content in `~/.claude/CLAUDE.md` is the operator's and is preserved byte-for-byte.
   - **Record** each block's outcome (`updated` / `inserted` / `already current`) for the `managed blocks` row of the final report (step 7). Do not print it inline — the report is the only operator-facing message.

   **Windows (PowerShell) — run this block verbatim on Windows:**
   ```powershell
   # Resolve the highest-version plugin directory
   $pluginBase = "$env:USERPROFILE\.claude\plugins\cache\team-harness-marketplace\th"
   $latestDir = Get-ChildItem -Path $pluginBase -Directory |
       Sort-Object { [Version]($_.Name -replace '[^0-9.]','') } |
       Select-Object -Last 1
   $mbDir = "$($latestDir.FullName)\skills\setup\managed-blocks"
   $claudeMd = "$env:USERPROFILE\.claude\CLAUDE.md"

   # Backup
   $ts = (Get-Date -Format "yyyyMMdd-HHmmss")
   Copy-Item $claudeMd "$claudeMd.bak-$ts"
   Get-ChildItem "$claudeMd.bak-*" | Sort-Object LastWriteTime | Select-Object -SkipLast 3 | Remove-Item -Force

   # Sync each managed block (DESTRUCTIVE replace between markers, or append)
   foreach ($block in @("orchestrator-dispatch-rule", "nested-dispatch-takeover", "voice-rule", "dev-mode")) {
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

   # Remove obsolete dev-mode-entry block if present
   $content = Get-Content $claudeMd -Raw
   $entryStart = "<!-- dev-mode-entry:start -->"
   $entryEnd   = "<!-- dev-mode-entry:end -->"
   if ($content -match [regex]::Escape($entryStart) -and $content -match [regex]::Escape($entryEnd)) {
       $pattern = [regex]::Escape($entryStart) + "[\s\S]*?" + [regex]::Escape($entryEnd)
       $content = [regex]::Replace($content, $pattern, "")
       Set-Content $claudeMd $content -NoNewline
   }

   # Sync developer-mode output style
   $outputStyleSrc = "$($latestDir.FullName)\output-styles\developer-mode.md"
   $outputStyleDst = "$env:USERPROFILE\.claude\output-styles\developer-mode.md"
   New-Item -ItemType Directory -Force -Path (Split-Path $outputStyleDst) | Out-Null
   Copy-Item $outputStyleSrc $outputStyleDst -Force

   # Sync /dev-mode user-level skill (the opt-in toggle for the output style)
   $devModeSkillSrc = "$($latestDir.FullName)\skills\dev-mode\SKILL.md"
   $devModeSkillDst = "$env:USERPROFILE\.claude\skills\dev-mode\SKILL.md"
   New-Item -ItemType Directory -Force -Path (Split-Path $devModeSkillDst) | Out-Null
   Copy-Item $devModeSkillSrc $devModeSkillDst -Force
   ```

   **Unix/macOS (bash) — run this block verbatim on Linux/macOS:**
   ```bash
   # Resolve the highest-version plugin directory
   PLUGIN_BASE="$HOME/.claude/plugins/cache/team-harness-marketplace/th"
   LATEST_DIR=$(ls -1 "$PLUGIN_BASE" | sort -V | tail -1)
   MB_DIR="$PLUGIN_BASE/$LATEST_DIR/skills/setup/managed-blocks"
   CLAUDE_MD="$HOME/.claude/CLAUDE.md"

   # Backup
   TS=$(date -u +"%Y%m%d-%H%M%S")
   cp "$CLAUDE_MD" "$CLAUDE_MD.bak-$TS"
   ls -1t "$CLAUDE_MD".bak-* 2>/dev/null | tail -n +4 | xargs -r rm -f

   # Sync each managed block (DESTRUCTIVE replace between markers, or append)
   for BLOCK in orchestrator-dispatch-rule nested-dispatch-takeover voice-rule dev-mode; do
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

   # Remove obsolete dev-mode-entry block if present
   if grep -qF "<!-- dev-mode-entry:start -->" "$CLAUDE_MD" && grep -qF "<!-- dev-mode-entry:end -->" "$CLAUDE_MD"; then
       sed -i.tmp "/<!-- dev-mode-entry:start -->/,/<!-- dev-mode-entry:end -->/d" "$CLAUDE_MD"
   fi

   # Sync developer-mode output style
   OUTPUT_STYLE_SRC="$PLUGIN_BASE/$LATEST_DIR/output-styles/developer-mode.md"
   OUTPUT_STYLE_DST="$HOME/.claude/output-styles/developer-mode.md"
   mkdir -p "$(dirname "$OUTPUT_STYLE_DST")"
   cp "$OUTPUT_STYLE_SRC" "$OUTPUT_STYLE_DST"

   # Sync /dev-mode user-level skill (the opt-in toggle for the output style)
   DEV_MODE_SKILL_SRC="$PLUGIN_BASE/$LATEST_DIR/skills/dev-mode/SKILL.md"
   DEV_MODE_SKILL_DST="$HOME/.claude/skills/dev-mode/SKILL.md"
   mkdir -p "$(dirname "$DEV_MODE_SKILL_DST")"
   cp "$DEV_MODE_SKILL_SRC" "$DEV_MODE_SKILL_DST"
   ```

7. **Emit the final report** — the single operator-facing message. Use the matching template below verbatim in structure (a fenced status block), filling the values from the run. Align the values into one column. Keep the labels lowercase as shown. Render the closing line outside the fence.

   **(a) A new version was downloaded** (step 5 ran):
   ```
   th update — new version downloaded

     catalog refresh     done
     installed version   <X>
     downloaded version  <Y>
     managed blocks      <per-block outcome, e.g. "synced (orchestrator-dispatch-rule updated)" or "in sync (3/3)">
   ```
   Closing line: `Next: /reload-plugins (or restart Claude Code) to activate <Y>.`

   **(b) Already current** (no download):
   ```
   th update — already current

     catalog refresh     done
     installed version   <X>
     latest version      <X>
     managed blocks      <e.g. "in sync (3/3)" or "synced (nested-dispatch-takeover updated)">
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
- The skill refreshes the marketplace catalog, downloads the new version into the plugin cache (`claude plugin update`), reports the version delta, and syncs the marker-delimited managed blocks in `~/.claude/CLAUDE.md` to the version being activated. It never edits repository files, never writes `~/.claude/.team-harness.json` (that config is `/th:setup`'s domain), never touches `~/.claude/CLAUDE.md` content outside the managed-block markers, and never reloads the session — the reload/restart is always operator-driven.
- Division of labour with `/th:setup`: setup is the one-time bootstrap (MCP servers, workspace mode, first write of the managed blocks); update is the repeatable command that keeps the catalog and the managed blocks in sync on every run. Re-running setup is never required as part of the update flow.
