---
name: d2-diagram
description: Generate diagrams using the D2 declarative diagram language. Use when the user wants to create architecture diagrams, sequence diagrams, ER diagrams, class diagrams, flowcharts, or any technical diagram as code. Produces .d2 source files with optional SVG/PNG export via the d2 CLI. Does not replace Excalidraw (use for freeform visuals) or LikeC4 (use for multi-view architecture-as-code).
---

# D2 Diagram Creator

Generate `.d2` diagram files using the D2 declarative language that **communicate structure, flow, and relationships** — not just label boxes.

---

## Core Philosophy

**Diagrams should argue, not inventory.**

A diagram is not a formatted list of components. It is a visual statement — it shows what belongs together, how data flows, and which boundaries matter. The shape of the diagram should BE the argument.

**The Communication Test**: Could someone unfamiliar with the system understand what this diagram is saying in 30 seconds? If not, there are too many nodes, too few labels, or the wrong diagram type was chosen.

D2 is diagram-as-code. Treat it with the same care as production code: real names, real labels, real structure. It lives in version control, renders deterministically, and can be revised alongside the code it documents.

---

## Diagram Type Selection (Do This First)

Before writing a single line of D2, identify the right diagram type:

| User says... | Diagram type | D2 approach |
|---|---|---|
| "flow", "routing", "process", "pipeline" | Flowchart | `direction: down`, diamond shapes for decisions |
| "sequence", "request flows through", "calls", "interaction" | Sequence diagram | `shape: sequence_diagram` |
| "architecture", "system", "services", "components" | Architecture | Containers, class definitions, directional layout |
| "ER", "schema", "database", "tables", "model" | ER diagram | `shape: sql_table`, crow's foot arrowheads |
| "class", "hierarchy", "extends", "implements" | Class diagram | `shape: class` |
| "layers", "clean arch", "hexagonal" | Layered architecture | Nested containers per layer |
| Topic without description | Architecture (default) | Research codebase first |

**Default when ambiguous: architecture diagram.**

---

## Research Mandate

**Before writing a single node, analyze the codebase.**

Use Glob, Grep, and Read to discover:
1. **Entry points** — what are the top-level services, apps, or APIs?
2. **Communication patterns** — HTTP, gRPC, message queues, shared databases?
3. **External dependencies** — third-party APIs, cloud services, auth providers?
4. **Data stores** — databases, caches, file storage?
5. **Boundaries** — what belongs to "this system" vs external actors?
6. **Technology stack** — languages, frameworks, runtimes?

Use these findings to give every node a real name, a real label, and a real shape. The goal is accuracy — the diagram should match the codebase.

**Bad:** `api -> db`
**Good:** `order_svc -> order_db: "SELECT orders WHERE user_id = ?" { }`

---

## Naming Conventions

- **Node IDs:** snake_case, short but descriptive — `auth_service`, `user_db`, `kafka_bus`
- **Labels:** readable strings with spaces — `"Auth Service"`, `"User DB"`, `"Kafka Event Bus"`
- **IDs are the source of truth** — labels are display only
- **Container IDs:** match the logical boundary — `backend`, `cloud_platform`, `data_layer`

---

## Shape Selection

| Role | D2 shape |
|---|---|
| Process / service / component | `rectangle` (default) |
| Decision / branch | `diamond` |
| Database (SQL, NoSQL) | `cylinder` |
| Cache (Redis, Memcached) | `cylinder` |
| Message queue / topic | `queue` |
| Start / end / terminal | `oval` |
| External system / provider | `hexagon` |
| Actor / user | `person` |
| Document / report | `page` or `document` |
| Cloud service | `cloud` |
| File / data at rest | `stored_data` |
| Database table (ER) | `sql_table` |
| OOP class | `class` |
| Sequence flow | `sequence_diagram` |

---

## Color Palette

Define classes at the top level for consistent, semantic coloring:

```d2
classes: {
  service: {
    style: {
      fill: "#dae8fc"
      stroke: "#6c8ebf"
      border-radius: 4
    }
  }
  database: {
    shape: cylinder
    style: {
      fill: "#fff2cc"
      stroke: "#d6b656"
    }
  }
  external: {
    style: {
      fill: "#f8cecc"
      stroke: "#b85450"
    }
  }
  queue_shape: {
    shape: queue
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
  entry_point: {
    style: {
      fill: "#d5e8d4"
      stroke: "#82b366"
      bold: true
    }
  }
  decision: {
    shape: diamond
    style: {
      fill: "#fff2cc"
      stroke: "#d6b656"
    }
  }
  terminal: {
    shape: oval
    style: {
      fill: "#d5e8d4"
      stroke: "#82b366"
    }
  }
}
```

**Semantic color rules:**
- Entry points / triggers: `"#d5e8d4"` (light green)
- Core processing / services: `"#dae8fc"` (light blue)
- Storage (DB, cache): `"#fff2cc"` (light yellow)
- External systems / providers: `"#f8cecc"` (light red/pink)
- Infrastructure (queues, buses): `"#e1d5e7"` (light purple)
- Actors / users: `"#e1d5e7"` (light purple) with `shape: person`

Use classes consistently — define once, apply with `.class: name`.

---

## Connection Design

Connections communicate intent. Label them with what is being exchanged or requested:

```d2
# Sync HTTP call
client -> api: "POST /orders {cart_id}"

# Async event (dashed)
order_svc -> event_bus: "OrderPlaced" {
  style.stroke-dash: 5
}

# Dependency (dashed, gray)
worker -> config: "reads at startup" {
  style.stroke-dash: 3
  style.stroke: "#aaaaaa"
}

# Bidirectional (use sparingly — decompose if possible)
service_a <-> service_b: "gRPC streaming"

# Animated (for async/streaming in SVG)
event_bus -> consumer: "stream" {
  style.stroke-dash: 5
  style.animated: true
}
```

**Rules:**
- Always label connections (never blank arrows)
- Use `style.stroke-dash: 5` for async/event connections
- Use `style.stroke-dash: 3` for weak dependencies or config reads
- Reserve `<->` for genuine bidirectional protocols (gRPC streaming, WebSockets)

---

## Container Design

Containers group related components and create visual boundaries:

```d2
backend: "Backend Platform" {
  style: {
    fill: "#f9f9f9"
    stroke: "#cccccc"
    border-radius: 8
  }

  api: "REST API" {class: service}
  auth: "Auth Service" {class: service}
  worker: "Background Worker" {class: service}
}

# Reference from outside
client -> backend.api: "HTTPS requests"
```

**Nesting rules:**
- Use containers for logical boundaries (services within a platform, tables within a schema)
- Nest up to 3 levels deep — deeper becomes hard to render
- Always style containers with a subtle fill + border to distinguish them from nodes
- Use `border-radius: 8` on containers for a softer look

---

## Generation Process (Follow This Order)

### Step 1: Research the codebase

Use Glob, Grep, and Read to identify what exists:
- Entry points, routing files, main handlers
- Service/module boundaries
- Data stores and their types
- External API integrations
- Technology stack (languages, frameworks)

### Step 2: Select diagram type and pattern

Match to the closest pattern in `references/patterns.md`. Read the pattern, adapt names and connections to match the actual system.

### Step 3: Write the header

```d2
# {Diagram title}
# Generated: {date}
# Type: {architecture|sequence|ER|class|flowchart}

direction: {right|down}
```

### Step 4: Define classes

Write the `classes` block using the semantic color palette. This reduces repetition across nodes.

### Step 5: Declare actors and top-level nodes

Start with actors (users, external systems) and top-level containers. Always assign shapes and classes at this stage.

### Step 6: Add internal nodes to containers

Populate containers with their internal services, components, or modules.

### Step 7: Add all connections

Write connections with labels. Start with external → entry points, then trace the data flow inward. Use dashed style for async/event connections.

### Step 8: Format and validate

```bash
d2 fmt diagram.d2
```

`d2 fmt` validates syntax AND pretty-prints the file. Run it after every significant change.

### Step 9: Compile to SVG

```bash
d2 diagram.d2 diagram.svg
```

Read the error output if compilation fails — D2 errors point to exact line numbers. Fix and retry. Max 3 attempts.

### Step 10: Quality check

Run the quality checklist before reporting done.

---

## Sequence Diagrams — Special Rules

Use `shape: sequence_diagram` at the top level or on a container:

```d2
shape: sequence_diagram

client: "Client"
api: "API"
db: "DB" {shape: cylinder}

client -> api: "POST /auth/login"
api -> db: "SELECT user WHERE email = ?"
db -> api: "user record"
api -> client: "200 OK + JWT"
```

Rules for sequence diagrams:
- Declare actors explicitly before messages (prevents ordering surprises)
- Use real HTTP verbs and paths for API calls
- Use real function names for internal service calls
- Keep under 15 messages — beyond that, split into multiple diagrams
- Add `.t` suffix for activation boxes when showing concurrent processing: `api.t -> db.t: "query"`

---

## ER Diagrams — Special Rules

```d2
users: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  email: varchar {constraint: unique}
}

orders: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  user_id: uuid {constraint: foreign_key}
}

users.id -> orders.user_id: "" {
  source-arrowhead: {shape: cf-one-required}
  target-arrowhead: {shape: cf-many}
}
```

Rules for ER diagrams:
- Use actual column names and types from the schema
- Apply `primary_key`, `foreign_key`, `unique`, `not_null` constraints where appropriate
- Use crow's foot arrowheads for cardinality: `cf-one`, `cf-one-required`, `cf-many`, `cf-many-required`
- Group tables by schema using containers: `public_schema: { ... }`

---

## Class Diagrams — Special Rules

```d2
UserService: {
  shape: class
  -db: Database
  +getUser(id: string): User
  +createUser(dto: CreateUserDto): User
}

User: {
  shape: class
  +id: string
  +email: string
}

UserService -> User: "manages"
```

Rules for class diagrams:
- Use visibility prefixes: `+` public, `-` private, `#` protected
- Use actual method signatures from the codebase
- Show inheritance with `->` and label `"extends"` or `"implements"`

---

## Large Diagram Strategy

For systems with many components, build incrementally:

**Pass 1:** Write classes block + top-level actors and entry points only. Run `d2 fmt` and `d2 compile`.

**Pass 2:** Add containers and their internal nodes. Validate.

**Pass 3:** Add all connections. Validate.

**Pass 4:** Add styles, classes, icons. Validate.

This produces fewer syntax errors than writing everything at once and makes debugging easier. D2 errors point to exact lines — fix them before continuing.

---

## Quality Checklist

### Content Quality
- [ ] Every node has a meaningful label (not just its ID restated)
- [ ] Every connection has a descriptive label (no blank arrows)
- [ ] Actors and external systems are visually distinct from internal services (different shape or color)
- [ ] Async/event connections use dashed style (`stroke-dash: 5`)
- [ ] No orphaned nodes (every node connects to at least one other)
- [ ] Nesting depth is 3 levels or fewer
- [ ] The diagram has 4 or more nodes (too few = not enough context)

### D2 Syntax Validity
- [ ] `d2 fmt diagram.d2` runs without error
- [ ] `d2 diagram.d2 output.svg` compiles successfully
- [ ] Shape values are unquoted keywords (`.shape: cylinder` not `.shape: "cylinder"`)
- [ ] All `{}` blocks are closed
- [ ] No trailing commas inside style blocks
- [ ] `classes` block is at the top level (never inside a container)
- [ ] `direction:` is declared at the top level

### Architecture Communication
- [ ] Diagram passes the Communication Test (understood in 30 seconds)
- [ ] External systems / providers are clearly distinguished from internal components
- [ ] Data flows are directional (arrows show who initiates)
- [ ] Logical boundaries (containers) group related things meaningfully
- [ ] The diagram type matches what was requested (no sequence diagram when architecture was asked for)

---

## Output Files

The skill produces:
- `workspaces/{feature}/diagram.d2` — the D2 source (primary output, version-controllable)
- `workspaces/{feature}/diagram.svg` — compiled SVG (or PNG if requested)
- `workspaces/{feature}/05-diagram.md` — design decision summary

The `.d2` file is the authoritative output. It is readable, diffable, and can be re-rendered with different themes or layouts at any time.

---

## Obsidian Output Mode

When `logs-mode: obsidian` is active (resolved from `~/.claude/.team-harness.json`), the diagrammer agent follows this extended contract so the diagram displays INLINE in Obsidian. Local mode behavior is unchanged.

### What the agent does in obsidian mode

1. **Render:** After generating and formatting `diagram.d2`, compile an SVG into the vault workspace folder (`docs_root`):
   ```bash
   d2 "{docs_root}/diagram.d2" "{docs_root}/diagram.svg"
   ```
   SVG is D2's native default export — no extra dependency beyond the `d2` CLI.

2. **Embed:** Append the following block to `{docs_root}/05-diagram.md` so the diagram displays inline:
   ```markdown
   ## Rendered Diagram
   ![[diagram.svg]]
   ```

3. **Output:** Both `diagram.d2` (source, re-editable) and `diagram.svg` (vault-visible image) are written to `docs_root`. Obsidian renders `![[diagram.svg]]` inline when the note is opened.

### CLI-absent degradation

When the `d2` CLI is not installed, the agent does NOT hard-fail. Instead it writes the source (`diagram.d2`) and appends this marker to `05-diagram.md`:

```markdown
## Rendered Diagram
> Image not rendered — the `d2` CLI is not installed. Install it and re-run to embed the diagram.
> Source: `diagram.d2`
```

Status remains `success` (source produced); the status block adds `render: skipped`.

To install `d2`:
- macOS/Linux: `curl -fsSL https://d2lang.com/install.sh | sh -s --`
- Windows (winget): `winget install terrastruct.d2`

---

## CLI Reference

```bash
# Format/validate (always run first)
d2 fmt input.d2

# Render to SVG (default)
d2 input.d2 output.svg

# Render to PNG
d2 input.d2 output.png

# With ELK layout (better edge routing for dense graphs)
d2 --layout elk input.d2 output.svg

# With dark theme
d2 --theme 300 input.d2 output.svg

# Sketch / hand-drawn style
d2 --sketch input.d2 output.svg

# Watch mode (live reload during editing)
d2 --watch input.d2 output.svg

# Check version
d2 --version
```

If `d2` is not installed, provide exactly one of these install commands based on the OS:
- macOS/Linux: `curl -fsSL https://d2lang.com/install.sh | sh -s --`
- Windows (winget): `winget install terrastruct.d2`
- npm (cross-platform): `npm i -g @aspect-dev/d2`

Then report `status: blocked — d2 CLI not installed` and stop. Do NOT skip compilation.

---

## Compilation Error Protocol

If `d2 diagram.d2 output.svg` fails:

1. Read the error output — D2 errors include the line number and a description
2. Open `diagram.d2`, find the reported line, fix the issue
3. Re-run `d2 fmt diagram.d2` first, then re-compile
4. Max 3 fix attempts before reporting `status: failed` with the last error

Common errors and fixes:

| Error | Cause | Fix |
|---|---|---|
| `unexpected token` | Missing closing `}` or bad syntax | Check `{}` matching |
| `"shape" value is invalid` | Quoted shape keyword | Remove quotes: `.shape: cylinder` |
| `connection label must be quoted` | Label with spaces not quoted | Add quotes: `a -> b: "my label"` |
| `classes must be at the top level` | Classes block inside a container | Move to top of file |
| `invalid property` | Typo in style property name | Check dsl-reference.md |

---

## Best Practices

1. **One `.d2` file per concern.** If the architecture spans multiple views (system context + internal detail + sequence flow), consider separate files rather than cramming everything into one.

2. **Commit the `.d2` file.** Unlike SVG/PNG exports, the source is version-controlled and reviewable in PRs. The render is ephemeral; the source is the record.

3. **Prefer classes over repeated style blocks.** If more than 3 nodes share the same style, extract a class. It reduces errors and makes global style changes trivial.

4. **Use ELK for dense graphs.** The default Dagre layout works well for small-to-medium graphs. For complex architectures with many crossing edges, `--layout elk` routes edges more cleanly.

5. **Sketch mode for presentations.** `--sketch` produces a hand-drawn look that often feels less formal and is easier to discuss with non-technical stakeholders.

6. **Theme 0 for documentation, Theme 300 for dark terminals.** Match the rendering environment. Theme 0 (default) is cleanest for light-mode documentation. Theme 300 (Dark Mauve) is best for dark-mode environments.

7. **Avoid the completeness trap.** Not every service needs to be in the diagram. Include what is relevant to the question being answered. A focused 12-node diagram communicates more than a 60-node diagram of the entire system.
