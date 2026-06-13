---
name: learn
description: Ask the mentor to explain a codebase, library, framework, language, or concept. Answers in chat with short inline diagrams; the teaching-pack file is an optional end-of-session artifact.
---

Analyze the input: $ARGUMENTS

---

## Mode 1 — Topic provided

Build a task payload and pass it to the `orchestrator` agent:

```
Direct Mode Task:
- Mode: learn
- Topic: {user's topic or question}
```

If `--resume` is present in the arguments, include it in the payload:

```
Direct Mode Task:
- Mode: learn
- Topic: {user's topic or question}
- Resume: true (continue from existing teaching pack if one exists for this topic)
```

## Mode 2 — No input provided

Ask the operator: "What would you like to learn? You can ask about a concept, a library or framework, a language feature, or how a specific part of this codebase works. Example: 'explain how React hooks work', 'how does the auth layer work in this project', 'explain how transformers work'."

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly.
- The orchestrator will classify `learn` as a read-only direct mode and dispatch the `mentor` agent only for the optional teaching-pack or deep background research.
- Output: the answer in chat with a short inline diagram. For codebase questions where the repo is open, the first answer SHOWS the real code by default (snippets quoted verbatim with `file:line`, walked in execution order, named entry points) and the inline diagram is a code-grounded data-flow pipeline of the real symbols. The teaching-pack file (`workspaces/{topic-slug}/00-teaching-pack-{topic-slug}.md`) is an optional end-of-session artifact — not the default deliverable.
- The `--resume` flag resumes an existing teaching pack without re-covering already-taught layers.
