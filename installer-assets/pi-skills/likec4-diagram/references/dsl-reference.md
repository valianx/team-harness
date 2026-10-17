# LikeC4 DSL Reference

Quick reference for all LikeC4 DSL syntax. Use this during generation — no need to memorize.

---

## File Structure

```likec4
specification {
  // colors, element kinds, relationship kinds, tags
}

model {
  // elements and their relationships
}

views {
  // what to render
}
```

Multiple files are supported. Each file can have its own `specification`, `model`, and `views` blocks — they are merged at validation/render time.

---

## Specification Block

### Colors

```likec4
specification {
  color mycolor #2563eb
  color accent  #f59e0b
}
```

Built-in colors (no need to declare): `primary`, `secondary`, `muted`, `amber`, `blue`, `gray`, `green`, `indigo`, `red`, `sky`, `slate`

### Element Kinds

```likec4
specification {
  element actor {
    notation "Person"         // label shown in diagram key
    style {
      shape person            // visual shape
      color muted             // default color for this kind
    }
  }

  element system {
    notation "Software System"
    style {
      shape rectangle
      color primary
    }
  }

  element service {
    notation "Microservice"
    style {
      shape rectangle
      color secondary
    }
  }

  element database {
    notation "Database"
    style {
      shape storage           // or: cylinder
      color blue
    }
  }

  element queue {
    notation "Message Queue"
    style {
      shape queue
      color amber
    }
  }

  element ui {
    notation "Frontend"
    style {
      shape browser
      color green
    }
  }

  element mobile {
    notation "Mobile App"
    style {
      shape mobile
      color green
    }
  }
}
```

### Relationship Kinds

```likec4
specification {
  relationship async {
    color amber
    line dotted
  }

  relationship depends_on {
    color gray
    line dashed
  }

  relationship publishes {
    color blue
    line solid
  }
}
```

Line options: `solid` (default), `dotted`, `dashed`

### Tags

```likec4
specification {
  tag deprecated
  tag experimental
  tag external
  tag api
  tag internal
}
```

---

## Model Block

### Declaring Elements

```likec4
model {
  // Simple element
  customer = actor 'Customer'

  // With description
  api_gateway = service 'API Gateway' {
    description 'Routes requests to backend services'
  }

  // With description + technology
  user_db = database 'User DB' {
    description 'Stores user profiles and credentials'
    technology 'PostgreSQL 15'
  }

  // With icon
  frontend = ui 'Web App' {
    description 'React SPA served from CDN'
    style {
      icon tech:react
    }
  }

  // With tags
  legacy_api = service 'Legacy API' {
    description 'Being phased out in Q2'
    #deprecated
  }
}
```

### Nested Elements (containment)

```likec4
model {
  cloud = system 'Cloud Platform' {
    description 'All backend services'

    auth = service 'Auth Service' {
      description 'JWT issuance and validation'
      technology 'Node.js + Passport'
    }

    orders = service 'Orders Service' {
      description 'Order lifecycle management'
      technology 'Go + gRPC'

      // Components inside a service
      handler = component 'Order Handler' {
        description 'Processes order state transitions'
      }

      repo = component 'Order Repository' {
        description 'Reads/writes to orders DB'
      }
    }

    db = database 'Orders DB' {
      technology 'PostgreSQL'
    }
  }
}
```

### Relationships

```likec4
model {
  // Simple relationship
  customer -> frontend

  // With label
  customer -> frontend 'opens in browser'

  // With relationship kind
  orders -> email_queue 'publishes OrderPlaced' async

  // Explicit source/target in nested context
  cloud.auth -> cloud.orders 'validates token'

  // Relationship inside a container block
  cloud = system 'Cloud' {
    auth = service 'Auth Service'
    api = service 'API'

    // Defined inside the parent — both sides implied to be within cloud
    auth -> api 'validates token'
  }
}
```

---

## Views Block

### Static View (default)

```likec4
views {
  view index {
    title 'System Landscape'
    include *
    autoLayout TopBottom
  }
}
```

### View of a specific element (scoped)

```likec4
views {
  view cloud_internals of cloud {
    title 'Cloud Platform Internals'
    include *                    // all direct children of cloud
    include cloud.*              // same as above
    include customer             // include specific external element
    autoLayout LeftRight
  }
}
```

### Include/Exclude Predicates

```likec4
include *                       // all direct children of the view scope
include element.*               // all descendants of 'element'
include -> element              // all elements with a relationship TO element
include element ->              // all elements that element relates TO
include -> element ->           // all elements connected to element (in or out)
include element, other          // include multiple elements
exclude element                 // remove a specific element from the view
```

### Per-View Styling

```likec4
views {
  view highlight_auth of cloud {
    title 'Auth Focus'
    include *
    // Override styling for specific elements in this view
    style auth { color primary }
    style orders { color muted }
    style db { color muted }
    autoLayout TopBottom
  }
}
```

### Dynamic View

```likec4
views {
  dynamic view login_flow {
    title 'Login Flow'
    // Steps are listed in order — each line is a step
    customer -> frontend 'enters credentials'
    frontend -> auth 'POST /auth/login'
    auth -> user_db 'SELECT user WHERE email = ?'
    user_db -> auth 'user record'
    auth -> frontend 'JWT access + refresh tokens'
    frontend -> customer 'redirects to dashboard'
  }
}
```

---

## AutoLayout Options

| Value | Direction |
|-------|-----------|
| `TopBottom` | Top to bottom (default) |
| `BottomTop` | Bottom to top |
| `LeftRight` | Left to right |
| `RightLeft` | Right to left |

---

## Available Shapes

| Shape | Visual Appearance |
|-------|------------------|
| `person` | Stick figure or person silhouette |
| `rectangle` | Standard box (default if not specified) |
| `storage` | Cylinder or barrel |
| `queue` | Queue/pipe shape |
| `browser` | Browser window frame |
| `mobile` | Mobile device frame |
| `cylinder` | Database cylinder |

---

## Built-In Colors

| Color | Suggested Use |
|-------|---------------|
| `primary` | Your system's core services |
| `secondary` | Supporting internal services |
| `muted` | External systems, third parties, actors |
| `amber` | Warning, transitional, in-progress |
| `blue` | Data stores, infrastructure |
| `gray` | Disabled, out-of-scope, irrelevant |
| `green` | Healthy, successful, stable |
| `indigo` | AI/ML components, pipelines |
| `red` | Failed, broken, high-risk |
| `sky` | Cloud infrastructure, CDN, DNS |
| `slate` | Background services, neutral |

---

## Technology Icons (tech: prefix)

Common available icons:

```
tech:nodejs     tech:typescript  tech:javascript  tech:python
tech:go         tech:java        tech:rust        tech:dotnet
tech:react      tech:vue         tech:angular     tech:nextjs
tech:svelte     tech:graphql     tech:openapi
tech:postgresql tech:mysql       tech:mongodb     tech:redis
tech:elasticsearch tech:sqlite
tech:kafka      tech:rabbitmq    tech:nats        tech:sqs
tech:docker     tech:kubernetes  tech:nginx       tech:caddy
tech:aws        tech:gcp         tech:azure       tech:cloudflare
tech:github     tech:gitlab      tech:bitbucket
tech:terraform  tech:ansible
```

Usage inside an element:
```likec4
my_service = service 'My Service' {
  style {
    icon tech:nodejs
  }
}
```

---

## Element Properties Summary

| Property | Type | Example |
|----------|------|---------|
| `description` | string | `description 'Handles authentication'` |
| `technology` | string | `technology 'Node.js 20 + Express'` |
| `style { shape }` | shape keyword | `style { shape person }` |
| `style { color }` | color keyword | `style { color primary }` |
| `style { icon }` | tech icon | `style { icon tech:react }` |
| `#tag` | tag name | `#deprecated` |

---

## Relationship Properties Summary

| Property | Where Set | Example |
|----------|-----------|---------|
| Label | inline | `a -> b 'POST /users'` |
| Kind | inline after label | `a -> b 'event' async` |
| `color` | in specification | `relationship async { color amber }` |
| `line` | in specification | `relationship async { line dotted }` |

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown element kind` | Kind not in specification | Add it to specification block |
| `Duplicate id` | Two elements with same ID in same scope | Rename one |
| `Unknown relationship kind` | Kind not in specification | Add it to specification, or remove the kind qualifier |
| `Element not found` | Referencing an ID that doesn't exist | Check spelling, check scope |
| `Circular containment` | Element nested inside itself | Restructure hierarchy |
| Missing `autoLayout` | Views render with overlapping elements | Add `autoLayout TopBottom` to every view |
