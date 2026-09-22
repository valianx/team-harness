# Acceptance and evidence

OpenSpec scenarios and tasks, or the direct contract supplied by Main, are the
canonical acceptance source. Do not replace them with a plan projection,
transcript or specialist opinion. Keep observable acceptance criteria (ACs)
separate from technical constraints (TCs).

For each applicable AC or TC, choose the strongest useful evidence:

- test for an executable behavior check;
- command for a build, lint, migration, schema or other deterministic check;
- inspection for a source, configuration, documentation or artifact review.

One test may cover several criteria, and a criterion may be proven by a command
or inspection. There is no test-count quota or universal requirement to create
an extra test. Implementers may write ordinary tests for their owned behavior;
the tester adds independent testing expertise when that is useful or explicitly
requested.

Evidence cites a test or artifact path and line, or the exact command and
result, with enough detail for another reviewer to verify it. Do not paste
unbounded runner output. Distinguish a passing check from a required check that
was omitted, could not run, or has an unknown count.

QA independently evaluates the candidate against the canonical acceptance
source. Tester, QA and security findings are advisory evidence; Main decides
disposition and verifies corrections. A useful finding states the cause, files
or inspected scope, implicated AC/TC, impact, smallest suggested correction and
deterministic closure evidence. Do not rewrite an AC to manufacture a pass.

When a test is changed or deleted, state the exact test, why it is redundant,
obsolete, biased or implementation-coupled, and what surviving evidence
protects the behavior. Never weaken or skip a test merely because it is
inconvenient or failing.

Request or renew security evidence when the changed impact is security-relevant,
unknown, or the operator asks for it. Security findings cite a concrete
location, severity and CWE where applicable. Keep credentials, secrets and
private data out of fixtures, reports and transport.

No fixed acceptance matrix, report filename, result event or projection is
required. Write evidence to the output path explicitly supplied by Main; when
there is no artifact destination, return the bounded evidence through native
transport.
