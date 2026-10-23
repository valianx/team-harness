# Parcel Desk: retry safety

## Current behavior
Parcel Desk records an accepted order and its partner-notification status. When a notification fails, an operator manually retries it. An order can remain accepted even when its notification failed.

## Proposal
Keep one delivery identity and reuse the same delivery key on every retry. Ask the partner to deduplicate repeated notifications bearing that key. Read the existing identity, send the retry, then record the response against the same delivery.

## Conditions and decisions
Partner support for duplicate-key handling is an unvalidated assumption. Retryable failure categories, retry limits and terminal recovery are undecided. First validate the partner behavior, then agree failure handling and exercise operator recovery. No release date, latency target, retry count or contractual guarantee is supplied.

The included local demonstration is a simulation with no partner connection. Reusing its key illustrates the proposal and does not establish a real integration contract.
