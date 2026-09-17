
Resolve the service or path from $ARGUMENTS, defaulting to the current project.
Read its test configuration and intended behavior. Honor `--modules` to scope
the work, `--coverage-only` to inspect existing coverage without generating
tests, and `--skip-security` to omit a separate security scan.

Identify material untested behavior, regressions and integration boundaries.
For frontend behavior, use the repository's browser testing tools when they
provide relevant evidence. Delegate independent modules with clear ownership
when useful and combine results in the current agent.

Add meaningful tests and run the selected checks. Follow the repository's own
coverage goals; TH imposes no universal percentage. Coverage helps locate
missing cases but does not establish behavioral correctness on its own.

Report what ran, failures, omissions and remaining gaps. Keep raw reports in
temporary or configured workspace storage. A testing workflow does not
activate the development pipeline or grant publication authority.
