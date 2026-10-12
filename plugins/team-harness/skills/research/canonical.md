
# Research

Answer the operator's question with evidence that helps them choose an approach.
The current general agent coordinates and synthesizes the work. Ask for the
missing question or decision context only when the request does not establish it.

Identify the alternatives, constraints and uncertainty that matter to the decision.
Use current primary sources for external technical claims and inspect the relevant
code when the question depends on an existing implementation. Separate observed
behavior, documented claims and inference; cite sources and disclose important gaps.

Delegate distinct questions to researchers when useful. Give them bounded scope
and compare their evidence rather than treating agreement or a verdict as authority.
`researcher`, `code-researcher` and `research-consolidator` return evidence or
advisory synthesis through native transport without writing files, executing
shell commands, delegating or publishing. Main owns synthesis, persistence and
follow-up decisions.
Use the host's native task or session dispatch when parallel work helps; otherwise
research directly. An architect or research consolidator can help with a complex
synthesis, but a fixed agent count or extra consolidation stage is not required.

Follow the [research method](../../agents/ref-architect-modes.md#research-mode)
for the report. The caller supplies the absolute workspace path; preserve its
local or Obsidian destination, language and voice. Main saves useful evidence and
recommendations as `research/00-research.md` there, retaining citations, confidence,
conflicts, skipped lanes and failures. Main decides whether a material gap blocks
the answer and needs bounded follow-up; amend the same report when it does.
Report the conclusion, tradeoffs and remaining uncertainty without activating
a pipeline or implementing a recommendation unless the operator requests it.
