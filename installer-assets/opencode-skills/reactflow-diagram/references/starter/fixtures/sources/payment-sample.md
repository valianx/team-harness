# Synthetic payment architecture

This source describes the starter demonstration for agents inspecting its example.
It is separate from the Parcel Desk source-fidelity acceptance case.

## Payment entry

API Gateway accepts incoming payment requests and forwards them to the Payment
Orchestrator through the directed relationship labeled `HTTPS`.

## Processing

Payment Orchestrator coordinates payment processing and persistence. It owns the
application-side calls to storage and publication described below.

## Persistence

Payment Orchestrator writes payment state to the PostgreSQL database through the
directed relationship labeled `SQL`.

## Events

Payment Orchestrator publishes completed payment events to the Payment Events
queue/broker through the directed relationship labeled `Publish event`.

## Notifications

Payment Events sends event notifications to the external Notification Provider
through the directed relationship labeled `Notification`.

## Visual grouping

The example infers a Payment platform boundary around the orchestrator, database
and broker, with a Processing subgroup around the orchestrator. Gateway and
notification provider remain outside it. These are explicit visual inferences,
without an implied C4 classification. A missing source-fidelity assessor keeps
the supplied example draft until an actual source-to-artifact assessment occurs.
