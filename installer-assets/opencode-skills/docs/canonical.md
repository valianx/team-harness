
# /th:docs — Documentation Workflow

Parse the user's input to extract:

1. **Topic(s):** what to document (service name, database, API, library, product, etc.)
2. **Language:** look for `--lang <code>` flag. Default: `en`. Examples: `--lang es`, `--lang pt`.
3. **Folder:** look for `--folder <name>` flag. Default: derived from the topic name (kebab-case).
4. **Vault:** look for `--vault <name>` flag. Resolve it from the active runtime's vault settings or supplied task context; otherwise use the configured default vault. If the destination is unresolved, ask for it before writing.

## Examples

```
/th:docs the auth service
/th:docs --lang es the payment API
/th:docs --folder infrastructure the deployment setup
/th:docs the user database --lang en
```

## Method

For each topic, establish the intended audience and the questions the pages must
answer. Classify the subject when it helps scope the work (`service`, `database`,
`api`, `library`, `infrastructure`, or `product`).

Research the current project sources first: code, configuration, existing docs,
API or schema definitions, and relevant tests. Use current primary external
sources when the subject depends on a library, product, or public contract.
Keep observed facts separate from inference, retain source links or file
locations for non-obvious claims, and treat the research as the fidelity source
for the written pages.

Write the pages in the configured vault and folder, preserving the vault's
existing navigation and conventions. Use the requested language for prose while
leaving code, YAML keys, and diagram syntax valid. Add Mermaid, Excalidraw, or
Canvas diagrams when they clarify a flow or relationship; derive their content
from the researched facts rather than decorating the page.

Review the result against the research and the intended audience. Check that
major topics are covered, links and frontmatter are valid, navigation resolves,
language is consistent, and diagrams do not assert unsupported behavior. Fix
fidelity or usability gaps before reporting completion. Keep only durable
product knowledge in the vault; scratch notes and raw research belong in the
configured temporary or workspace location.

The current agent coordinates this work. Delegate independent research,
writing, diagram, or accuracy checks when that reduces work or adds useful
expertise, then reconcile their findings. A fixed role chain or parallel fan-out
is not required.

## Multi-topic detection

If the input contains multiple topics separated by commas, "and"/"y", or enumerated:

```
/th:docs the auth service, the user database, and the payment API
```

For multiple topics, process independent topics separately when useful and then
check cross-links and terminology across the complete set. The configured vault
and folder are the destination; do not substitute a workspace or repository
file unless the operator asks for that output.
