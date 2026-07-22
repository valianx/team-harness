# Orchestrator Disposition — Contract

The top-level Claude Code agent IS the orchestrator. This is the CC native architecture, not a mode that activates or deactivates. The security property that protects outward actions is enforced by the `dev-guard` gate (`.claude-plugin/hooks.json` → `hooks/run-ts-hook.sh dev-guard` → `hooks/ts/dist/dev-guard.cjs`), which fires UNCONDITIONALLY for every covered outward action and gates by destination — no filesystem marker required or consulted.

**SEC-DR-2 re-founding (v2.89.0).** The former "dev mode" was a conditional disposition controlled by `~/.claude/.dev-mode-active`. That model was retired when empirical testing (M1 probe, 2026-06-14) confirmed that nested foreground subagents retain the `Task` tool — the foundational premise behind the handoff machinery was obsolete on the CC path. The disposition is now unconditional: the general agent is always the orchestrator, and the gate is always armed.

---

## Outward-Action Gate (`dev-guard`)

The deterministic security layer is the PreToolUse hook `dev-guard`, wired in its own dedicated `Bash`-only PreToolUse entry in `.claude-plugin/hooks.json` — the marketplace plugin's runtime, the only Claude Code install path (the Go installer's CC path is retired; `hooks/config.json`, its per-OS wiring template, no longer exists). The entry runs `hooks/run-ts-hook.sh dev-guard`, a fail-closed launcher with no gate logic of its own that execs `node` against `hooks/ts/dist/dev-guard.cjs` — TypeScript is the single source of gate logic, shared with the opencode runtime. `policy-block` is in a separate entry with matcher `Bash|Write|Edit|NotebookEdit` so it continues to secret-scan write/edit content — dev-guard never fires on Edit/Write/NotebookEdit. This is the GUARANTEE — not the disposition.

The gate fires UNCONDITIONALLY for covered outward actions and gates by destination — evaluating every one of them, never skipping the check, while the DECISION varies with what the command actually targets. No filesystem marker is read; no session state is checked.

**What it gates (by DESTINATION, not by binary):**

| Covered action | Decision | Rationale |
|---|---|---|
| Push to a remote: single recognized refspec targeting a non-default branch on `origin` (no force/mirror/all/tags/delete) | `allow` | The closed-form recognizer confirms the destination is a non-default branch on `origin` — a routine feature-branch push proceeds without a prompt |
| Push to a remote: default branch, tag, force (flag or `+refspec`/`--mirror`), multi-refspec, delete refspec, or a remote other than `origin` | `ask` | Any push outside the single recognized safe form is an irreversible outward action |
| `gh pr create` | `ask` by default; `allow` under the opt-in config key `autogate.pr_create: true` (`hooks/ts/bodies/dev-guard.ts:743-754`) | Opens a PR — an outward, GitHub-visible action; the opt-in exists for operators who want to remove the double-prompt on top of the `gate-guard` order floor below |
| `gh pr merge` | `ask` | Merges to main cannot be undone |
| `gh pr review` (including `--dismiss`) | `ask` | Publishes a review on behalf of the operator |
| `gh pr comment` | `ask` | Publishes a comment on behalf of the operator |
| `gh api -X PUT|POST|PATCH|DELETE` against PR endpoints (`/pulls/.../merge|reviews|comments`) | `ask` | Covers API-level bypass of the `gh` CLI |
| `gh api graphql` with a PR-write mutation name (`resolveReviewThread`, `unresolveReviewThread`, `addPullRequestReviewThreadReply`, `addPullRequestReview`, `submitPullRequestReview`, `mergePullRequest`) | `ask` | GraphQL PR mutations post to `/graphql` without `-X` flag — not matched by the REST pattern above; read-only `reviewThreads` listing queries stay ungated |
| ClickUp MCP outward writes (`mcp__.*__clickup_(update_task|create_task|create_task_comment|attach_task_file)`) | `ask` | Outward write to external service |

Raw HTTP writes to `api.github.com` (`curl`/`wget` with a mutating method) are NOT a covered action — that gate was retired. The governing control is the prompt-level rule that agents never call the GitHub API directly: `git` and `gh` are the only sanctioned GitHub channels, with the documented `gh`-fallback (`agents/_shared/gh-fallback.md`, gh absent/unauthenticated) as the sole exception. A `gh api` mutating call remains covered (table above) because it is the `gh` channel.
| Any non-covered call (Edit/Write/NotebookEdit payloads; benign Bash) | no decision (exit 0, empty stdout) | Defer to the operator's normal permission flow |

**What `ask` means:** `permissionDecision: "ask"` causes the Claude Code runtime to prompt the OPERATOR interactively for that specific call. The agent CANNOT auto-approve an `ask`. There is NO authorisation marker file — the authorisation is human out-of-band. A legitimate delivery push at STAGE-GATE-3 proceeds through this same operator approval, mirroring the preview-and-confirm contract of review-mode (#251/#252).

**Fail-CLOSED for covered actions:** the hook evaluates every covered outward action unconditionally and returns a destination-aware decision — `allow` only for the single recognized safe push form, `ask` for every other form (default-branch/tag/force/multi-refspec/non-`origin` pushes, merges, PR/issue creation, API/ClickUp writes). This is the intentional fail-mode: the consequences of an unauthorized merge to main are irreversible; the consequences of an over-zealous `ask` are a minor friction.

**Default → no-decision for non-covered calls:** when the command is not a covered outward action, the hook emits **no permissionDecision** — exit 0, empty stdout — and defers to the operator's normal permission flow. A permission gate must never widen permissions on its fail-safe path.

**No authorisation file.** A file that the agent can write with `echo authorized > ...` is forgeable by the same subject the gate protects — it is not a control. The authorisation is `ask` (human), not a file.

### Detection mechanism

Covered-action detection is parse-based, not string-matching. A shared analyzer (`hooks/ts/bodies/command-lexer.ts::analyzeCommand`) tokenizes the command with a bounded, linear-scan, quote-aware scanner, splits it into effective simple commands on unquoted `;`/`&&`/`||`/`|`/`&`/newline and bare subshell boundaries, and resolves each one to an **argv** — unquoted tokens, each marked `tainted` when it still carries an unresolved shell metacharacter (`$VAR`, `$(...)`, backtick, brace/glob/tilde). A command-executing wrapper (`bash`/`sh`/`zsh`/`dash`/`ksh`/`su -c <str>`, `eval <args>`, a literal `echo`/`printf <lit> | <shell>` pipe, ANY producer piped into a bare shell invocation, `xargs … <shell> -c <str>`) has its statically-resolvable inner payload recursively unwrapped up to a bounded depth, and the unwrapped effective commands are classified exactly like a directly-typed command — this is what closes the wrapper-embedded bypass (`bash -c "git push origin main"` now reaches the gate). `classifyCoveredAction` keys on argv[0]'s **basename**, resolved case-insensitively and `.exe`-stripped, rather than its literal spelling, so a per-subcommand binary (`git-push`, `GIT-PUSH`, `git-push.exe`, or the dynamic-path form `$(git --exec-path)/git-push`) classifies identically to the dispatcher form (`git push`) — this is what closes the per-subcommand-binary bypass, uniformly across every consumer (a single centralized resolution, not a per-hook fallback). A closed set of command-runner prefixes (`env`, `timeout`, `nice`, `nohup`, `command`, `stdbuf`, `setsid`, `time`, `sudo`, `doas`) is resolved past to the real command underneath (`env git push origin main` classifies on `git`, not `env`) and always fails closed. The retired boundary-character-class routers and the raw-string safe-character char-gate are gone; the positive benign-push grammar (`matchBenignPushGrammar`, Invariant G) now validates the RESOLVED argv instead of the command string, which is what lets a colon-refspec or a quoted-but-literal destination (`git push origin HEAD:feat/x`, `git push origin "feat/x"`) resolve to `allow` without widening what the grammar accepts — the taint marking, not a wider character set, is what tells the grammar which tokens are safe to read. A case-variant or `.exe`-suffixed binary/subcommand is still classified as covered (`ask`/`deny`) but can never itself reach `allow`.

**Residual static-resolution limits (documented honesty, not silently closed).** The analyzer resolves STRUCTURE, never shell EXPANSION — it never performs brace, glob, variable, or command-substitution expansion — so several forms remain genuinely unresolvable. An unresolvable wrapper payload (`unresolvableShellPayload`) or an exceeded unwrap depth (`depthExceeded`) is NOT gated: evaluation proceeds over the effective commands the analyzer DID resolve, so a covered action in any resolvable segment or statically-resolvable wrapper payload still asks, while a runtime-composed payload produces no decision. This recalibration exists because gating every unresolvable shell composition proved to be a constant false-positive tax on ordinary development (pipes into `sort`/`awk`/`sed`/`jq`, variable-carrying `-c` payloads, heredoc scripts) — the gate's mandate is outward git/gh/ClickUp actions expressed in the command, not arbitrary command execution. A runtime-composed outward action (`eval "$CMD"`, `curl … | bash`, an xargs `-I{}` placeholder payload) is a documented residual, owned by the platform permission flow and server-side branch protection:

- **Dynamic verb/executable** (`git $V origin main`, a dynamic subcommand or binary token) — the token is `tainted`, so the effective command stays covered-shaped and the decision fails closed to `ask` (unchanged — the resolved `git` binary is what keeps it covered).
- **Dynamic producer piped into a bare shell** (`curl … | bash`, `wget … | sh`) — sets `unresolvableShellPayload: true`; no decision (documented residual). Only a literal `echo`/`printf` producer is statically resolvable, and a resolvable literal payload carrying a covered action still asks.
- **xargs replacement-string placeholder** (`echo "git push origin main" | xargs -I{} bash -c "{}"`) — the `-I`/`--replace` placeholder is a runtime template, recognized as inherently unresolvable; no decision (documented residual).
- **Recursion-depth-exceeded** wrapper nesting — sets `depthExceeded: true`; the unresolved layers are not gated (documented residual, same contract as `unresolvableShellPayload`).
- **Script-file execution** (`./some-script.sh` that internally runs a covered action) is NOT modeled — unchanged from the retired mechanism, which also could not see inside an executed script file.
- **Alias / shell-function / PATH-shadowing execution** is NOT modeled — unchanged from the retired mechanism; an attacker with alias or PATH control already has code execution in the session and does not need to smuggle a covered action through a command string.
- **`ssh <host> "<covered action>"`** is NOT modeled as a wrapper — unchanged from the retired mechanism, which also did not unwrap an ssh-remote-quoted covered action.

**Active-obfuscation residuals (§6.6 class — not claimed closed).** Two forms remain open by construction, documented honestly rather than asserted resolved:

- **A covered action buried in an interpreter's own program-text argument** (`awk 'BEGIN{system("git push origin main")}'`, `perl -e '...'`, `python -c '...'`, `sed 'e git push origin main'`). The token-granular forward-scan cannot see inside a single quoted program-text token — closing this requires parsing the interpreter's own grammar, the general de-obfuscation path this analyzer deliberately does not attempt (it resolves STRUCTURE, never a language's semantics). Removing `awk`/`gawk`/`sed` from `SAFE_NON_EXECUTING_BASENAMES` marks the *pipe-into-executor* vector (`curl <url> | awk '{system($0)}'`) as an unresolvable payload — which under the recalibration above produces no decision (documented residual) — and does NOT close this buried-token *direct* form — a force-push variant of this shape is caught only as a backstop by `policy-block`'s raw-regex when the literal text is adjacent (e.g. `sed 'e git push --force origin main'`), not structurally; a non-force variant, or one split across multiple flag-value tokens, has no backstop. Server-side branch protection is the real floor for this class; the client hooks are defense-in-depth with an honestly-stated boundary.
- **A multi-call dispatcher invoking a shell whose basename is outside the recognized `SHELL_BASENAMES` set** (`busybox <exotic-shell> -c ...`), or **multi-level dispatcher nesting** (`busybox env sh -c ...`, dispatcher→runner→shell). The shell-name-plus-`-c` structural-signature recognizer (`detectDispatcherShellCPayload`) closes any dispatcher piping through a *recognized* shell name — it does not enumerate dispatcher basenames, so `busybox`/`toybox`/`sbase`/a renamed binary are all caught uniformly — but an unrecognized shell name or a second layer of dispatch is outside what one recognizer pass resolves.

Removing `sort`/`less`/`more` from `SAFE_NON_EXECUTING_BASENAMES` (capability-based curation — each has a documented exec-adjacent flag or interactive shell-escape) trades a small, bounded friction cost for closing the false-safety claim: these basenames are now forward-scanned like any other unrecognized leading binary, so a shape like `sort git-push-list.txt` or `less git-notes.log` may over-`ask` on the adjacent `git-`-prefixed argument token. This is friction, never a bypass.

The threat model this gate defends is disposition that rationalises the readable path — not an adversary who actively obfuscates a command past a fixed recursion bound or a shadowed binary; for the injected-obfuscation case the prompt-injection floor (§6.6) is the primary defense.

### Threat Model

**What this gate defends against, and what it does not claim to.** TH's operator is a developer working on their own system or repository. The guard hooks (`dev-guard`, `gate-guard`, `policy-block`) exist to sustain that developer's own honest disposition along the normal, legible path — catching the rationalization, haste, or drift that produces an unintended force-push typed in a hurry, an unreviewed merge clicked past, or a stray mutating command run without thinking. They are not designed, and are not claimed, to withstand an adversary who has already decided to defeat the tool. Someone motivated to bypass their own guard rails would simply not invoke TH's guarded path at all — these hooks add friction and visibility for a cooperating user, they do not sandbox an untrusted or hostile actor. This is a calibrated engineering-cost decision, not an oversight: hardening these guards to withstand every user as a potential adversary would make developing and maintaining TH prohibitively expensive for no proportionate benefit, since an actual adversary would simply not use TH at all — the guards only add friction and visibility for a cooperating user, so a hostile actor gains nothing from working within them and loses nothing by working outside them. This is why an obfuscated-evasion residual is out of the threat model by definition, not merely hard to close: a construction built specifically to defeat the analyzer is, by construction, outside the population these guards exist to help. This is a deliberate, permanent design stance, not a temporary gap awaiting the next patch.

**Scope of this framing.** Everything above and below in this section describes TH's OWN outward-action guard hooks — `policy-block`, `dev-guard`, `gate-guard` — the floors that gate the operator's own git and outward actions on their own system. It does not apply to, and must not be read as governing, the security-review work this repository's pipeline performs on application repositories it is invoked against. This pipeline's own `security` and `adversary` agents, when auditing a user's application code, keep a real adversarial threat model by default: a finding is taken seriously — fixed, or explicitly operator-risk-accepted with a documented rationale — never merely documented and deferred because reaching it required obfuscation or cleverness. The "sustain the honest developer's disposition, document rather than chase" framing is a statement about the harness's own legible-path guard hooks, not about how the pipeline evaluates security in the code it reviews for others.

**Why a bounded resolver, not a complete one.** Because the threat model above is scoped to sustaining the honest developer's disposition, not to defeating an adversary, a resolver that recognizes the command shapes normal developer and pipeline usage actually produces — and fails closed whenever a shape falls outside that recognized set — is the right-sized engineering answer; chasing every conceivable obfuscation would mean solving a problem outside this tool's actual scope. That right-sizing is reinforced by a genuine technical limit: recognizing every way a POSIX-family shell can interpret an arbitrary byte string — across quoting, parameter/command/arithmetic expansion, word splitting, multi-layer process wrapping, and interpreter-embedded execution — is undecidable in general for a client-side static analyzer, since a shell's runtime behavior depends on environment state (`$IFS`, exported variables, aliases, functions, `PATH` order) that a pre-execution parse cannot fully observe. Chasing every new obfuscation with another special case would also reopen the failure mode this repo already retired once for the force-push floor (`docs/knowledge.md`'s character-denylist decision): each patch closes the one construction found and leaks the next spelling of the same gap. The engineering answer applied here has four parts, none of them an absolute guarantee on its own:

1. **Bounded resolver** — `analyzeCommand`/`classifyCoveredAction` (`hooks/ts/bodies/command-lexer.ts`) recognize the command shapes a normal developer, script, or CI wrapper actually produces: direct commands, the modeled runner prefixes, the modeled shell/`eval`/`xargs` wrappers, and per-subcommand-binary dispatch — see § Detection mechanism above for the mechanism detail.
2. **Fail-closed on ambiguity within covered commands** — an unresolvable token (`tainted`) or an unrecognized prefix/option on a command classified as covered is surfaced as `requiresFailClosed`, and the consuming hook asks instead of guessing `allow`. An unresolvable wrapper payload (`unresolvableShellPayload`) or exceeded unwrap depth (`depthExceeded`) is, by the recalibration above, NOT treated as covered — only the resolved effective commands are evaluated (documented residual).
3. **Documented residuals** — every construction the resolver does not structurally unify is enumerated below, not silently absorbed into "closed."
4. **Defense-in-depth** — the client-side gate is one layer among several. Server-side branch protection is the authoritative floor for an unauthorized push regardless of any client-side gap; `gh pr merge` stays `ask` unconditionally; force-push stays deny-in-lane/ask-outside-lane regardless of how the command was assembled; human review at STAGE-GATE-3 / PR review is the last check before a change lands.

**What this design closes (mechanism detail: § Detection mechanism above).** Relative to the retired raw-string boundary-class/char-gate routers, the resolved-argv analyzer closes: wrapper-embedded quoted commands (`bash -c "git push origin main"`, `eval`, a literal `echo`/`printf`-to-shell pipe); the per-subcommand-binary dispatch form (`$(git --exec-path)/git-push`, case/`.exe`-variant binaries) via `classifyCoveredAction`'s centralized basename normalization; `xargs` replacement-string forms (`-I{}`/`-i`, fail-closed rather than misread as a literal payload); cross-hook case- and `.exe`-insensitive binary resolution (one centralized resolution, not a per-hook fallback); a capability-audited `SAFE_NON_EXECUTING_BASENAMES` exemption list for read-only/data-only tools; and the multi-call-dispatcher direct form (`busybox sh -c ...`) via `detectDispatcherShellCPayload`. It also removes friction: a benign non-force push to a non-default branch on `origin` — including a colon refspec or a quoted-but-literal destination — resolves to `allow` under `matchBenignPushGrammar` instead of prompting.

**Scope boundary of the legible-path gate (honestly disclosed, not an unclosed adversarial gap).** The constructions below sit outside what a normal-usage-support gate is built to recognize — they are not failures of an otherwise-adversarial-security mechanism, because no such mechanism is claimed here:

- **Runner-prefix composed with a shell `-c` wrapper** (`env sh -c "git push origin main"`, `timeout 5 sh -c "<covered>"`) — the modeled runner prefixes (`RUNNER_MODELS`) are resolved during classification (`classifyCoveredAction`), while shell/`eval`/`xargs` payload unwrapping is resolved during tokenization (`analyzeCommand`, keyed on argv[0]); the two passes do not compose into a single recursive resolution, so a runner immediately followed by a shell `-c` payload is not unwrapped.
- **A covered action buried inside an interpreter's own program-text argument** (`awk 'BEGIN{system("git push")}'`, `perl -e '...'`, `python -c '...'`, GNU `sed`'s `e` command) — the forward-scan is token-granular and cannot see inside a single quoted program-text token; closing this would require parsing each interpreter's own grammar, which the analyzer deliberately does not attempt (see the "structural default" note in § Detection mechanism).
- **A multi-call dispatcher invoking an unrecognized-shell-name applet, or a second layer of dispatcher nesting** (`busybox <exotic-shell> -c ...`, `busybox env sh -c ...`) — `detectDispatcherShellCPayload` recognizes any dispatcher piping through a name already in `SHELL_BASENAMES`, generalizing across dispatcher basenames (`busybox`/`toybox`/a renamed binary), but an unrecognized shell name or a second layer of dispatch is outside what one recognizer pass resolves.
- **Parser-differential constructions** (brace expansion, `$IFS`-based word splitting, line continuation) that could cause the analyzer's tokenization to diverge from what the shell actually executes — the analyzer resolves STRUCTURE, never shell EXPANSION; any token carrying an unresolved metacharacter is marked `tainted` and fails closed, but a construction that changes word boundaries themselves, rather than substituting inside an already-bounded token, is a class the tokenizer does not model.
- **`ssh <host> "<covered action>"`** — never modeled as a wrapper, unchanged from the retired mechanism; an operator with `ssh` access to the target host already has code execution there independent of this gate.

**Follow-on.** Adversarial-evasion concerns are out of this gate's threat model by definition — per the framing above, a construction built to defeat the analyzer is, by construction, outside the population this gate protects. Anyone who genuinely needs a defense against an actively hostile local actor needs a permission/sandbox architecture, tracked separately as issue #505; that is out of scope here.

---

## Deterministic order floor (`gate-guard`) — deny vs ask, and the force-push floor (Invariant E)

**`gh pr create` correction — already covered, not net-new.** The table above lists `gh pr create` as `ask` by default with an `allow` opt-in (`autogate.pr_create`) — that coverage PRE-DATES this section and is unchanged by it. The net-new contribution documented below is the ORDER floor (`gate-guard`), not `gh pr create` coverage.

**What `gate-guard` adds.** `gate-guard` (`hooks/ts/bodies/gate-guard.ts`, its own dedicated PreToolUse `Bash` entry, structural sibling of `prepublish-guard`) is a SEPARATE deterministic hook that closes a gap neither `dev-guard` nor `policy-block` addressed: whether a `git push` / `gh pr create` from a pipeline lane is preceded by a recorded `gate3_release: ship` for that lane. It resolves the governing lane by mtime-selecting the active `00-state.md` — parity with `checkpoint-guard`'s `selectByMtime` (local workspaces subtree +, when configured, the obsidian vault subtree) — then correlates the current git context against that lane. Correlation is branch-first in BOTH delivery topologies: when the lane declares a `working_branch` and the current branch is readable, branch equality alone decides — the lane owns exactly that branch, a match governs, and a mismatch defers to `dev-guard` (operator-directed non-pipeline work, e.g. the `/th:inline` posture, is never captured by an order gate it cannot satisfy). The worktree-realpath match (`realpath(cwd()) == realpath(worktree)`) is a fallback that governs only the lane's pre-branch window (no `working_branch` declared yet) or when the current branch cannot be resolved (fail-closed toward the lane); a branch-in-place lane (`worktree: null`) resolves by branch name alone. Accepted residual under the honest-developer threat model: in-lane work pushed from a renamed branch escapes this correlation; force pushes remain covered by `dev-guard`/`policy-block` regardless. Full contract: `agents/_shared/gate-contract.md § "Outward-action release floor"`.

**Block-on-condition / open-on-fault, fail-closed once a lane resolves.** Once a governing lane RESOLVES, `gate-guard` is fail-closed: `gate3_release ∈ {ship}` → `none` (permit); any other value (`null`, `amend`, `abort`), or a field-read fault discovered after the lane already resolved, → `deny`. When NO lane resolves at all — a manual developer push, an inline (no-orchestrator) session, an unrelated repository, or no active `00-state.md` found — `gate-guard` defers: `decision: none`. `none` is reserved exclusively for "no lane resolved"; it is never returned for a resolved lane with a corrupt or missing field.

**Deny (`gate-guard`, ORDER) vs ask (`dev-guard`, destination) — independent and additive, not a replacement.** `gate-guard`'s decision set is `{none, deny}` only — it never emits `ask`, so it neither inherits nor removes the ask-class caveat below, which continues to apply unchanged to `dev-guard`'s own `ask` on `gh pr create`/`gh pr merge`. `dev-guard` gates by WHAT the command targets (destination), unconditionally on session state. `gate-guard` gates by WHETHER a release was recorded before this specific invocation (order), only when a pipeline lane resolves. A push/pr-create from a detected lane must clear BOTH checks independently — `gate-guard`'s order deny AND `dev-guard`'s destination-based ask/allow — neither one substitutes for the other.

**Residuals this floor does NOT close.** `gate-guard` reads `gate3_release` — an intra-privilege-forgeable field, per the same no-writer-identity limit as every other gate-release field (`agents/_shared/gate-contract.md § "Integrity model"`, layer 1): nothing distinguishes which agent wrote it, and this addition does not verify writer identity. Nor does it bind CONTENT: `gate3_release: ship` fixes ORDER (that the release preceded the push), not a tree hash — HEAD can move between recording `ship` and the push actually running (an `amend`, a concurrent mutation), so the pushed tree can differ from the one the operator saw at the gate. This content-drift residual is mitigated elsewhere (an `amend` re-runs Internal Review and regenerates the gate nonce), never by `gate-guard` itself — see `agents/_shared/gate-contract.md § "Integrity model"` for the full honesty statement.

**Force-push floor (Invariant E, operator-mandated) — layered, not redundant.** `gate-guard` also denies, unconditionally on `gate3_release`, a force-push from a detected pipeline lane in EITHER form: the flag form (`-f`, `--force`, `--force-with-lease`) or the `+`-prefixed refspec form (`git push origin +feature:main`) — force-push is never legitimate from an in-lane pipeline delivery, so `ship` does not authorize it. This deny layers on top of two pre-existing floors, unchanged by this design:

- `policy-block`'s unconditional flag-based force-push deny (`hooks/ts/bodies/policy-block.ts:295` — `/git\s+push\s+(?:[^|]*\s)?(-f\b|--force\b|--force-with-lease)/i`), which applies in every context, pipeline or not.
- `dev-guard`'s outside-lane `ask` on a `+`-prefixed refspec (`hooks/ts/bodies/dev-guard.ts:559-561`), destination-only, with no lane-state read.

**Detection mechanism (Invariant G) — a shared closed positive grammar over resolved
argv, not a character-denylist.** `gate-guard`'s force/shape check consumes the same
shared analyzer described above (`command-lexer.ts::analyzeCommand` +
`classifyCoveredAction`) to resolve the executed command — including through a
command-executing wrapper or a per-subcommand binary — to argv, then calls
`matchBenignPushGrammar(argv, tainted, reader)` on the RESOLVED argv. It permits ONLY
the exact benign push shape — `git push [-u|--set-upstream|-v|--verbose|--progress]
origin <plain-branch>`, where `<plain-branch>` excludes any ref-namespace-qualified or
tag-like destination (checked via `isPlainBranchDestination`) — and denies every
deviation from that one shape: no force flag, no `+`-prefixed refspec, and no token
that stayed `tainted` (an unresolved `$`-expansion, substitution, brace expansion, or
glob) can pass, because the grammar rejects any tainted token outright rather than
inspecting its characters against a fixed safe set. A dash-prefixed positional (`git
push origin -f`) is closed separately: every dash-prefixed token, in any position, is
classified as a flag and checked against the same benign allowlist. This replaces an
earlier character-denylist implementation of the same invariant, defeated three times
by three different shell token-reconstruction techniques — a denylist can only
enumerate the constructions it already knows about, while a positive grammar over
resolved argv denies anything that is not the one permitted shape, known or not,
INCLUDING a shape reached only through a wrapper or a per-subcommand binary that the
retired string-level grammar never saw. `gate-guard` (force+order deny) and
`dev-guard`'s push gate both consume this single shared analyzer and grammar module —
one source of truth, never duplicated.

**Honest scope of the grammar (resolved-argv-level, still not full shell
semantics).** The grammar reasons about the RESOLVED argv the analyzer could
statically determine, not everything a live shell might ultimately execute. An
env-assignment prefix (`GIT_SSH_COMMAND=x git push …`), a `git -c <k=v>` config
override, or a tree/exec-path-redirecting global option (`--git-dir`, `--work-tree`,
`--namespace`, `--exec-path`, a non-exact `-C`) on a covered push is surfaced by the
analyzer and the consuming hook fails closed on it — these are no longer silently out
of scope, unlike the retired string-level grammar. What remains genuinely out of scope
by design: git config already persisted in the repository (`push.default`,
`remote.origin.push`, a `.gitconfig` URL rewrite), a `git` shell alias or function, a
shadowing `git` binary earlier on `PATH`, and remote execution via `ssh <host>
"<cmd>"` — an attacker who controls any of those already has code execution in the
session or on the target host and does not need to smuggle a force-push through a git
command string. This is the same class of limit every parse-based hook in this repo
carries (`policy-block`, `dev-guard`), not a regression introduced by this mechanism.

**Non-redundancy rationale.** `gate-guard`'s own deny is not superfluous: (i) it gives `gate-guard` a self-sufficient in-lane guarantee that does not depend on a sibling hook's regex never changing — a defense-in-depth stance consistent with this repo's own recurring lesson that a contract enforced at one site alone tends to drift from its siblings; (ii) it is the ONLY hook that closes the `+refspec` sub-form for the in-lane case — `policy-block`'s flag-only regex does not match a bare `+`-prefix, and `dev-guard`'s handling of that sub-form is destination-only and never reads pipeline-lane state.

**This design never touches or works around server-side branch protections.** Nothing here bypasses, disables, or reconfigures a repository's branch-protection rules. Mutating `gh api` writes remain `ask` under `dev-guard`, unchanged.

**The philosophy this design anchors: only two hard points.** Force-push (deny in-lane, `ask` outside) and merge (always `ask`, non-configurable) are the only two hard points in the outward-action model; every other git operation — branching, committing, pushing to a feature branch, opening a PR — stays frictionless. "Merge" in this statement means a **PR merge** — `gh pr merge`, or any action that lands commits on `main` or another protected branch — never a LOCAL `git merge origin/main` into the pipeline's own working branch (an ordinary fast-forward/update, which is unremarkable git handling and must never be asked or denied). This distinction holds at the classification level: the shared analyzer resolves a covered `gh pr merge` invocation to argv `["gh", "pr", "merge", …]` — lexically distinct from `git merge` — and `gate-guard` introduces no classification for any form of "merge" at all; a local `git merge` is not a covered action for either hook.

---

## Ask-class caveat — the gate stops only when the session stops on `ask`

The outward-action gate is `ask`-class, not `deny`-class. When `dev-guard` returns `permissionDecision: "ask"` for a lane's push / merge / PR write, that decision only STOPS the action if the operator's session actually halts on an `ask` — i.e. the session is interactive and a present operator answers the prompt. It is not a `deny`: the runtime does not refuse the action outright; it defers to the operator's normal permission flow. This is a deliberate loosening (a delivery push at STAGE-GATE-3 must be able to proceed through operator approval), and its consequences must be stated honestly rather than oversold.

- **Do not assume `ask` stops under a broad Bash auto-allow.** If the operator's session runs with a blanket `Bash` allow, `--dangerously-skip-permissions`, or any posture that auto-satisfies `ask` prompts, an `ask` is auto-answered and the outward action proceeds with no human in the loop. The gate did its job (it issued `ask`); the session's permission posture is what determined whether that `ask` actually halted.
- **Do not assume `ask` stops under a non-interactive or bridged posture.** In a headless / `-p` / bridged / relay session there may be no interactive operator to answer the prompt; how the runtime handles an unanswered `ask` is a session-posture property outside the gate's control.
- **th:leader's gate presentation must not oversell this.** When th:leader presents a lane's STAGE-GATE to the operator inline and relays the decision back to the owning orchestrator (`agents/leader.md § Gate presentation protocol` — "Ask-class caveat"), the presentation is a request for a human decision, not a claim that anything is being mechanically "halted." The leader does not know the session's permission posture and must not imply a guarantee the `ask`-class gate does not make.
- **The in-lane skip-permissions prohibition IS a `deny` floor — correctly so.** Where an outward-action `ask` is deliberately soft, the security-critical case of a lane spawning a `claude … --dangerously-skip-permissions` child is a `deny` in `policy-block` (SEC-DR-B, AC-6.2) — fail-closed, not deferred. The asymmetry is intentional: a skip-permissions spawn would bypass every downstream hook at any depth, so it is refused outright rather than handed to a permission prompt that a broad auto-allow could satisfy. AC-6.4 (native `Task`-tool spawn on the split path — no Bash `claude` invocation exists to evade) is the structural control; the `policy-block` deny is the defense-in-depth backstop for the legacy Bash-spawn path.

---

## STAGE-GATE-3 presentation and the ask-class loosening (SEC-DR-G)

The ask-class caveat has a direct consequence for how STAGE-GATE-3 — the human push/PR gate — is surfaced and released in the leader+orchestrator split.

**(a) The leader presents STAGE-GATE-3 inline and relays the operator's decision.** STAGE-GATE-3 is prepared and recorded inside the orchestrator that owns the task; the leader presents its STOP block to the operator inline — in the operator's main conversation, the only reliably reachable channel — and relays the operator's decision (verbatim, tagged `leader-relayed-operator`) back to the orchestrator, which records the release (`agents/leader.md § Gate presentation protocol`). Because the outward-action `ask` does not itself guarantee a stop (it can be auto-satisfied), the presentation must be an active, unmissable interactive surface that names three things: the orchestrator (its slug), the gate (`STAGE-GATE-3`), and the decision the operator is being asked to make. A passive breadcrumb the operator might scroll past is insufficient — the human decision is the actual control here. The deterministic floor on the actual push/PR remains `dev-guard`'s native `ask`, not this presentation; the presentation is what routes the operator to that decision.

**(b) Anti-pattern: broad Bash auto-allow + lane mode.** Running a multi-lane fan-out under a blanket `Bash` auto-allow (or any posture that auto-answers `ask`) is an anti-pattern: it removes the human from the STAGE-GATE-3 outward-action prompt, so a lane's delivery push/merge could proceed without the operator ever entering the gate. The operator releases STAGE-GATE-3 by replying to the leader's inline presentation; the leader relays that decision to the owning orchestrator, which records the release (the gate release travels operator → leader → orchestrator, tagged `leader-relayed-operator`), and recover's STAGE-GATE-3 clear-allowlist requires `gate3_release = ship` (`skills/recover/SKILL.md § Rule 1`). The broad auto-allow posture defeats the interactive stop this design depends on.

**(c) recover's fail-safe covers gate NON-release, not an already-run `ask`-satisfied action.** `/th:recover`'s Rule 1 (re-present any un-cleared STAGE-GATE, fail-closed — `skills/recover/SKILL.md`) protects the case where a gate was never released: on resume it finds no `gate3_release = ship` plus `stage.gate.release` event and the orchestrator returns its `gate_pending`, which `th:leader` re-presents inline. It does NOT and cannot undo an outward action that ALREADY RAN because an `ask` was auto-satisfied under a broad auto-allow — a push that already landed is not an un-cleared gate, it is a completed irreversible action with no state to re-present. The fail-safe is a forward re-prompt for un-taken decisions, never a rollback of a taken one. This is the residual the ask-class loosening acknowledges: the deterministic floor for the truly irreversible in-lane case is the `deny` in `policy-block` (see the ask-class caveat above), not recover.

---

## Inline Orchestration Permit (SEC-DR-2)

**Re-founded in v2.89.0.** Executing the orchestrator role inline at top level is the CC native architecture — the general agent IS the orchestrator. No filesystem marker is required. The condition for inline orchestration is:

- The session is a top-level CC session (level 0 — `Task` is available), AND
- The request is a development task that belongs in the pipeline.

This condition is satisfied in every normal CC session. No separate activation step, no marker write, no mode toggle.

**Prohibited case:** executing orchestration inline is PROHIBITED only when the top-level agent is itself running as a subagent inside another orchestrator. In that case, the nested-handoff/takeover machinery in `docs/subagent-orchestration.md` is the FALLBACK (opencode/legacy path).

**Previous framing (retired):** before v2.89.0, SEC-DR-2 required `~/.claude/.dev-mode-active` to contain `dev_mode: true`. That observable was retired when the foundational premise (nested orchestrator loses `Task`) was disproven by the M1 empirical probe. The gate — `dev-guard` — is now unconditional.

---

## Disposition mechanism: output-style replaces the base (persistent strong floor)

**Why output-style, not a skill.** A prior implementation used a `/dev-mode` skill (commit 18ea492). A live test proved that mechanism structurally insufficient: the skill LAYERED the orchestrator contract OVER the base "make-progress" disposition of the general agent, and the base won — the agent operated inline, merged a PR to main without a pipeline, and rationalised the skip. A skill superposes; the base built-in beats it.

The correction is a change of MECHANISM, not of content. The `developer-mode` output style with `keep-coding-instructions: false` REPLACES the built-in software engineering instructions (how to scope changes, write comments, verify work) instead of layering over them. There is no base to beat — it is gone. The orchestrator contract (routing Step 6 + Discover + reasoning-checkpoint + anti-rushing/triage) becomes the governing set of instructions for the session.

**What `keep-coding-instructions: false` discards — and why its loss is not a security gap (AC-18).**

The Claude Code docs describe this flag precisely: *"Custom output styles leave out Claude Code's built-in software engineering instructions, such as how to scope changes, write comments, and verify work."* And the framing: *"Output styles change how Claude responds, not what Claude knows."*

This distinction is load-bearing:
- **What is discarded:** SWE WORKFLOW guidance (how to scope, comment, verify). This is disposition of process, NOT a security control. Its absence degrades workflow tidiness, not safety. The orchestrator contract loaded by the style replaces this guidance with a more explicit version: the SDD pipeline IS scoping + verification.
- **What is NOT discarded:** The model's harm-rejection and safety layer ("what Claude knows" — Anthropic's constitutional training). An output style adjusts the system prompt; it does NOT disarm the model's refusal to produce harmful outputs, exfiltrate data, or follow malicious instructions. That layer does not live in the "software engineering instructions" block.
- **Security floors are PROMPT-INDEPENDENT (hooks, not prompt):** the security guarantees of this harness are PreToolUse hooks wired by matcher — they fire regardless of which system prompt is active. Every gate below runs through `hooks/run-ts-hook.sh <name>`, a fail-closed launcher that execs `node` against the matching `hooks/ts/dist/<name>.cjs` bundle (TypeScript is the single source of gate logic for CC and opencode). The enumerated catalogue (Bash-command gates + the MCP-write gate) is:
  - `policy-block` — matcher `Bash|Write|Edit|NotebookEdit`. Blocks `rm -rf / ~ $HOME`, `git push --force`, `git reset --hard`, `git clean -f`, `--no-verify`, destructive SQL, and writes to sensitive file paths (`.env`, `.pem`, `.ssh/`, credentials). Survives the output-style swap intact.
  - `dev-guard` — two dedicated PreToolUse entries: (a) `Bash`-only: gates outward/mutating Bash actions unconditionally (git push, gh pr merge/review/comment, gh api mutating PR endpoints; see § Outward-Action Gate); (b) `mcp__.*__clickup_(update_task|create_task|create_task_comment|attach_task_file)`: gates ClickUp MCP outward writes unconditionally — issues `ask` on any write. Both entries survive the output-style swap intact.
  - `checkpoint-guard` — matcher `Task`. Gates phase dispatch at reasoning-checkpoint boundaries. Survives intact.

**Conclusion:** `keep-coding-instructions: false` is safe for this harness because the security floors are hooks, not prompt. No security-relevant default lives exclusively in the discarded SWE instructions that the orchestrator contract + hooks do not re-establish.

**Default-on disposition (v2.89.0+):** The `SessionStart` hook (`session-start`, run via `hooks/run-ts-hook.sh session-start`) fires an orchestrator disposition directive at every session start — no marker needed. Operators can optionally select the `developer-mode` output style via `/config` → Output style → `developer-mode` for the strong base-replacement (`keep-coding-instructions: false`).

**`force-for-plugin` is NOT set** on the `developer-mode` output style — it is never applied automatically via the plugin mechanism. The output style is an opt-in strong floor. `force-for-plugin` is intentionally omitted to preserve the per-operator escape hatch.

---

## Security Floor Non-Waivability (SEC-DR-3)

The orchestrator disposition is a **signal of routing topology** — the same category as the intake survey answers and `--fast`. Like those signals, it is NEVER written to `security_sensitive`, `security_gate_status`, or any gate-status field in `00-state.md`.

The following security mechanisms run **input-independent** and are NOT waivable:

- **HI-2 (discover-phase.md §3):** the security floor non-waivability invariant. No disposition signal can bypass the security gate. The gate fires whenever `security_sensitive: true` is set, regardless of session state.
- **Path-pattern auto-escalation (`leader.md § Phase 0a` classification):** sets `security_sensitive: true` based on file paths touched by the PR. This runs on the diff, not on the session state.
- **Bug-fix forcing rule:** for `type: fix` and `type: hotfix`, `security_sensitive: true` is forced. On a sensitive task the non-waivable floor is: SEC-002 design-review at Stage 1, plus `adversary` at the Pre-Delivery Security Audit (Phase 3.8); code-level audit is delegated to PR review, referred to generically (not dependent on any specific configured tool).

---

## Triage Safety-Bias (SEC-DR-1)

The general agent's default disposition ("be helpful / make progress") is replaced — not just supplemented — by the output style. Before taking any action:

**TRIAGE INVARIANT — FAIL-CLOSED:** before ANY ambiguity about whether a task requires the pipeline → enter the pipeline or ask for confirmation; NEVER treat ambiguity as a license to handle the task inline without gates.

**Phase Checklist enforcement:** no Phase Checklist item may be marked `[~skipped: reason]` unless the skip is authorised by an operator-declared tier (`[TIER: 0]`, `[TIER: 1]`, `--fast`) or the bug-fix tier system. Marking a gate as skipped without authorisation is a contract violation.

---

## Reasoning Checkpoint Promotion

In standard mode (orchestrator as subagent, `Task` stripped on opencode path), only the Layer-2 self-check (orchestrator's own contract discipline) enforces the reasoning checkpoint at boundaries B1/B2/B3. The Layer-1 hook (`checkpoint-guard`, `PreToolUse`/matcher `Task`) never fires because there is no `Task` call to intercept.

On the CC foreground path (top-level, `Task` available), the Layer-1 hook fires on every leaf dispatch. B1/B2/B3 are enforced by a harness-level deterministic floor, not just the orchestrator's own discipline. This is a strengthening of the checkpoint. Security floors remain independent of the checkpoint state in both modes (see `docs/reasoning-checkpoint.md § Enforcement`).

---

## Role Adoption

When the orchestrator disposition is active, the top-level agent reads and applies the following files (by pointer — the output style body does not duplicate their content):

- `agents/leader.md` — intake, Discover phase, classification and routing.
- `agents/orchestrator.md` — all phase contracts and gate enforcement.
- `docs/discover-phase.md` — patient intake, advance-signal gate, intake survey.
- `docs/reasoning-checkpoint.md` — B1/B2/B3 boundaries and advance contract.
- `docs/subagent-orchestration.md` — dispatch protocol and Takeover Pipeline Manifest.

Resolve these from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`

---

## Reconciliation with review-mode hard gates (#251/#252)

The review-mode hard gates (merged in #251/#252) and the outward-action gate address the SAME class of risk — outward action without operator approval — at complementary layers:

| Aspect | #251/#252 (review mode) | outward-action gate | Relation |
|---|---|---|---|
| Risk class | Publish review/comment without operator approval | push/merge/publish inline | SAME class |
| Enforcement layer | PROMPT (imperative constraints) + Suite 57 tokens | FLOOR deterministic (hook Bash) | COMPLEMENTARY |
| Approval mechanism | Preview-and-confirm, `--auto-publish` opt-in | `permissionDecision: "ask"` (human out-of-band, agent cannot auto-approve) | MIRRORS preview-and-confirm |
| Coverage | `gh pr review`, `POST /reviews`, replies, dismiss | by DESTINATION: push to remote; `pulls/.../merge|reviews|comments` via any binary | SUPERSET of #252 vocabulary |

The gate does NOT re-implement the review-mode publish gate. It reinforces it with a floor that the agent cannot rationalise through. Where #252 covers review-mode at prompt level, `dev-guard` covers at hook level — and by extension it also protects the "top-level inline execution" site that #252 identified as the highest-risk gap. See `agents/ref-direct-modes.md § Publish Gate` for the review-mode contract.

---

## Threat model — honest-developer disposition

TH users are developers working on their own systems. The guards, gates, and floors described throughout this repo support the honest-developer disposition — catching rationalization, haste, and drift on the readable path — they are NOT a security boundary against an active adversary.

The observation that someone determined to break a system would not route the attack through the harness — which only adds friction and visibility — is bound specifically to the injected-content / deliberate-obfuscation vector, for which CLAUDE.md §6.6's own prompt-injection floor is the primary defense. It never justifies waving off a gate's incorrect behavior on an honest, readable input.

A gate or floor that does the WRONG thing on a plain, readable, non-obfuscated input — a logic error, a destination/classification mistake, a missing or fail-open check, an incorrect predicate — is ALWAYS an in-scope defect, chased through iterations like any other finding, and is NOT covered by this disposition. This disposition covers ONLY the residual where a gate behaves correctly on every readable input and can be defeated solely by deliberate obfuscation that reconstructs a gated token the string-matching gate cannot see as a contiguous string (the `eval`/`base64`/quote-splicing/`$`-expansion class enumerated at `docs/dev-mode.md:39`, this same file's "Residual static-resolution limits" section above).

Only that obfuscation-evasion residual of string-matching gates is a documented, disclosed limitation — not chased through pipeline iterations, and outside this threat model — recorded honestly where it lives.

A limitation qualifies as "documented, not chased" only when it is BOTH (a) disclosed in-place where it lives, AND (b) scoped out through a legitimate mechanism — the architectural-inevitability limit for the string-matching-gate case is the canonical example. (A previously-tracked second example, the mid-iteration classification-timing gap in the retired per-task Phase-3 security dispatch, is addressed by the Pre-Delivery Security Audit's positional design: `adversary` reviews the consolidated final diff once per delivery group when `security_floor_applies` holds, so a control introduced by any patch iteration on a sensitive task is reviewed regardless of which iteration introduced it. This coverage is scoped to `security_floor_applies == true`, not classification-independent — code-level review on a non-sensitive task is delegated to PR review — `agents/orchestrator.md § "Phase 3.8 — Pre-Delivery Security Audit"`.) Cross-ref: this file's "Residual static-resolution limits" section.

This disposition is narrowly scoped to the residual class described above. It does NOT license skipping any real in-scope finding, does NOT weaken or waive any floor, and does NOT change when or whether the SEC-002 design-review or `adversary` dispatch — security floors stay non-waivable.

---

## Installation

`/th:setup` installs the outward-action gate by:
1. Copying `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (makes the `developer-mode` style available in `/config` as an opt-in strong floor).
2. Writing the `orchestrator-dispatch-rule` managed block to `~/.claude/CLAUDE.md` (operator-facing documentation of the feature).

`/th:update` re-synchronizes the output style and managed blocks on every run. It removes any retired `dev-mode`, `nested-dispatch-takeover`, and `dev-mode-entry` blocks from existing `~/.claude/CLAUDE.md` files. No marker is written.
