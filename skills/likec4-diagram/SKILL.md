---
name: likec4-diagram
description: Generate architecture diagrams using the LikeC4 DSL. Use when the user wants to create, visualize, or document system architecture as code. Produces .c4 source files with optional PNG export via CLI. Does not replace Excalidraw diagrams — use for architecture-as-code specifically.
---

# LikeC4 Diagram Creator

Generate `.c4` architecture diagram files using the LikeC4 DSL that **communicate structure and decisions**, not just label boxes.

---

## Core Philosophy

**Architecture diagrams should argue, not display.**

A diagram is not a formatted list of components. It is a visual argument that shows what belongs together, how data flows, and which boundaries matter. The structure of the diagram should BE the argument.

**The Decision Test**: Does the diagram reveal why things are structured this way? If it only shows what exists without communicating the rationale, it's an inventory list, not an architecture diagram.

**The Audience Test**: Could a new engineer understand the system's intent from this diagram alone? If not, add more context to relationships and boundaries.

LikeC4 is architecture-as-code — treat it with the same care as production code. It is a living document, not a one-shot artifact.

---

## Depth Assessment (Do This First)

Before writing any DSL, determine the scope:

### Landscape View (System Context)
Use when:
- Showing a system in relation to its users and external dependencies
- Audience needs "where does this fit in the world?" perspective
- Appropriate for a high-level executive or new team member
- Focus: actors, systems, and their interactions — no internals

### Container View (Architecture)
Use when:
- Showing the major deployable units within a system
- Audience needs to understand runtime topology
- Appropriate for architects and senior engineers
- Focus: services, databases, frontends, APIs — one level deep

### Component View (Detailed)
Use when:
- Showing the internal structure of a container or service
- Audience needs to understand how code is organized
- Appropriate for developers implementing or reviewing a module
- Focus: classes, modules, packages, handlers — fine-grained

### Dynamic View (Sequence / Flow)
Use when:
- Showing a specific use case or workflow through time
- Audience needs to understand the order of operations
- Appropriate for debugging, onboarding, or API documentation
- Focus: named steps with explicit sequence and actors

**For most diagrams, start with Landscape + Container. Add Component and Dynamic only when explicitly needed.**

---

## Research Mandate

**Before writing a single line of DSL, analyze the codebase.**

Use Glob, Grep, and Read to discover:
1. **Entry points** — what are the top-level services or applications?
2. **Communication patterns** — HTTP, gRPC, message queues, shared databases?
3. **External dependencies** — third-party APIs, cloud services, authentication providers?
4. **Data stores** — databases, caches, file storage?
5. **Boundaries** — what belongs to "this system" vs external actors?
6. **Technology stack** — languages, frameworks, runtimes?

Use these findings to populate the `specification` block with appropriate element kinds and the `model` block with real names, descriptions, and technology annotations.

**Bad:** `api = component 'API'`
**Good:** `api = component 'REST API' { technology 'Express.js + OpenAPI 3.0' description 'Handles all client requests, validates JWTs, routes to domain handlers' }`

---

## DSL Structure Overview

A LikeC4 file has four top-level blocks:

```
specification { ... }   // define element kinds, relationship kinds, colors, tags
model { ... }           // declare the elements and their relationships
views { ... }           // define what to render and how
```

The specification is reusable across files. The model is the source of truth. Views are lenses into the model.

See `references/dsl-reference.md` for complete syntax and all available shapes, colors, and properties.

---

## Specification Block Design

The specification block defines the vocabulary of your architecture. Design it to match the system's actual concerns — do not use generic terms if the system has a specific domain.

### Element Kinds to Define

Define element kinds at the right level of abstraction for the system:

| System Type | Typical Element Kinds |
|-------------|----------------------|
| SaaS product | actor, system, service, ui, database, queue, external |
| Microservices | actor, gateway, service, worker, store, cache, bus |
| Monolith | actor, system, module, layer, database |
| CLI tool | user, tool, plugin, config, output |
| Data pipeline | source, processor, sink, storage, scheduler |

Each element kind should have:
- `notation` — human-readable label (shows on diagrams)
- `style { shape ... }` — visual shape from the available set
- `style { color ... }` — semantic color from the built-in palette

### Color Strategy

Use built-in LikeC4 colors semantically:
- `primary` — your system's core elements
- `secondary` — internal supporting elements
- `muted` — external systems, third parties, actors
- `amber` — warning, deprecated, or transitional elements
- `green` — success states, healthy components
- `red` — failed, broken, or risk-bearing components
- `blue` — infrastructure, data stores
- `gray` — disabled, out-of-scope elements

See `references/dsl-reference.md` for the full color reference.

---

## Model Block Design

The model is the single source of truth. Write it to be read — use real names, meaningful descriptions, and explicit technology annotations.

### Naming Conventions

- **Element IDs:** use snake_case, short but descriptive (`auth_service`, `user_db`, `email_queue`)
- **Element titles:** use proper nouns, capitalized (`'Auth Service'`, `'User Database'`, `'Email Queue'`)
- **Descriptions:** one sentence that answers "what does this DO?" not "what is this?"
  - Bad: `description 'The authentication service'`
  - Good: `description 'Issues JWTs, validates credentials, manages refresh token rotation'`

### Hierarchy Strategy

Use nesting to show containment:
- A `system` contains `service` and `database` elements
- A `service` contains its `component` modules
- An `actor` is never nested — actors are always top-level

Do not nest more than 3 levels deep. Deeply nested hierarchies are hard to visualize.

### Relationship Design

Relationships are first-class elements in LikeC4. Use them to communicate intent:

**Label relationships with the data or action being exchanged:**
- Bad: `ui -> api`
- Good: `ui -> api 'POST /auth/login {credentials}'`

**Use relationship kinds for non-default visual treatment:**
- Define `async` for event/queue relationships (dotted line)
- Define `depends_on` for infrastructure dependencies (dashed line)
- Default (solid line) for synchronous request/response

**Be explicit about direction:**
- `a -> b` means a calls b
- `a <- b` can be written as `b -> a` for clarity
- Bidirectional `a <-> b` should be rare — decompose if possible

---

## Views Block Design

Views are how the model is presented. A good view tells one story clearly.

### View Naming

Give views names that describe what they show, not the level:
- Bad: `view level1`, `view detail_view`
- Good: `view system_context`, `view auth_flow`, `view user_registration`

### Include/Exclude Strategy

Start with `include *` and then exclude what clutters the view:
- Exclude internal components from a landscape view
- Include external actors explicitly when they're essential to the story
- Use `include -> element ->` to show all relationships touching an element (useful for understanding dependencies)

### AutoLayout Selection

| Use Case | Layout |
|----------|--------|
| User → System → Database flow | `TopBottom` |
| Client ↔ Server ↔ Storage | `LeftRight` |
| Layers (UI / Backend / DB) | `TopBottom` |
| Hub-and-spoke | `TopBottom` or `LeftRight` |
| Timeline / sequence | use `dynamic view` instead |

### Dynamic Views

Use dynamic views for any "what happens when X?" question. Number the steps explicitly and use descriptive relationship labels:

```likec4
dynamic view checkout_flow {
  title 'Checkout Flow'
  customer -> cart 'adds item'
  cart -> inventory 'check availability'
  inventory -> cart 'item available'
  cart -> payment 'process payment'
  payment -> order 'create order record'
  order -> notification 'send confirmation email'
}
```

---

## Generation Process (Do This In Order)

### Step 1: Research the codebase
- Glob for entry points, config files, service directories
- Read key files to understand tech stack and domain
- Identify actors, systems, services, databases, queues

### Step 2: Design the specification
- List the element kinds you'll need
- Assign shapes and colors semantically
- Define relationship kinds if non-default relationships are needed

### Step 3: Draft the model
- Start with top-level actors and systems
- Add containers/services inside systems
- Add relationships between elements with descriptive labels
- Use `technology` annotations for tech stack visibility

### Step 4: Design the views
- Start with one landscape/context view (`include *`)
- Add a container/detail view for the main system
- Add dynamic views for important flows
- Apply `autoLayout` and per-view styling where needed

### Step 5: Validate syntax
```bash
npx likec4 validate
```
Fix all errors before proceeding.

### Step 6: Visual validation (if CLI available)
```bash
npx likec4 export png --output workspaces/{feature}/
```
Read the PNG to verify the diagram communicates correctly. If elements are missing or relationships are unclear, revise the model.

### Step 7: Quality check
Run the quality checklist below before reporting done.

---

## Large / Comprehensive Model Strategy

For systems with many components, build the model incrementally:

**Pass 1:** Write the specification block + top-level elements only (actors, systems). Validate.

**Pass 2:** Add internal elements to each system (services, databases). Validate.

**Pass 3:** Add all relationships. Validate.

**Pass 4:** Write views (start with `include *` on each, then refine). Validate.

**Pass 5:** Add per-view styling, dynamic views, and layout adjustments.

This produces fewer syntax errors than writing everything at once, and makes debugging easier.

---

## Pattern Library

See `references/patterns.md` for complete working examples of:
- Monolith with modules
- Microservices with API Gateway
- Event-driven / Message Queue architecture
- Layered (presentation / business / data)
- Client-Server
- CQRS / Event Sourcing

Use these as starting points, not copy-paste templates — adapt element names, descriptions, and relationships to match the actual system.

---

## Styling Guide

### Per-View Styling

Override element colors in specific views without changing the model:

```likec4
view system_context {
  include *
  // Mute less important elements
  style cloud_storage { color muted }
  // Highlight the focus element
  style auth_service { color primary }
}
```

### Icon Annotations

Use `icon tech:{technology}` to add technology icons:
- `icon tech:nodejs` — Node.js
- `icon tech:react` — React
- `icon tech:postgresql` — PostgreSQL
- `icon tech:redis` — Redis
- `icon tech:docker` — Docker
- `icon tech:kubernetes` — Kubernetes
- `icon tech:kafka` — Apache Kafka
- `icon tech:aws` — Amazon Web Services
- `icon tech:gcp` — Google Cloud Platform

Icons appear in rendered views as small logos on elements. Use them to distinguish technology choices visually.

### Shape Selection Reference

| Shape | When to Use |
|-------|-------------|
| `person` | Human actors, users, administrators |
| `rectangle` | Systems, services, generic components |
| `storage` | Databases, file systems, object stores |
| `queue` | Message queues, event buses, streams |
| `browser` | Frontend web applications, SPAs |
| `mobile` | Mobile applications |
| `cylinder` | Relational databases (alternative to storage) |

---

## Quality Checklist

### Model Quality
- [ ] Every element has a meaningful `description` (not just a restatement of its name)
- [ ] Every element has a `technology` annotation (for services, databases, queues)
- [ ] Relationships have descriptive labels (not blank arrows)
- [ ] No orphaned elements (every element connects to at least one other)
- [ ] Actor elements are at the top level (not nested inside systems)
- [ ] Nesting depth <= 3 levels

### View Quality
- [ ] At least one landscape/context view (`include *` at system level)
- [ ] At least one detail view (container/component level for the main system)
- [ ] Dynamic view for any important workflow (if applicable)
- [ ] View titles are descriptive ("System Landscape" not "view1")
- [ ] `autoLayout` is set on every view
- [ ] Per-view styling used where it clarifies (not decorates)

### DSL Validity
- [ ] `npx likec4 validate` passes with 0 errors
- [ ] All referenced element IDs exist in the model
- [ ] No duplicate element IDs within the same scope
- [ ] All relationship kinds used in `model` are declared in `specification`

### Architecture Communication
- [ ] Diagram passes the Decision Test: why is it structured this way?
- [ ] Diagram passes the Audience Test: a new engineer could understand the intent
- [ ] Relationships communicate the nature of the exchange (not just "calls")
- [ ] Boundaries are explicit and meaningful (system/service groupings)
- [ ] External dependencies are clearly distinguished from internal elements

---

## Output Files

The skill produces:
- `workspaces/{feature}/diagram.c4` — the LikeC4 DSL source (primary output)
- `workspaces/{feature}/05-diagram.md` — summary of design decisions
- `workspaces/{feature}/diagram_*.png` — exported PNGs (if CLI export succeeded)

The `.c4` file is the authoritative output. It is readable, diffable, and can be re-rendered at any time.

---

## Obsidian Output Mode

When `logs-mode: obsidian` is active (resolved from `~/.claude/.team-harness.json`), the diagrammer agent follows this extended contract so the diagrams display INLINE in Obsidian. Local mode behavior is unchanged.

### What the agent does in obsidian mode

1. **Render:** After validating `diagram.c4`, export PNG views into the vault workspace folder (`docs_root`):
   ```bash
   npx likec4 export png -o "{docs_root}"
   ```
   The `-o` flag is a **directory**. LikeC4 writes one `diagram_<viewId>.png` per view. PNG is LikeC4's documented export format; the export requires Playwright (LikeC4 installs it automatically via `npx`).

2. **Embed:** After the PNG files are written, glob `{docs_root}/diagram_*.png` and append one embed per PNG to `{docs_root}/05-diagram.md`:
   ```markdown
   ## Rendered Diagrams
   ![[diagram_<viewId>.png]]
   ```
   One line per exported view. Obsidian renders each `![[...png]]` inline when the note is opened.

3. **Output:** Both `diagram.c4` (source, re-editable) and `diagram_*.png` (vault-visible images) are written to `docs_root`. The `.c4` source is kept alongside for re-editing.

### CLI-absent degradation

When `npx likec4` is not available (Node.js not installed, network unavailable), the agent does NOT hard-fail. Instead it writes the source (`diagram.c4`) and appends this marker to `05-diagram.md`:

```markdown
## Rendered Diagrams
> Images not rendered — `npx likec4` is not available. Install Node.js and re-run to embed the diagrams.
> Source: `diagram.c4`
```

Status remains `success` (source produced); the status block adds `render: skipped`.

To install LikeC4:
```bash
npm install -g likec4
# or use npx (no install required)
npx likec4 validate
```

---

## CLI Reference

```bash
# Validate model (always run before reporting done)
npx likec4 validate

# Start development preview server
npx likec4 start

# Export all views to PNG
npx likec4 export png --output ./output/

# Export all views to SVG
npx likec4 export svg --output ./output/

# Build static site
npx likec4 build --output ./dist/
```

If `npx likec4` is not available, document the diagram path and instruct the user to install:
```bash
npm install -g likec4
# or use npx (no install required)
npx likec4 validate
```

---

## Best Practices

1. **One file per system boundary.** If the architecture spans multiple teams or repos, consider splitting the `.c4` model into multiple files (LikeC4 supports multi-file models).

2. **Commit the `.c4` file.** Unlike PNG exports, the DSL source is version-controlled and reviewable in PRs.

3. **Views are cheap, make more.** Each view in a LikeC4 model adds a new perspective. A good architecture model has 4-8 views covering different audiences and questions.

4. **Avoid the "complete system" trap.** Not everything needs to be in the model. Include elements that are relevant to the questions the diagram is answering. A 200-element diagram communicates less than a 20-element diagram focused on one concern.

5. **Review relationships more than elements.** It is easy to add boxes. It is hard to get the relationships right. Spend more time on relationship labels and kinds than on element styling.

6. **Use tags for filtering.** If some elements are deprecated, experimental, or belong to a specific domain, tag them. Views can filter by tag, enabling audience-specific views from one model.
