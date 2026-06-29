### Changed

- Delivery and apply-review docs now name CodeRabbit as an automated reviewer that runs on every PR: a green test rollup with CodeRabbit still reviewing reads as `UNSTABLE`/`ci_state: pending` (the PR is not done until its review completes), and every CodeRabbit inline finding is dispositioned through the apply-review flow — including the Step 6 obligation to reply on every thread and resolve only fully-applied ones.
