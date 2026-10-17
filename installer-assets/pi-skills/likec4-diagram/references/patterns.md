# Architecture Patterns — LikeC4 Examples

Complete working `.c4` examples for common architecture patterns. Adapt element names, descriptions, and technology annotations to match the actual system. These are starting points, not copy-paste templates.

---

## Pattern 1: Monolith with Modules

Use when: a single deployable unit contains multiple logical modules with clear internal boundaries.

```likec4
specification {
  element actor {
    notation "Person"
    style { shape person; color muted }
  }
  element system {
    notation "System"
    style { shape rectangle; color primary }
  }
  element module {
    notation "Module"
    style { shape rectangle; color secondary }
  }
  element database {
    notation "Database"
    style { shape storage; color blue }
  }
}

model {
  user = actor 'User' {
    description 'End user accessing the application'
  }

  ecommerce = system 'E-Commerce Platform' {
    description 'Single-deployment monolith serving all user needs'
    technology 'Ruby on Rails'

    catalog = module 'Catalog' {
      description 'Product listings, search, categories'
      technology 'ActiveRecord + Elasticsearch'
    }

    cart = module 'Cart' {
      description 'Shopping cart and session management'
      technology 'ActiveRecord + Redis sessions'
    }

    checkout = module 'Checkout' {
      description 'Order placement, payment processing'
      technology 'Stripe SDK integration'
    }

    accounts = module 'Accounts' {
      description 'User registration, login, profile'
      technology 'Devise + JWT'
    }

    notifications = module 'Notifications' {
      description 'Email and SMS delivery'
      technology 'Sidekiq + ActionMailer'
    }
  }

  db = database 'Main DB' {
    description 'Single PostgreSQL instance for all modules'
    technology 'PostgreSQL 15'
  }

  cache = database 'Cache' {
    description 'Session storage and hot data'
    technology 'Redis 7'
  }

  stripe = actor 'Stripe' {
    description 'Payment processing service'
  }

  // Relationships
  user -> ecommerce.accounts 'signs in'
  user -> ecommerce.catalog 'browses products'
  user -> ecommerce.cart 'adds items'
  user -> ecommerce.checkout 'places order'

  ecommerce.catalog -> db 'reads products'
  ecommerce.cart -> cache 'stores cart state'
  ecommerce.checkout -> db 'writes orders'
  ecommerce.checkout -> stripe 'POST /v1/payment_intents'
  ecommerce.checkout -> ecommerce.notifications 'triggers order confirmation'
  ecommerce.accounts -> db 'reads/writes users'
  ecommerce.notifications -> db 'reads order details'
}

views {
  view index {
    title 'E-Commerce Platform — System Context'
    include *
    autoLayout TopBottom
  }

  view platform_internals of ecommerce {
    title 'Platform Modules'
    include *
    include user
    include db
    include cache
    include stripe
    autoLayout LeftRight
  }

  dynamic view checkout_flow {
    title 'Checkout Flow'
    user -> ecommerce.cart 'review cart'
    user -> ecommerce.checkout 'confirm order'
    ecommerce.checkout -> stripe 'charge card'
    stripe -> ecommerce.checkout 'payment confirmed'
    ecommerce.checkout -> db 'create order record'
    ecommerce.checkout -> ecommerce.notifications 'send receipt'
    ecommerce.notifications -> user 'receipt email'
  }
}
```

---

## Pattern 2: Microservices with API Gateway

Use when: independently deployable services behind a single entry point.

```likec4
specification {
  element actor {
    notation "Person"
    style { shape person; color muted }
  }
  element gateway {
    notation "API Gateway"
    style { shape rectangle; color primary }
  }
  element service {
    notation "Microservice"
    style { shape rectangle; color secondary }
  }
  element database {
    notation "Database"
    style { shape storage; color blue }
  }
  element cache {
    notation "Cache"
    style { shape storage; color sky }
  }
  relationship async {
    color amber
    line dotted
  }
}

model {
  customer = actor 'Customer'
  admin = actor 'Admin'

  platform = system 'Platform' {

    gateway = gateway 'API Gateway' {
      description 'Auth, rate limiting, routing to backend services'
      technology 'Kong / nginx'
    }

    user_svc = service 'User Service' {
      description 'Registration, login, profile management'
      technology 'Node.js + Express'
      style { icon tech:nodejs }
    }

    product_svc = service 'Product Service' {
      description 'Product catalog, inventory levels, pricing'
      technology 'Go'
      style { icon tech:go }
    }

    order_svc = service 'Order Service' {
      description 'Order creation, status tracking, history'
      technology 'Python + FastAPI'
      style { icon tech:python }
    }

    notification_svc = service 'Notification Service' {
      description 'Email, SMS, push — consumes events from queue'
      technology 'Node.js + Nodemailer'
    }

    user_db = database 'User DB' {
      technology 'PostgreSQL'
    }

    product_db = database 'Product DB' {
      technology 'PostgreSQL'
    }

    order_db = database 'Order DB' {
      technology 'PostgreSQL'
    }

    session_cache = cache 'Session Cache' {
      technology 'Redis'
    }
  }

  event_bus = queue 'Event Bus' {
    description 'Async events between services'
    technology 'Apache Kafka'
    style { icon tech:kafka }
  }

  payment_provider = actor 'Payment Provider' {
    description 'Stripe — external payment processing'
  }

  // External access
  customer -> platform.gateway 'HTTPS requests'
  admin -> platform.gateway 'HTTPS + admin token'

  // Gateway routing
  platform.gateway -> platform.user_svc 'routes /users/*'
  platform.gateway -> platform.product_svc 'routes /products/*'
  platform.gateway -> platform.order_svc 'routes /orders/*'
  platform.gateway -> platform.session_cache 'validates session token'

  // Service → DB
  platform.user_svc -> platform.user_db 'reads/writes'
  platform.product_svc -> platform.product_db 'reads/writes'
  platform.order_svc -> platform.order_db 'reads/writes'

  // Cross-service (sync)
  platform.order_svc -> platform.product_svc 'GET /products/{id}/stock'
  platform.order_svc -> payment_provider 'POST /v1/payment_intents'

  // Cross-service (async via event bus)
  platform.order_svc -> event_bus 'publishes OrderPlaced' async
  platform.user_svc -> event_bus 'publishes UserRegistered' async
  event_bus -> platform.notification_svc 'delivers events' async
}

views {
  view context {
    title 'System Context'
    include *
    autoLayout TopBottom
  }

  view platform_services of platform {
    title 'Platform Services'
    include *
    include customer
    include admin
    include event_bus
    include payment_provider
    autoLayout LeftRight
  }

  dynamic view order_placement {
    title 'Order Placement Flow'
    customer -> platform.gateway 'POST /orders'
    platform.gateway -> platform.order_svc 'route request'
    platform.order_svc -> platform.product_svc 'check stock'
    platform.product_svc -> platform.order_svc 'stock available'
    platform.order_svc -> payment_provider 'charge card'
    payment_provider -> platform.order_svc 'payment confirmed'
    platform.order_svc -> platform.order_db 'save order'
    platform.order_svc -> event_bus 'OrderPlaced event'
    event_bus -> platform.notification_svc 'deliver event'
    platform.notification_svc -> customer 'send confirmation email'
  }
}
```

---

## Pattern 3: Event-Driven / Message Queue

Use when: services communicate via events and are temporally decoupled.

```likec4
specification {
  element actor {
    notation "Person"
    style { shape person; color muted }
  }
  element producer {
    notation "Event Producer"
    style { shape rectangle; color primary }
  }
  element consumer {
    notation "Event Consumer"
    style { shape rectangle; color secondary }
  }
  element store {
    notation "Data Store"
    style { shape storage; color blue }
  }
  element bus {
    notation "Message Bus"
    style { shape queue; color amber }
  }
  relationship publishes {
    color amber
    line dotted
  }
  relationship subscribes {
    color green
    line dotted
  }
}

model {
  operator = actor 'Operator' {
    description 'Manages inventory and pricing'
  }

  customer = actor 'Customer' {
    description 'Places orders online'
  }

  inventory_svc = producer 'Inventory Service' {
    description 'Tracks stock levels, publishes StockUpdated events'
    technology 'Go'
  }

  order_svc = producer 'Order Service' {
    description 'Accepts orders, publishes OrderPlaced and OrderCancelled events'
    technology 'Node.js'
  }

  event_stream = bus 'Event Stream' {
    description 'Central event bus — topics: orders.*, inventory.*, payments.*'
    technology 'Apache Kafka'
    style { icon tech:kafka }
  }

  fulfillment_svc = consumer 'Fulfillment Service' {
    description 'Reserves stock and routes to warehouse on OrderPlaced'
    technology 'Python'
  }

  billing_svc = consumer 'Billing Service' {
    description 'Captures payment on OrderPlaced, refunds on OrderCancelled'
    technology 'Node.js'
  }

  analytics_svc = consumer 'Analytics Service' {
    description 'Aggregates all events into reporting database'
    technology 'Python + Pandas'
  }

  notification_svc = consumer 'Notification Service' {
    description 'Sends customer emails/SMS on order state changes'
    technology 'Node.js'
  }

  inventory_db = store 'Inventory DB' {
    technology 'PostgreSQL'
  }

  order_db = store 'Order DB' {
    technology 'PostgreSQL'
  }

  analytics_db = store 'Analytics DB' {
    description 'Append-only event log for reporting'
    technology 'ClickHouse'
  }

  // Inputs
  operator -> inventory_svc 'updates stock'
  customer -> order_svc 'places order'

  // Producers → event bus
  inventory_svc -> event_stream 'StockUpdated' publishes
  order_svc -> event_stream 'OrderPlaced, OrderCancelled' publishes

  // Event bus → consumers
  event_stream -> fulfillment_svc 'OrderPlaced' subscribes
  event_stream -> billing_svc 'OrderPlaced, OrderCancelled' subscribes
  event_stream -> analytics_svc 'all events' subscribes
  event_stream -> notification_svc 'OrderPlaced, OrderCancelled' subscribes

  // Service → DB
  inventory_svc -> inventory_db 'reads/writes stock'
  order_svc -> order_db 'reads/writes orders'
  analytics_svc -> analytics_db 'appends event records'
}

views {
  view event_landscape {
    title 'Event-Driven System'
    include *
    autoLayout LeftRight
  }

  view order_lifecycle {
    title 'Order Event Flow'
    include -> order_svc ->
    include -> event_stream ->
    include operator
    include customer
    autoLayout TopBottom
  }
}
```

---

## Pattern 4: Layered Architecture

Use when: a system is organized into horizontal layers with strict dependency rules (UI → Business → Data).

```likec4
specification {
  element actor {
    notation "Person"
    style { shape person; color muted }
  }
  element layer {
    notation "Layer"
    style { shape rectangle; color primary }
  }
  element component {
    notation "Component"
    style { shape rectangle; color secondary }
  }
  element store {
    notation "Data Store"
    style { shape storage; color blue }
  }
}

model {
  user = actor 'User'

  app = layer 'Application' {
    description 'React SPA — presentation and user interaction'
    technology 'React + TypeScript'
    style { icon tech:react }

    pages = component 'Pages' {
      description 'Route-level components, layout structure'
    }
    components = component 'UI Components' {
      description 'Reusable form elements, tables, modals'
    }
    state = component 'State Management' {
      description 'Global client state via Zustand'
    }
  }

  api = layer 'API Layer' {
    description 'Express REST API — HTTP entry point, auth validation'
    technology 'Node.js + Express'
    style { icon tech:nodejs }

    routes = component 'Route Handlers' {
      description 'Parse requests, call services, format responses'
    }
    middleware = component 'Middleware' {
      description 'JWT validation, rate limiting, request logging'
    }
  }

  domain = layer 'Domain Layer' {
    description 'Business logic — orchestrates use cases, enforces rules'
    technology 'TypeScript'

    services = component 'Domain Services' {
      description 'Implement business use cases'
    }
    entities = component 'Domain Entities' {
      description 'Core domain objects with invariants'
    }
    ports = component 'Ports (Interfaces)' {
      description 'Contracts for infrastructure adapters'
    }
  }

  infra = layer 'Infrastructure Layer' {
    description 'Adapters for external systems — DB, email, storage'
    technology 'TypeScript'

    repo = component 'Repositories' {
      description 'Prisma ORM — implements domain Ports'
      technology 'Prisma + PostgreSQL'
    }
    email_adapter = component 'Email Adapter' {
      description 'Sends transactional email via SendGrid'
      technology 'SendGrid SDK'
    }
    storage_adapter = component 'Storage Adapter' {
      description 'File upload to S3-compatible storage'
      technology 'AWS S3 SDK'
    }
  }

  db = store 'Database' {
    technology 'PostgreSQL 15'
  }

  email_provider = actor 'Email Provider' {
    description 'SendGrid'
  }

  file_storage = actor 'File Storage' {
    description 'AWS S3'
  }

  // Layer dependencies (strict downward flow)
  user -> app 'interacts via browser'
  app.pages -> app.state 'reads/writes state'
  app.pages -> api 'HTTP requests (fetch)'

  api.routes -> api.middleware 'passes through'
  api.routes -> domain.services 'delegates to'

  domain.services -> domain.entities 'creates/validates'
  domain.services -> domain.ports 'calls interfaces'

  domain.ports -> infra.repo 'implemented by'
  domain.ports -> infra.email_adapter 'implemented by'
  domain.ports -> infra.storage_adapter 'implemented by'

  infra.repo -> db 'SQL queries'
  infra.email_adapter -> email_provider 'SMTP / API'
  infra.storage_adapter -> file_storage 'PUT /bucket/key'
}

views {
  view layered_context {
    title 'Layered Architecture — Context'
    include *
    autoLayout TopBottom
  }

  view layers_detail {
    title 'Layer Breakdown'
    include app.*, api.*, domain.*, infra.*
    include user
    include db
    include email_provider
    include file_storage
    autoLayout TopBottom
  }
}
```

---

## Pattern 5: Client-Server

Use when: a simple two-tier or three-tier application with a clear client/server boundary.

```likec4
specification {
  element actor {
    notation "Person"
    style { shape person; color muted }
  }
  element client {
    notation "Client"
    style { shape browser; color green }
  }
  element server {
    notation "Server"
    style { shape rectangle; color primary }
  }
  element store {
    notation "Store"
    style { shape storage; color blue }
  }
}

model {
  user = actor 'User'

  browser = client 'Web Client' {
    description 'SPA running in the browser — React, fetches API over HTTPS'
    technology 'React + Vite'
    style { icon tech:react }
  }

  backend = server 'Backend Server' {
    description 'REST API — handles business logic, auth, data access'
    technology 'Node.js + Express'
    style { icon tech:nodejs }
  }

  db = store 'Database' {
    description 'Primary data store for all application data'
    technology 'PostgreSQL'
    style { icon tech:postgresql }
  }

  redis = store 'Cache' {
    description 'Session storage and response caching'
    technology 'Redis'
    style { icon tech:redis }
  }

  user -> browser 'opens URL'
  browser -> backend 'HTTPS API calls (JSON/REST)'
  backend -> db 'SQL reads/writes'
  backend -> redis 'session lookup / cache hit'
}

views {
  view client_server {
    title 'Client-Server Architecture'
    include *
    autoLayout LeftRight
  }
}
```

---

## Pattern 6: CQRS / Event Sourcing

Use when: read and write models are separated for performance or auditability, with events as the source of truth.

```likec4
specification {
  element actor {
    notation "Person"
    style { shape person; color muted }
  }
  element command_handler {
    notation "Command Handler"
    style { shape rectangle; color primary }
  }
  element query_handler {
    notation "Query Handler"
    style { shape rectangle; color secondary }
  }
  element store {
    notation "Store"
    style { shape storage; color blue }
  }
  element projector {
    notation "Projector"
    style { shape rectangle; color indigo }
  }
  element bus {
    notation "Event Store / Bus"
    style { shape queue; color amber }
  }
  relationship event {
    color amber
    line dotted
  }
}

model {
  user = actor 'User'

  command_api = command_handler 'Command API' {
    description 'Accepts mutations — validates, executes commands, appends events'
    technology 'Node.js + CQRS library'
  }

  query_api = query_handler 'Query API' {
    description 'Serves read models — returns projections from read DB'
    technology 'Node.js + Express'
  }

  event_store = bus 'Event Store' {
    description 'Immutable append-only log of all domain events'
    technology 'EventStoreDB'
  }

  projector_svc = projector 'Projector' {
    description 'Reads events, builds/updates read-optimized projections'
    technology 'Node.js'
  }

  write_db = store 'Write Store' {
    description 'Current aggregate state (for optimistic concurrency)'
    technology 'PostgreSQL'
  }

  read_db = store 'Read DB' {
    description 'Denormalized projections optimized for queries'
    technology 'PostgreSQL (separate schema)'
  }

  snapshot_store = store 'Snapshot Store' {
    description 'Periodic aggregate snapshots to speed up event replay'
    technology 'Redis'
  }

  // Command side
  user -> command_api 'sends commands (POST /commands/...)'
  command_api -> write_db 'load aggregate + optimistic lock'
  command_api -> event_store 'append domain events'
  command_api -> snapshot_store 'save snapshot periodically'

  // Event propagation
  event_store -> projector_svc 'stream new events' event

  // Projection side
  projector_svc -> read_db 'upsert projection rows'

  // Query side
  user -> query_api 'reads data (GET /queries/...)'
  query_api -> read_db 'SELECT from projections'
}

views {
  view cqrs_overview {
    title 'CQRS / Event Sourcing — Overview'
    include *
    autoLayout LeftRight
  }

  view command_side {
    title 'Command Side Detail'
    include command_api
    include event_store
    include write_db
    include snapshot_store
    include user
    autoLayout TopBottom
  }

  view query_side {
    title 'Query Side Detail'
    include event_store
    include projector_svc
    include read_db
    include query_api
    include user
    autoLayout LeftRight
  }

  dynamic view place_order {
    title 'Place Order Command Flow'
    user -> command_api 'POST /commands/place-order'
    command_api -> write_db 'load Order aggregate'
    write_db -> command_api 'current state + version'
    command_api -> event_store 'append OrderPlaced event'
    event_store -> projector_svc 'stream OrderPlaced'
    projector_svc -> read_db 'update orders projection'
    command_api -> user '202 Accepted'
    user -> query_api 'GET /queries/orders/{id}'
    query_api -> read_db 'SELECT from orders projection'
    read_db -> query_api 'order row'
    query_api -> user '200 OK — order data'
  }
}
```
