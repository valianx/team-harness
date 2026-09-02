### Fixed
- PR review now keeps technical specialist results when only reviews, comments, or thread state change on the same code snapshot; it refreshes and reconciles the conversation before preview or publication instead of rerunning every specialist.
- A same-author review on the current head is now deduplication input rather than a blanket stop: net-new findings can produce a supplemental review, while an already-complete prior review is not duplicated.
