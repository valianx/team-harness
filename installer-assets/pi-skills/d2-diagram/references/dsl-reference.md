# D2 DSL Reference

Quick reference for all D2 syntax. Use during generation — no need to memorize.

---

## File Structure

A D2 file is a flat or nested graph. There are no mandatory wrapper blocks — you write nodes, connections, and containers directly.

```d2
# Comment
direction: right

node_a: "Label for A"
node_b: "Label for B"
node_a -> node_b: "connection label"
```

---

## Nodes (Shapes)

### Basic declaration

```d2
# ID only — ID is also the label
server

# ID with label
server: "App Server"

# ID with label and shape
db: "User DB" {
  shape: cylinder
}
```

### All available shapes

| Shape keyword       | Visual appearance                  | Typical use |
|---------------------|------------------------------------|-------------|
| `rectangle`         | Box (default if not specified)     | Services, components, systems |
| `square`            | Equal-sides box                    | Icons, grid cells |
| `page`              | Rectangle with folded corner       | Documents, pages, files |
| `parallelogram`     | Slanted box                        | Data, data stores |
| `document`          | Wavy-bottom rectangle              | Reports, outputs |
| `cylinder`          | Database cylinder                  | Relational DBs |
| `queue`             | Queue / pipe shape                 | Message queues, buffers |
| `package`           | Box with label tab at top          | Packages, modules, libraries |
| `step`              | Rounded-corner step shape          | Steps in a process |
| `callout`           | Speech bubble                      | Annotations, notes |
| `stored_data`       | Banked cylinder (like a barrel)    | Files, data at rest |
| `person`            | Stick figure                       | Actors, users |
| `diamond`           | Diamond shape                      | Decisions, branching |
| `oval`              | Ellipse                            | Start/end terminals |
| `circle`            | Circle                             | States, nodes |
| `hexagon`           | Hexagon                            | External systems |
| `cloud`             | Cloud shape                        | Cloud services, infrastructure |
| `sql_table`         | SQL column table (special — see ER section) | Database tables |
| `class`             | UML class box (special — see Class section) | OOP classes |
| `sequence_diagram`  | Sequence diagram container (special — see Sequence section) | Sequence flows |

Apply shape with:
```d2
my_node: "My Node" {
  shape: cylinder
}
# or shorthand:
my_node.shape: cylinder
```

---

## Connections (Edges)

### Arrow types

| Syntax | Meaning |
|--------|---------|
| `a -> b` | Directed (a to b) |
| `a <- b` | Directed (b to a) |
| `a <-> b` | Bidirectional |
| `a -- b` | Undirected |
| `a --> b` | Long arrow (same as ->) |

### Connection labels

```d2
a -> b: "HTTP POST /orders"
a -> b: "returns response" {
  style.stroke-dash: 5
}
```

### Arrowhead types

Set on the source side (`.source-arrowhead`) or target side (`.target-arrowhead`):

```d2
a -> b: "call" {
  target-arrowhead: {
    shape: arrow
    style.filled: true
  }
}
```

Available arrowhead shapes:
- `triangle` (default)
- `arrow` (pointier triangle)
- `diamond` (`style.filled: true` for solid diamond)
- `circle` (`style.filled: true` for solid circle)
- `box` (`style.filled: true` for solid box)
- `cf-one`, `cf-one-required` (crow's foot ER notation)
- `cf-many`, `cf-many-required` (crow's foot ER notation)
- `cross`

### Multiple connections on one line

```d2
a -> b -> c -> d
```

### Connections between nested elements

```d2
gateway.auth -> backend.user_service: "validate token"
```

---

## Containers (Nesting)

Group related nodes by wrapping them in a block. Containers get a border automatically.

```d2
backend: "Backend Services" {
  api: "REST API"
  worker: "Background Worker"
  cache: "Redis Cache" {
    shape: cylinder
  }
}
```

Nest up to 3 levels deep for readability. Deeper nesting becomes hard to render.

### Referring to nested elements from outside

```d2
frontend -> backend.api: "HTTPS calls"
```

---

## Styles

Apply via `.style` block or dot notation:

```d2
# Block style
server: "App Server" {
  style: {
    fill: "#dae8fc"
    stroke: "#6c8ebf"
    font-color: "#1a1a2e"
    border-radius: 6
    font-size: 14
    bold: true
    italic: false
    stroke-dash: 0
    stroke-width: 2
    opacity: 1
    shadow: false
    multiple: false
  }
}

# Dot notation (for single properties)
server.style.fill: "#dae8fc"
server.style.border-radius: 6
```

### All style properties

| Property | Values | Notes |
|----------|--------|-------|
| `fill` | Hex color, CSS color name | Background fill |
| `stroke` | Hex color, CSS color name | Border color |
| `font-color` | Hex color, CSS color name | Text color |
| `font-size` | Integer (px) | Default ~14 |
| `font` | Font name string | Rarely needed |
| `bold` | `true` / `false` | Bold label |
| `italic` | `true` / `false` | Italic label |
| `underline` | `true` / `false` | Underlined label |
| `stroke-width` | Integer (px) | Border thickness |
| `stroke-dash` | Integer (0=solid, 5=dashed) | 0 = solid |
| `border-radius` | Integer 0–20 | Rounded corners |
| `opacity` | Float 0.0–1.0 | Transparency |
| `shadow` | `true` / `false` | Drop shadow |
| `multiple` | `true` / `false` | Stack effect (multiple copies) |
| `3d` | `true` / `false` | 3D box effect |
| `filled` | `true` / `false` | For arrowheads |
| `text-transform` | `uppercase` / `lowercase` / `none` | Label transform |

### Connection-specific styles

```d2
a -> b: "async call" {
  style: {
    stroke-dash: 5
    stroke: "#aaaaaa"
    animated: true
  }
}
```

`animated: true` makes the connection animate in SVG output.

---

## Direction

Set at the top level or per container (TALA layout engine supports per-container):

```d2
direction: right   # left-to-right flow (default for most flowcharts)
direction: down    # top-to-bottom (default for architecture, ER)
direction: left
direction: up
```

Per-container direction (TALA only):
```d2
vars: {
  d2-config: {
    layout-engine: tala
  }
}

direction: down

backend: {
  direction: right
  api -> service -> db
}
```

---

## Layout Engines

| Engine | Flag | Best for |
|--------|------|---------|
| `dagre` | `--layout dagre` (default) | General graphs, most diagrams |
| `elk` | `--layout elk` | Dense graphs, better edge routing |
| `tala` | `--layout tala` | Complex hierarchies, per-container direction |

Declare in file:
```d2
vars: {
  d2-config: {
    layout-engine: elk
  }
}
```

Or via CLI flag: `d2 --layout elk input.d2 output.svg`

---

## Themes

| Theme | ID | Style |
|-------|----|-------|
| Default | 0 | Clean, light |
| Neutral Default | 1 | Neutral gray |
| Flagship Terrastruct | 3 | Brand colors |
| Cool Classics | 4 | Cool blues |
| Mixed Berry Blue | 5 | Mixed blues |
| Grape Soda | 6 | Purples |
| Aubergine | 7 | Dark purples |
| Colorblind Clear | 8 | Accessible |
| Vanilla Nitro Cola | 100 | Dark theme |
| Orange Creamsicle | 101 | Warm |
| Shirley Temple | 102 | Pinks |
| Earth Tones | 200 | Earth/browns |
| Everglade Green | 201 | Greens |
| Buttered Toast | 202 | Warm yellows |
| Dark Mauve | 300 | Terminal/dark |
| Midnight Terrastruct | 301 | Dark brand |

Apply via CLI: `d2 --theme 200 input.d2 output.svg`

Or declare in file:
```d2
vars: {
  d2-config: {
    theme-id: 200
  }
}
```

Sketch mode (hand-drawn look): `d2 --sketch input.d2 output.svg`

---

## Classes (Reusable Styles)

Define a `classes` block at the top level to create named style presets:

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
}

auth_service.class: service
user_db.class: database
stripe.class: external
```

Classes reduce repetition. Define once, apply everywhere.

---

## Icons

Add icon URLs to nodes:

```d2
frontend: "Web App" {
  icon: https://icons.terrastruct.com/dev%2Freact.svg
}
```

Common Terrastruct icon URLs:
```
# Dev icons (encoded slashes)
https://icons.terrastruct.com/dev%2Freact.svg
https://icons.terrastruct.com/dev%2Fnodejs.svg
https://icons.terrastruct.com/dev%2Fpython.svg
https://icons.terrastruct.com/dev%2Fgo.svg
https://icons.terrastruct.com/dev%2Fjava.svg
https://icons.terrastruct.com/dev%2Ftypescript.svg
https://icons.terrastruct.com/dev%2Fpostgresql.svg
https://icons.terrastruct.com/dev%2Fmysql.svg
https://icons.terrastruct.com/dev%2Fmongodb.svg
https://icons.terrastruct.com/dev%2Fredis.svg
https://icons.terrastruct.com/dev%2Fdocker.svg
https://icons.terrastruct.com/dev%2Fkubernetes.svg
https://icons.terrastruct.com/dev%2Fgithub.svg

# AWS icons
https://icons.terrastruct.com/aws%2F_General%2FAWS.svg
https://icons.terrastruct.com/aws%2FDatabase%2FAmazon-DynamoDB.svg
https://icons.terrastruct.com/aws%2FCompute%2FAmazon-EC2.svg
https://icons.terrastruct.com/aws%2FNetworking%2FAmazon-API-Gateway.svg
https://icons.terrastruct.com/aws%2FStorage%2FAmazon-S3.svg
https://icons.terrastruct.com/aws%2FMessaging%2FAmazon-SNS.svg
https://icons.terrastruct.com/aws%2FMessaging%2FAmazon-SQS.svg

# GCP icons
https://icons.terrastruct.com/gcp%2FProducts%20and%20services%2FCompute%2FCompute-Engine.svg
https://icons.terrastruct.com/gcp%2FProducts%20and%20services%2FStorage%2FCloud-Storage.svg
```

Icons render inside the shape. Use them to distinguish technology choices visually — prefer icons over text annotations for well-known technologies.

---

## Sequence Diagrams

Set `shape: sequence_diagram` on a container (or at top level):

```d2
shape: sequence_diagram

# Declare actors (optional — implicit if not declared)
client: "Client"
server: "API Server" {
  shape: rectangle
}
db: "Database" {
  shape: cylinder
}

# Messages
client -> server: "POST /login"
server -> db: "SELECT user WHERE email = ?"
db -> server: "user record"
server -> client: "200 OK + JWT"
```

### Activation boxes

```d2
shape: sequence_diagram

client.t -> server.t: "request"
server.t -> db.t: "query"
db.t -> server.t: "result"
server.t -> client.t: "response"
```

The `.t` suffix creates an activation box (highlights the lifeline while active).

### Groups / frames

```d2
shape: sequence_diagram

alice -> bob: "hello"
group: {
  alice -> bob: "step 1"
  bob -> alice: "step 2"
}
```

### Nested sequence diagrams

```d2
direction: right

system_a: "System A — Login" {
  shape: sequence_diagram
  client -> api: "POST /auth"
  api -> db: "verify"
  db -> api: "ok"
  api -> client: "JWT"
}

system_b: "System B — Checkout" {
  shape: sequence_diagram
  user -> cart: "confirm"
  cart -> payment: "charge"
  payment -> cart: "receipt"
}

system_a -> system_b: "after login"
```

---

## ER Diagrams (SQL Tables)

Use `shape: sql_table` and define columns with types and optional constraints:

```d2
users: {
  shape: sql_table
  id: int {constraint: primary_key}
  email: varchar {constraint: unique}
  created_at: timestamp
}

orders: {
  shape: sql_table
  id: int {constraint: primary_key}
  user_id: int {constraint: foreign_key}
  amount: decimal
  status: varchar
}

# Connections with crow's foot notation
users.id -> orders.user_id: "" {
  target-arrowhead: {
    shape: cf-many
  }
  source-arrowhead: {
    shape: cf-one-required
  }
}
```

Column constraint values: `primary_key`, `foreign_key`, `unique`, `not_null`

Nest tables in containers to group by schema:
```d2
public_schema: "public" {
  users: {
    shape: sql_table
    id: int {constraint: primary_key}
  }
  posts: {
    shape: sql_table
    id: int {constraint: primary_key}
    author_id: int {constraint: foreign_key}
  }
  users.id -> posts.author_id
}
```

---

## Class Diagrams

Use `shape: class` and define members (fields and methods):

```d2
UserService: {
  shape: class
  # Fields
  -db: Database
  -cache: Cache
  # Methods
  +getUser(id: string): User
  +createUser(dto: CreateUserDto): User
  -hashPassword(plain: string): string
}

User: {
  shape: class
  +id: string
  +email: string
  +createdAt: Date
}

UserService -> User: "manages"
```

Visibility prefixes: `+` public, `-` private, `#` protected, `~` package-private

---

## Grid Diagrams

Create grid layouts with `grid-rows` or `grid-columns`:

```d2
architecture: {
  grid-columns: 3

  frontend: "Frontend"
  api: "API"
  worker: "Worker"
  postgres: "PostgreSQL" {shape: cylinder}
  redis: "Redis" {shape: cylinder}
  kafka: "Kafka" {shape: queue}
}
```

Style grid cells uniformly using classes.

---

## Variables and Configuration

```d2
vars: {
  d2-config: {
    layout-engine: elk
    theme-id: 4
    sketch: false
  }
}
```

---

## Markdown Labels

Labels support multi-line text using `\n` or backtick blocks:

```d2
node: "Line one\nLine two"

long_node: |md
  # Header
  Some **bold** text
  - item 1
  - item 2
|
```

---

## Comments

```d2
# This is a comment
```

---

## Common Syntax Rules (Never Violate)

1. **No trailing commas** inside `style {}` blocks
2. **Shape values are unquoted keywords**: `.shape: cylinder` not `.shape: "cylinder"`
3. **String labels must be quoted** if they contain spaces or special chars: `a -> b: "my label"`
4. **Every `{}` block must be closed**
5. **Connections from nested elements** use dot notation: `container.node -> other.node`
6. **Classes are declared at top level**, never inside containers
7. **`direction:` is a top-level statement** (or per-container in TALA)
8. **`shape: sequence_diagram`** must appear before actor/message declarations
9. **`vars: { d2-config: {...} }`** must appear at top level

---

## CLI Reference

```bash
# Basic render to SVG
d2 input.d2 output.svg

# Render to PNG
d2 input.d2 output.png

# With layout engine
d2 --layout elk input.d2 output.svg

# With theme
d2 --theme 200 input.d2 output.svg

# Sketch/hand-drawn style
d2 --sketch input.d2 output.svg

# Dark theme
d2 --theme 300 input.d2 output.svg

# Combine flags
d2 --layout elk --theme 4 --sketch input.d2 output.svg

# Watch mode (live reload)
d2 --watch input.d2 output.svg

# Format/pretty-print a .d2 file (validates syntax too)
d2 fmt input.d2

# Check version
d2 --version
```

---

## Install Commands

```bash
# macOS / Linux
curl -fsSL https://d2lang.com/install.sh | sh -s --

# Windows (winget)
winget install terrastruct.d2

# npm (cross-platform)
npm i -g @aspect-dev/d2
```
