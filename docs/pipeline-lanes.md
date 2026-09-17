# Choosing a workflow

Choose the smallest useful workflow from the objective, uncertainty and
dependencies. The native general agent remains the coordinator.

| Work | Useful approach |
| --- | --- |
| Straightforward change or question | Direct work |
| Development with written intent and tasks | `spec` |
| Broader coordination explicitly chosen by the operator | `pipeline` |
| Existing PR review | `review-pr` |
| Author-side PR preparation and publication | `create-pr` |

Spec supports bounded objectives across one or several repositories. Independent
tasks may be delegated when it helps. There is no three-file cutoff, automatic
security ejection or mandatory model/role chain.

Security-sensitive work benefits from relevant expertise and adversarial
review. The coordinator evaluates findings and verifies fixes in the full
context. Review summaries and stage names do not replace native permissions
or the user's authorization.
