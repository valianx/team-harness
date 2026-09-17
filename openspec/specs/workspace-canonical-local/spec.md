# workspace-canonical-local Specification

## Purpose

Keep continuity notes and temporary evidence in a predictable configured home
without making a Team Harness workspace a second authority source.

## Requirements

### Requirement: Workspace notes have one resolved home
When a workflow needs continuity, Main SHALL resolve one configured workspace or
permitted temporary location and record its repository, branch, objective and
source links. A direct task that needs no continuity creates no workspace.

#### Scenario: A multi-repository task needs shared notes
- **WHEN** the operator chooses coordinated work across repositories
- **THEN** Main uses one configured shared location for links, progress and evidence while each repository retains its own source files

### Requirement: Notes do not authorize current work
Workspace plans, traces, review summaries and old control files SHALL be treated
as historical or advisory evidence. On resumption Main verifies them against the
current repository, commits, native session status and live operator context.

#### Scenario: A saved note points at a different branch
- **WHEN** the current checkout differs from the note
- **THEN** Main reports the mismatch and continues only with facts from the current checkout and applicable authorization

### Requirement: Temporary evidence is cleaned explicitly
Raw logs, scratch scripts, transcripts and disposable review artifacts SHALL use
the configured workspace or permitted temporary storage and SHALL be removed or
retained deliberately at close. Cleanup MUST not delete maintained source,
OpenSpec artifacts or unrelated user work.

#### Scenario: A workflow closes after a failed attempt
- **WHEN** diagnostic debris is no longer needed
- **THEN** Main cleans only the known temporary artifacts and keeps the durable conclusion in the task or PR result

### Requirement: Restart and relocation do not create duplicate workspaces
If a native session restarts or the current directory changes, Main MAY resolve
the existing note by repository and objective identity. It SHALL not create a
second authority record or duplicate source-of-intent artifacts merely because
the process changed.

#### Scenario: The operator resumes from another runtime
- **WHEN** the repository and objective match an existing continuity note
- **THEN** Main reuses the note as context and verifies current facts before continuing
