## Why

The reduced catastrophic-deletion guard still misses the reported readable rm forms when one simple argument precedes the recursive-force flags. Correcting that case must preserve the deliberately narrow policy.

## What Changes

- Reproduce the reported false negatives as inert evaluator inputs.
- Recognize only the simple affected argument ordering while preserving the existing catastrophic targets and non-covered decisions, including shell option termination.
- Add bounded positive and benign contrast fixtures and regenerate the existing bundles.

## Capabilities

### New Capabilities

- `readable-delete-guard`: The reduced catastrophic-deletion guard still misses the reported readable rm forms when a simple quoted/glob argument precedes the recursive-force flags.

## Impact

policy-block TypeScript body, focused behavioral fixtures and generated hook bundles. No other hook or permission changes.

## Non-Goals

General shell parsing, adversarial completeness, new guarded destinations, new hooks or broader secret detection.
