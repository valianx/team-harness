# Parcel Desk architecture

## Scope

Show order acceptance and delivery of accepted-order events. All names below
identify logical components, not deployment replicas. Billing, tracing and
infrastructure are outside this view.

## Boundaries

`Parcel Platform` is a visual group. Its `Ordering` subgroup contains `Order API`
and `Orders Database`. `Order Events` belongs directly to `Parcel Platform`.
`Analytics (reserved)` is an empty subgroup of `Parcel Platform`; keep that
reservation visible. `Web Gateway` and the external `Fulfillment Partner` sit
outside `Parcel Platform`. These groups imply no C4 classification.

## Components

| Name | Role |
| --- | --- |
| Web Gateway | Gateway receiving order requests |
| Order API | Service accepting orders |
| Orders Database | Database storing accepted orders |
| Order Events | Queue/broker carrying accepted-order messages |
| Fulfillment Partner | External system receiving accepted-order messages |

## Directed relationships

| From | To | Label |
| --- | --- | --- |
| Web Gateway | Order API | Create order over HTTPS |
| Order API | Orders Database | Persist order |
| Order API | Order Events | Publish OrderAccepted |
| Order Events | Fulfillment Partner | Deliver OrderAccepted |

The last arrow describes message delivery from the broker to the partner,
regardless of which side initiates a transport connection. Do not reverse it to
represent polling. No relationship involving the reserved analytics group is
specified.
