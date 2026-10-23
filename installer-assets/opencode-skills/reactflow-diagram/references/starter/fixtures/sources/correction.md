# Parcel Desk — operator correction

Apply this correction to the diagram previously authored from
`documentation.md`. These changes supersede the affected statements in that
document; the rest remains current.

1. Rename `Order API` to `Order Intake and Validation Service`. It is the same
   logical service, in the same Ordering subgroup, not a replacement component.
2. The partner is now called through a direct webhook from that service. Replace
   `Order Events` → `Fulfillment Partner`: `Deliver OrderAccepted` with
   `Order Intake and Validation Service` → `Fulfillment Partner`:
   `Notify accepted order by webhook`.
3. The service still persists orders and publishes `OrderAccepted` to Order
   Events. Keep the gateway, database, broker, external partner, group membership
   and empty analytics reservation. Do not add a second partner notification.

Retain the identities and evidence of unchanged elements. Preserve the renamed
service's identity because its logical identity did not change. Record this
correction as the source for its new name and webhook relationship. Reassess
fidelity and rerun the affected model, measurement/layout, geometry and rendered
checks; the longer name can change dimensions.
