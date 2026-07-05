### Changed

- The implementer agent now directs documentation exceeding a WHY-comment to the target repository's structured `/docs` folder (organized by topic) rather than accumulating it as large prose blocks inside source files; a matching self-check item and a report-only "Docs placement" disclosure line in the delivery PR-body template reinforce the policy (the disclosure triggers on prose-documentation comment blocks of any length, with the ~15-line threshold as the deterministic floor).
