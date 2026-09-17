
Analyze the input: $ARGUMENTS

If no hypothesis or approach can be inferred from the task context, ask what the
operator wants to test before creating an experiment.

## Frame the experiment

Extract the hypothesis, the smallest experiment that can distinguish the
possible outcomes, and the evidence that would count as support, refutation, or
an unresolved result. Record a known baseline: the current commit, configuration,
behavior, or measured value against which the prototype will be compared.

## Isolate and run

Choose isolation proportional to the change. Use a temporary directory for a
small standalone experiment, or a dedicated worktree when the prototype must
touch repository files or dependencies. Use the current worktree only when the
operator's request makes the task-owned scope clear and unrelated changes can be
preserved. Keep the baseline and changed paths visible.

Implement only enough to test the hypothesis. Run the checks or measurements
that distinguish the outcomes; a full design, test, or delivery workflow is not
implied. Keep throwaway code and raw output outside maintained product files.
The current agent may delegate a bounded prototype or research task when useful,
then consolidates the result.

If the operator discards the experiment, remove only the spike-owned temporary
directory, worktree, branch, or files after verifying ownership. Preserve
unrelated work and leave no scratch artifacts in the maintained repository.

## Report and next choice

Report the hypothesis, baseline, experiment, observed evidence, conclusion, and
any limitations. Present the result as one of: formalize as a feature, discard
the task-owned experiment, or investigate further with another spike or
`research`.
