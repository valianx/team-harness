---
theme: default
colorSchema: dark
addons:
  - slidev-addon-harness
title: Retry safety for Parcel Desk
layout: h-cover
routeAlias: feature-cover
canvasWidth: 1280
aspectRatio: 16/9
fonts:
  provider: none
  sans: Inter
footer: Synthetic feature proposal · decision discussion
---

Keep a retried notification tied to one delivery identity.

This proposal needs partner validation before implementation.

---
layout: h-section
routeAlias: feature-problem
title: Accepted orders, uncertain notifications
footer: Current behavior · sources/feature.md
---

Parcel Desk records an accepted order and its notification status.

An operator retries a failed partner notification manually.

---
layout: h-compare
routeAlias: feature-comparison
title: Change the retry contract
footer: Current and proposed · no release commitment
---

## Current

- An order can remain accepted after notification failure.
- The operator decides when to retry.

::right::

## Proposed

- Reuse a stable delivery key on retry.
- Ask the partner to deduplicate that key.

---
layout: h-visual
routeAlias: feature-flow
title: Preserve delivery identity
footer: Proposed flow · partner support is an assumption
---

An accepted order keeps its original identity.

The same delivery key accompanies each retry.

::visual::

![Proposed flow from accepted order through stable delivery key to partner deduplication](/images/retry-flow.svg)

---
layout: h-content
routeAlias: feature-retry
title: Make each retry explainable
clicks: 3
footer: Proposed behavior · retry limits remain undecided
---

The order is already accepted; retry only the notification.

<v-clicks>

- Read the existing delivery identity.
- Send the notification with the same key.
- Record the partner response against that delivery.

</v-clicks>

---
layout: h-content
routeAlias: feature-phases
title: Sequence evidence before rollout
footer: Proposed phases · no dates or rollout promise
---

1. Validate duplicate-key handling with the partner.
2. Agree the retry limit and terminal failure behavior.
3. Exercise the operator recovery path before enabling retries.

---
layout: h-compare
routeAlias: feature-risks
title: Resolve the contract first
footer: Open questions · source does not specify a retry count
---

## Assumption

The partner can recognize a repeated delivery key.

This has not been validated.

::right::

## Decision needed

Which failures are safe to retry, and when should retries stop?

---
layout: h-demo
routeAlias: feature-demo
title: Try the identity rule
footer: Local simulation · no partner connection
---

The counter shows attempts sharing one key.

This demonstrates the proposal; it proves no partner contract.

::visual::

<HarnessFrame src="/demos/retry/index.html" title="Local retry identity simulation" fallback="/images/retry-flow.svg" fallback-alt="Accepted order keeps one delivery key across attempts" />

---
layout: h-content
routeAlias: feature-decision
title: Approve validation, then decide
footer: Requested decision · synthetic example
---

Validate partner deduplication and agree failure handling.

Keep implementation approval open until those answers exist.

<!-- Speaker notes are editable source. The normal public build excludes them. -->
