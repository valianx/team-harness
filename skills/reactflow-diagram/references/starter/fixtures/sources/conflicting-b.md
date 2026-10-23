# Stock reservation — integration description

## Components

`Inventory Service` and `Reservation API` are services. No groups are specified.

## reserve-stock

Reservation API initiates the `Reserve stock` request to Inventory Service.
The architectural arrow for this operation is:

`Reservation API` → `Inventory Service`: `Reserve stock`.

Inventory Service does not initiate this operation toward Reservation API.
