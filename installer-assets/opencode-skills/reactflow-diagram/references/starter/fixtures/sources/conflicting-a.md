# Stock reservation — application description

## Components

`Inventory Service` and `Reservation API` are services. No groups are specified.

## reserve-stock

Inventory Service initiates the `Reserve stock` request to Reservation API.
The architectural arrow for this operation is:

`Inventory Service` → `Reservation API`: `Reserve stock`.

Reservation API does not initiate this operation toward Inventory Service.
