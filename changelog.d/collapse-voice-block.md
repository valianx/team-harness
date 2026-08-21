### Changed

- The `## Voice` block is stated once and referenced everywhere else. Nineteen files carried a full
  inline copy of it and there were eighteen distinct variants — almost no two copies matched. The
  rules had not diverged in substance, but a correction to the canonical file reached none of the
  copies. Seventeen skills now carry the one-line pointer to
  `agents/_shared/operational-rules.md § "Voice"` that fourteen agents and
  `skills/test-cross-browser/SKILL.md` already used, removing ~3,170 duplicated words.
- `agents/_shared/operational-rules.md` absorbed the two rules the copies carried and it lacked:
  the self-deprecation prohibition ("La cagué", "Mea culpa", "no vuelvo a asumirlo") and the
  correct/incorrect self-correction example that ten skills stated for themselves.
- `agents/ref-pipeline.md` is unchanged: its Voice section already pointed at the canonical file and
  added coordinator-specific rules that exist nowhere else.

### Fixed (review round)

- The collapse dropped a requirement the canonical did not carry: thirteen skills stated "you reply
  in the operator's chat language", and `§ "Language register"` covered dialect neutrality only,
  never language matching. The canonical now states which language applies where — a live
  operator-facing response follows the operator's resolved language; committed content and every
  document's structural elements stay English — so all seventeen pointers inherit it without a
  per-skill edit. A reviewer found this from two instances; the real count was thirteen.
