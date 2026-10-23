# Harbor: warehouse reservation proposal

Harbor currently asks the warehouse for stock availability before accepting a cart. An availability response does not reserve stock; another cart may consume it.

The proposal adds a reservation request from Harbor to the warehouse. The warehouse returns an explicit outcome before Harbor accepts the cart. The existing source does not specify a timeout, reservation lifetime, cancellation/query contract, SLA or rollout date.

A timeout can leave the caller uncertain whether the warehouse reserved stock. The teams must decide how Harbor queries or cancels an uncertain reservation. Agree successful and rejected outcomes, decide recovery semantics, then exercise representative carts. These are proposed validation phases, not a committed schedule.
