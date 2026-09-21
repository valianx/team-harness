
# Cross-repository analysis

Analyze the input: `$ARGUMENTS`. This is a read-only audit utility. The current
agent owns the coordination and uses the host's native task or session dispatch
when bounded parallel work helps. It never requires a particular shell,
terminal multiplexer, model host, or permission bypass.

## Parse arguments

Supported forms:

```
/th:cross-repo <repos...> --context "<description>"
/th:cross-repo --profile <profile-name> --flow <flow-name>
/th:cross-repo --profile <profile-name> --flow <flow-name> --focus security
/th:cross-repo --list-profiles
```

Parse repository paths, `--profile`, `--flow`, `--context`, `--focus`,
`--output`, and `--no-parallel`. Paths may be absolute or relative to the
current repository. `--focus` accepts `security`, `architecture`, `quality`,
`business`, or `tests`; the default is all dimensions.

## Workspace and deliverables

Resolve an absolute workspace through the active workspace method and pass that
same path to every bounded task. An explicit `--workspace` or `Workspace:` in
the request takes precedence. Do not select a workspace by date, modification
time, or a `latest` directory. Store reproducibility inputs and scratch results
under `{workspace}/cross-repo/{analysis-slug}/scratch/`.

The deliverable is separate and explicit: use `--output <absolute-or-workspace-relative-dir>`
when supplied, otherwise `{workspace}/cross-repo/{analysis-slug}/report/`.
Write `00-consolidated.md`, per-repository reports, and `analysis-context.md`
there. Do not confuse scratch files with the report directory, and clean only
the run's own scratch directory after the report is complete.

## Mode detection

| Input | Mode | Description |
|---|---|---|
| `--profile` + `--flow` | Flow tracing | Trace a business flow across services |
| `--profile` without `--flow` | System audit | Evaluate each service in the profile |
| Repository paths + `--context` | Ad-hoc analysis | Analyze the supplied repositories |
| `--list-profiles` | List | Show available profiles and flows |

## Phase 0 — intake and validation

1. Load `system-profiles/{name}/profile.md` when `--profile` is present. If it
   is missing, report the available profiles and stop.
2. Load `system-profiles/{profile}/flows/{flow}.md` when `--flow` is present and
   validate that it exists.
3. Validate each supplied repository path and confirm that it contains source
   code. A missing repository is reported and omitted only when other targets
   remain.
4. Extract repository roles, invariants, business rules, and expected
   contracts from the profile and flow. For each repository in flow-tracing
   mode, write a hop context under the run's scratch directory.
5. Write `analysis-context.md` under the explicit output directory with the
   mode, profile, flow, focus, user context, repository table, invariants,
   business rules, and contracts. Include absolute repository paths so each
   dispatched task has an unambiguous target.

## Phase 1 — bounded analysis

Select reviewers from the requested focus:

| Focus | Reviewers per repository |
|---|---|
| all | architect, security, qa, tester |
| security | security |
| architecture | architect |
| quality | architect, tester |
| business | qa, architect |
| tests | tester |

Each reviewer receives only its repository, the relevant hop context, the
analysis context, an absolute report path, and a bounded question. Reviewers
use their native read-only permissions and return findings with file and line
evidence. Preserve independent reviewer results; a failed reviewer does not
erase successful evidence.

Use native bounded parallel tasks when repositories are independent. Cap active
repositories at five and fill available slots as tasks finish. If the host
cannot provide parallel dispatch, run the same reviewers sequentially. The
choice of transport is an execution detail and must not change the reports.

Each repository writes:

```
{output}/<repo>-architecture.md     # when architect was selected
{output}/<repo>-security.md         # when security was selected
{output}/<repo>-business.md         # when qa was selected
{output}/<repo>-tests.md            # when tester was selected
{output}/<repo>-summary.md
```

The summary records analyses completed, severity counts, business-rule
coverage, test-quality assessment, and any reviewer failures or timeouts.

## Phase 2 — consolidation

After all available repository results return, the current agent consolidates
the reports. For a large result set it may assign a bounded architect
consolidation task through the native host, with the output path explicitly
provided. The consolidator reads reports and the analysis context; it does not
re-scan repositories or invent missing evidence.

The consolidated report contains:

- executive summary and severity counts;
- invariant validation when a profile exists;
- contract validation for each flow boundary;
- business-rule and failure-scenario coverage;
- per-repository summaries and cross-cutting findings;
- declared versus discovered topology;
- prioritized recommendations with file and line evidence.

When a profile exists, include violated invariants, newly discovered facts, and
outdated profile entries. Updating a profile is a separate operator-authorized
write and is never inferred from the audit.

## Completion and cleanup

Report the mode, repositories analyzed, focus, severity counts, contract
mismatches, invariant results, and the absolute path to `00-consolidated.md`.
Delete only the run-owned `scratch/` directory after all reports are written;
do not remove a workspace, another run's results, or the explicit deliverable.

## Error handling

- Missing profile or flow: report the exact missing path and stop.
- Missing repository: report it and continue with remaining repositories.
- Native task timeout: record `TIMEOUT` for that reviewer/repository and
  continue with available evidence.
- No result from a repository: mark it `FAILED` in the consolidated report.
- Partial results: consolidate what exists and list missing analyses explicitly.
