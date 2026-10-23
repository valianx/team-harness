# Archive pipeline source inventory

## Available brief

`Ingestion API` is a service that publishes `RecordAccepted` messages to the
`Record Stream` broker. `Archive Store` is a database and is the eventual archive
destination. No groups are defined in this brief.

The requested view is the complete path from Ingestion API to Archive Store,
including any intermediary components. The brief establishes only:

`Ingestion API` → `Record Stream`: `Publish RecordAccepted`.

## Missing material attachment

The archive policy attachment was not supplied. Its synthetic locator is:
`https://sources.invalid/synthetic/archive-policy.pdf`, section "Archive path".
This is an intentionally inaccessible fixture reference, not a URL to fetch.

That section determines whether Record Stream delivers directly to Archive Store
or through a separate retention service, and which component initiates the
archive write. The owner has not settled that choice in any available source.
Do not invent an intermediary, direct edge or direction as established fact.

## Operator scope

The complete archive path is still required. A partial diagram of the available
brief is useful, but it remains a draft with incomplete fidelity until the
attachment is accessible or the operator explicitly narrows the requested scope.
