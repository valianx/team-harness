---
mode: spec
change: "{{change_slug}}"
source: "{{canonical_change_path}}"
---

# {{work_title}}

{{intended_result}}

**Status:** {{current_status}} · **Progress:** {{completed_tasks}}/{{total_tasks}} tasks

## Phases

| Phase | Expected result | Status and evidence |
| --- | --- | --- |
| Spec | Intent, tasks, testing strategy and presented data model/wireframe for affected DB/frontend | {{spec_status_and_links}} |
| Implementation | Product changes and focused checks | {{implementation_status_and_links}} |
| Validation | Checks, provider assessments and selected reviews | {{validation_status_and_links}} |
| Publication | Authorized local delivery, PR preparation or publication | {{publication_status_and_links}} |

Use pending, executed, not applicable, declined or deferred with the actual
outcome or reason. Future work is pending; an executed assessment may have
findings. Include each selected capability's purpose, scope/candidate and actual
outcome or next action once. Add detail rows only when useful; link canonical
tasks and provider results instead of duplicating their analysis.

**Next:** {{next_action}}

## Sources

[Proposal]({{proposal_link}}) · [Tasks]({{tasks_link}})

{{links_to_existing_design_or_specs}}
