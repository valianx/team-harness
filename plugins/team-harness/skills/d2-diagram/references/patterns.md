# Architecture Patterns — D2 Examples

Complete working `.d2` examples for common architecture patterns. Adapt node IDs, labels, and connections to match the actual system. These are starting points, not copy-paste templates.

---

## Pattern 1: Microservices with API Gateway

Use when: independently deployable services behind a single entry point, each with its own database.

```d2
# Microservices Architecture
# Type: architecture

direction: down

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
  gateway: {
    style: {
      fill: "#d5e8d4"
      stroke: "#82b366"
      font-color: "#1a1a2e"
      bold: true
    }
  }
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
}

# Actors
client: "Client App" {class: actor}
admin: "Admin" {class: actor}

# Entry point
platform: "Platform" {
  gateway: "API Gateway" {
    class: gateway
  }

  # Services
  user_svc: "User Service" {
    class: service
  }
  product_svc: "Product Service" {
    class: service
  }
  order_svc: "Order Service" {
    class: service
  }
  notification_svc: "Notification Service" {
    class: service
  }

  # Databases (one per service)
  user_db: "User DB" {class: database}
  product_db: "Product DB" {class: database}
  order_db: "Order DB" {class: database}
}

event_bus: "Event Bus (Kafka)" {
  shape: queue
  style: {
    fill: "#e1d5e7"
    stroke: "#9673a6"
  }
}

payment_provider: "Payment Provider (Stripe)" {class: external}

# External access
client -> platform.gateway: "HTTPS requests"
admin -> platform.gateway: "HTTPS + admin token"

# Gateway routing
platform.gateway -> platform.user_svc: "routes /users/*"
platform.gateway -> platform.product_svc: "routes /products/*"
platform.gateway -> platform.order_svc: "routes /orders/*"

# Service → DB
platform.user_svc -> platform.user_db
platform.product_svc -> platform.product_db
platform.order_svc -> platform.order_db

# Cross-service sync
platform.order_svc -> platform.product_svc: "GET /products/{id}/stock"
platform.order_svc -> payment_provider: "POST /v1/payment_intents"

# Async events
platform.order_svc -> event_bus: "OrderPlaced" {
  style.stroke-dash: 5
}
platform.user_svc -> event_bus: "UserRegistered" {
  style.stroke-dash: 5
}
event_bus -> platform.notification_svc: "delivers events" {
  style.stroke-dash: 5
}
```

---

## Pattern 2: Monolith with Modules

Use when: a single deployable unit contains multiple logical modules with clear internal boundaries.

```d2
# Monolith with Modules
# Type: architecture

direction: down

classes: {
  module: {
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
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
}

user: "User" {class: actor}

ecommerce: "E-Commerce Platform" {
  style: {
    fill: "#f5f5f5"
    stroke: "#666666"
    border-radius: 8
  }

  catalog: "Catalog" {class: module}
  cart: "Cart" {class: module}
  checkout: "Checkout" {class: module}
  accounts: "Accounts" {class: module}
  notifications: "Notifications" {class: module}
}

db: "Main DB (PostgreSQL)" {class: database}
cache: "Session Cache (Redis)" {class: database}
stripe: "Stripe" {class: external}

# User interactions
user -> ecommerce.accounts: "signs in"
user -> ecommerce.catalog: "browses products"
user -> ecommerce.cart: "adds items"
user -> ecommerce.checkout: "places order"

# Module → storage
ecommerce.catalog -> db: "reads products"
ecommerce.cart -> cache: "stores cart state"
ecommerce.checkout -> db: "writes orders"
ecommerce.accounts -> db: "reads/writes users"
ecommerce.notifications -> db: "reads order details"

# Inter-module
ecommerce.checkout -> stripe: "POST /v1/payment_intents"
ecommerce.checkout -> ecommerce.notifications: "triggers confirmation"
```

---

## Pattern 3: Event-Driven / Message Queue

Use when: services communicate via events and are temporally decoupled.

```d2
# Event-Driven Architecture
# Type: architecture

direction: right

classes: {
  producer: {
    style: {
      fill: "#d5e8d4"
      stroke: "#82b366"
      border-radius: 4
    }
  }
  consumer: {
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
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
}

operator: "Operator" {class: actor}
customer: "Customer" {class: actor}

# Producers
inventory_svc: "Inventory Service" {class: producer}
order_svc: "Order Service" {class: producer}

# Event bus
event_stream: "Event Stream (Kafka)" {
  shape: queue
  style: {
    fill: "#e1d5e7"
    stroke: "#9673a6"
    bold: true
  }
}

# Consumers
fulfillment_svc: "Fulfillment Service" {class: consumer}
billing_svc: "Billing Service" {class: consumer}
analytics_svc: "Analytics Service" {class: consumer}
notification_svc: "Notification Service" {class: consumer}

# Databases
inventory_db: "Inventory DB" {class: database}
order_db: "Order DB" {class: database}
analytics_db: "Analytics DB (ClickHouse)" {class: database}

# Inputs
operator -> inventory_svc: "updates stock"
customer -> order_svc: "places order"

# Producers → bus (dashed = async)
inventory_svc -> event_stream: "StockUpdated" {
  style.stroke-dash: 5
}
order_svc -> event_stream: "OrderPlaced, OrderCancelled" {
  style.stroke-dash: 5
}

# Bus → consumers (dashed = async)
event_stream -> fulfillment_svc: "OrderPlaced" {
  style.stroke-dash: 5
}
event_stream -> billing_svc: "OrderPlaced, OrderCancelled" {
  style.stroke-dash: 5
}
event_stream -> analytics_svc: "all events" {
  style.stroke-dash: 5
}
event_stream -> notification_svc: "OrderPlaced, OrderCancelled" {
  style.stroke-dash: 5
}

# Service → DB
inventory_svc -> inventory_db
order_svc -> order_db
analytics_svc -> analytics_db: "appends records"
```

---

## Pattern 4: Client-Server (3-Tier)

Use when: a browser/mobile client, a backend API, and a database form the full stack.

```d2
# Client-Server Architecture (3-Tier)
# Type: architecture

direction: right

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
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
  frontend: {
    shape: hexagon
    style: {
      fill: "#d5e8d4"
      stroke: "#82b366"
    }
  }
}

user: "User" {class: actor}

browser: "Web Client (React)" {class: frontend}
backend: "Backend API (Node.js + Express)" {class: service}
db: "Database (PostgreSQL)" {class: database}
redis: "Cache (Redis)" {class: database}

user -> browser: "opens browser"
browser -> backend: "HTTPS API calls"
backend -> db: "SQL reads/writes"
backend -> redis: "session / cache"
```

---

## Pattern 5: Layered Architecture (Clean / Hexagonal)

Use when: a system is organized into strict dependency layers — UI, API, Domain, Infrastructure.

```d2
# Layered Architecture
# Type: architecture

direction: down

classes: {
  layer: {
    style: {
      fill: "#f5f5f5"
      stroke: "#999999"
      border-radius: 6
    }
  }
  component: {
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
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
}

user: "User" {class: actor}

presentation: "Presentation Layer (React SPA)" {
  class: layer
  pages: "Pages" {class: component}
  components: "UI Components" {class: component}
  state: "State (Zustand)" {class: component}
}

api_layer: "API Layer (Express)" {
  class: layer
  routes: "Route Handlers" {class: component}
  middleware: "Middleware (JWT, rate-limit)" {class: component}
}

domain: "Domain Layer" {
  class: layer
  services: "Domain Services" {class: component}
  entities: "Domain Entities" {class: component}
  ports: "Ports (Interfaces)" {class: component}
}

infra: "Infrastructure Layer" {
  class: layer
  repo: "Repositories (Prisma)" {class: component}
  email_adapter: "Email Adapter (SendGrid)" {class: component}
  storage_adapter: "Storage Adapter (S3)" {class: component}
}

db: "Database (PostgreSQL)" {class: database}
email_provider: "SendGrid" {class: external}
file_storage: "AWS S3" {class: external}

# Strict downward flow
user -> presentation.pages: "interacts via browser"
presentation.pages -> presentation.state: "reads/writes state"
presentation.pages -> api_layer.routes: "HTTP fetch"

api_layer.routes -> api_layer.middleware: "passes through"
api_layer.routes -> domain.services: "delegates to"

domain.services -> domain.entities: "creates/validates"
domain.services -> domain.ports: "calls interfaces"

domain.ports -> infra.repo: "implemented by"
domain.ports -> infra.email_adapter: "implemented by"
domain.ports -> infra.storage_adapter: "implemented by"

infra.repo -> db: "SQL queries"
infra.email_adapter -> email_provider: "SMTP / API"
infra.storage_adapter -> file_storage: "PUT /bucket/key"
```

---

## Pattern 6: CQRS / Event Sourcing

Use when: read and write models are separated; events are the source of truth.

```d2
# CQRS / Event Sourcing
# Type: architecture

direction: right

classes: {
  command_side: {
    style: {
      fill: "#dae8fc"
      stroke: "#6c8ebf"
      border-radius: 4
    }
  }
  query_side: {
    style: {
      fill: "#d5e8d4"
      stroke: "#82b366"
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
  event_store: {
    shape: queue
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
      bold: true
    }
  }
  actor: {
    shape: person
    style: {
      fill: "#e1d5e7"
      stroke: "#9673a6"
    }
  }
}

user: "User" {class: actor}

command_api: "Command API" {class: command_side}
event_store: "Event Store (EventStoreDB)" {class: event_store}
projector_svc: "Projector Service" {class: query_side}
query_api: "Query API" {class: query_side}

write_db: "Write Store (PostgreSQL)" {class: database}
read_db: "Read DB (denormalized)" {class: database}
snapshot_store: "Snapshot Store (Redis)" {class: database}

# Command side
user -> command_api: "POST /commands/place-order"
command_api -> write_db: "load aggregate + optimistic lock"
command_api -> event_store: "append domain events"
command_api -> snapshot_store: "periodic snapshot"

# Event propagation (dashed = async stream)
event_store -> projector_svc: "stream new events" {
  style.stroke-dash: 5
  style.animated: true
}

# Projection side
projector_svc -> read_db: "upsert projections"

# Query side
user -> query_api: "GET /queries/orders/{id}"
query_api -> read_db: "SELECT from projections"
```

---

## Pattern 7: Request-Response Sequence Diagram

Use when: showing the order of operations for a specific API call or user flow.

```d2
# Login Flow — Sequence Diagram
# Type: sequence

shape: sequence_diagram

client: "Client App"
api: "API Server"
auth_svc: "Auth Service"
db: "User DB" {
  shape: cylinder
}
cache: "Session Cache" {
  shape: cylinder
}

client -> api: "POST /auth/login {email, password}"
api -> auth_svc: "validateCredentials(email, password)"
auth_svc -> db: "SELECT * FROM users WHERE email = ?"
db -> auth_svc: "user record"
auth_svc -> api: "credentials valid + user_id"
api -> cache: "SET session:{token} = user_id TTL 24h"
api -> client: "200 OK {access_token, refresh_token}"
```

---

## Pattern 8: ER Diagram (Database Schema)

Use when: showing relationships between database tables with column types and constraints.

```d2
# E-Commerce Database Schema
# Type: ER

direction: down

users: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  email: varchar {constraint: unique}
  password_hash: varchar {constraint: not_null}
  created_at: timestamp
}

products: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  name: varchar {constraint: not_null}
  price: decimal {constraint: not_null}
  stock: int
}

orders: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  user_id: uuid {constraint: foreign_key}
  status: varchar {constraint: not_null}
  total: decimal
  created_at: timestamp
}

order_items: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  order_id: uuid {constraint: foreign_key}
  product_id: uuid {constraint: foreign_key}
  quantity: int {constraint: not_null}
  unit_price: decimal
}

# Relationships with crow's foot notation
users.id -> orders.user_id: "" {
  source-arrowhead: {shape: cf-one-required}
  target-arrowhead: {shape: cf-many}
}
orders.id -> order_items.order_id: "" {
  source-arrowhead: {shape: cf-one-required}
  target-arrowhead: {shape: cf-many}
}
products.id -> order_items.product_id: "" {
  source-arrowhead: {shape: cf-one-required}
  target-arrowhead: {shape: cf-many}
}
```

---

## Pattern 9: Flowchart / Process Flow

Use when: documenting a decision-making process, an algorithm, or a multi-step workflow.

```d2
# Payment Processing Flow
# Type: flowchart

direction: down

classes: {
  process: {
    style: {
      fill: "#dae8fc"
      stroke: "#6c8ebf"
      border-radius: 4
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
  error_terminal: {
    shape: oval
    style: {
      fill: "#f8cecc"
      stroke: "#b85450"
    }
  }
}

start: "Receive Payment Request" {class: terminal}
validate: "Validate Request\n(amount, currency, method)" {class: process}
valid_check: "Request valid?" {class: decision}
reject: "Return 400 Bad Request" {class: error_terminal}
route: "Route to Payment Provider" {class: process}
charge: "Attempt Charge" {class: process}
charge_check: "Charge succeeded?" {class: decision}
retry: "Retry (max 3x)" {class: process}
retry_check: "Retries exhausted?" {class: decision}
fail: "Return 402 Payment Failed" {class: error_terminal}
record: "Record Transaction" {class: process}
notify: "Notify Merchant Webhook" {class: process}
success: "Return 200 OK + receipt" {class: terminal}

start -> validate
validate -> valid_check
valid_check -> reject: "no"
valid_check -> route: "yes"
route -> charge
charge -> charge_check
charge_check -> record: "yes"
charge_check -> retry: "no"
retry -> retry_check
retry_check -> charge: "no — retry"
retry_check -> fail: "yes"
record -> notify
notify -> success
```
