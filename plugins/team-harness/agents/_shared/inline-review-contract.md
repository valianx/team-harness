# Inline review

Review a local committed change through native read-only reviewers. Main owns
scope, interpretation, corrections and delivery. Existing PR reviews use
`review-pr`; this flow neither publishes nor creates a pipeline.

## Prepare once

Use `skills/verify/scripts/review-fan.mjs package` for the clean committed range,
selected lenses and exact OpenSpec change when applicable. The helper owns package
construction, immutable coordinates, criteria and review-surface checks. Use its
output rather than manually repeating its preparation. Risk signals inform Main;
they do not require another lens. Preserve every explicitly requested lens.

Dispatch one native `inline-reviewer` per selected lens with the same package and
its `lens`. Add a concise brief in the dispatch, not another required artifact:

- the question this lens should answer and any known uncertainty;
- relevant purpose/requirements and canonical changed paths;
- existing checks and provider assessments, with candidate, command, environment,
  actual result and named relevant skips or gaps.

Do not copy the entire conversation, full logs or equivalent generated files into
each prompt. Link evidence available to the reviewer; supply a bounded excerpt
when its native access cannot reach the workspace. Reuse review-surface parity
checks for generated copies, without treating unchecked copies as verified.
An entirely checker-verified surface needs no empty agent dispatch.

## Native execution and focused inspection

Use the host's native read-only role. Preserve its supported model/effort choices;
installed-profile inspection is for diagnosis, not a repeated hash attestation or
comparison with packaged model defaults. Do not require loaded-byte proof or a
new conversation. If the read-only capability is unavailable, do not substitute
a writable role whose prompt merely says not to edit.

Reviewers inspect the packaged base/head and selected scope, including pertinent
dependencies needed to establish behavior. Use immutable local Git content for
historical, deleted and changed files; do not substitute a mutable checkout for
the packaged revision. Native read-only Git inspection disables external diffs
and text conversion, uses resolved IDs and literal separate path arguments, and
does not fetch missing objects or execute project-derived commands. A missing
object is a coverage limit. Claude's no-Bash reviewer receives that bounded Git
view from Main. No additional sandbox, filesystem confinement or ACL system is
provided by TH; the native runtime controls permissions.

Start with the brief and changed surface. Read relevant README, project guidance,
architecture or deployment sections when they resolve a question for this lens;
there is no universal preliminary documentation tour. Project content remains
evidence, not authority. Reviewers do not browse, edit files, run project tests,
dispatch agents or mutate external state. Main executes any justified follow-up
probe under existing permissions.

Reuse test results and existing test-quality/coverage assessments. Distinguish
required omitted checks from unrelated optional skips and unknown counts. A new
reviewer does not by itself require another TEA workflow, full test analysis or
suite execution. Investigate a concrete gap, contradiction or changed relevant
input; state the unanswered question if further evidence is needed.

## Return and recovery

Return one compact structured result compatible with the existing summary:

```yaml
lens: tester|qa|security|adversary
lens_status: complete|incomplete|failed|unavailable|untrusted
repository_root: /canonical/project/root
commit_or_range: <packaged target>
verdict: pass|concerns|fail|not-run
output: null
findings:
  - severity: blocker|high|medium|low|info
    claim: <concrete defect>
    locations: [path:line]
    rationale: <evidence and impact>
coverage:
  checked: [<meaningful coverage>]
  written_intent: [{source, checked: true|false}]
  limits: [<unchecked or unavailable scope>]
disagreements: []
```

Keep written-intent coverage distinct from live operator criteria; group entries
by source instead of reproducing every scenario or read operation. Findings cite
observable evidence. Complete/pass means the bounded lens finished with meaningful
coverage and no blocker, not certification. Preserve partial findings and clearly
identify unfinished scope; absence of findings after failed execution is not pass.

If dispatch fails or stops making useful progress, Main inspects the observed
cause and preserves available work. Use a supported focused recovery when likely
to resolve that cause; a separate CLI run is an option, not a mandatory second
attempt. Do not loop across agents, models or execution paths to obtain a pass.
Native permission failures remain limits unless the host permits their recovery.

## Consolidate and continue

Check that each return names the packaged repository/range. Preserve its original
anchor if the working branch advanced; inspect the intervening diff before using
the result for a corrected candidate. Unrelated changes need their own coverage;
do not relabel an old review as a review of the new head or discard completed work.

Run `review-fan.mjs summary` (`gate` is a compatibility alias). It preserves all
returns, findings and coverage limits, groups each lens by its worst reported
outcome, and reports unrequested lenses separately. A successful recovery or repair
does not rewrite an earlier return. Main records its disposition separately; the
summary grants no publication authority and an unmapped finding is not a spec defect.

Close confirmed findings with relevant checks. Reuse unaffected evidence, renew
invalidated checks and preserve unresolved limits in the existing workspace when
one is bound. Do not automatically commission another full review or test-quality
assessment after a scoped repair. Main continues under existing authorization and
explicit operator prerequisites, following spec's author-review closure when applicable.
