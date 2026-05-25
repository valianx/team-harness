---
name: docs
description: "Generate Obsidian documentation for a service, database, API, library, or product. Routes through the orchestrator documentation pipeline: architect researches → documenter writes → diagram agents visualize → QA validates."
---

# /th:docs — Documentation Pipeline

Parse the user's input to extract:

1. **Topic(s):** what to document (service name, database, API, library, product, etc.)
2. **Language:** look for `--lang <code>` flag. Default: `en`. Examples: `--lang es`, `--lang pt`.
3. **Folder:** look for `--folder <name>` flag. Default: derived from the topic name (kebab-case).
4. **Vault:** look for `--vault <name>` flag. Default: the `default` vault from `~/.claude/config/obsidian-vaults.json`.

## Examples

```
/th:docs the auth service
/th:docs --lang es the payment API
/th:docs --folder infrastructure the deployment setup
/th:docs the user database --lang en
```

## Multi-topic detection

If the input contains multiple topics separated by commas, "and"/"y", or enumerated:

```
/th:docs the auth service, the user database, and the payment API
```

Pass all topics to the orchestrator. It handles parallel dispatch (one research+write cycle per topic).

## Route

Pass to the `orchestrator` agent with this task context:

```
Task: documentation
Type: docs
Topics: {parsed topic list}
Language: {parsed language code, default: en}
Folder: {parsed folder name, default: derived from topic}
Vault: {parsed vault name, default: from config}

Operator request: {original user input}
```

The orchestrator handles the full documentation pipeline (see `ref-special-flows.md` § Documentation Flow).
