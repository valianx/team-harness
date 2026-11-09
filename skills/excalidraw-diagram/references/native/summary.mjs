const clip = value => {
  const text = String(value);
  return text.length > 240 ? text.slice(0, 237) + '...' : text;
};
const list = value => Array.isArray(value) ? value : [];
const counts = stage => stage?.counts ? { error: stage.counts.error, warning: stage.counts.warning } : undefined;

/** Summarize verification for CLI readers; complete findings remain in reportPath and stage evidence. */
export function summarizeVerification(report, reportPath) {
  const result = { report: reportPath, verification: report.verification, nativeEditability: report.nativeEditability,
    labelVisibility: report.labelVisibility, presentationReadability: report.presentationReadability };
  for (const key of ['errors', 'visibilityErrors', 'presentationFailures']) {
    const values = list(report[key]);
    result[`${key}Count`] = values.length;
    result[key] = values.slice(0, 3).map(value => key !== 'presentationFailures' ? clip(value) : {
      stage: clip(value.stage ?? ''), metric: clip(value.metric ?? ''), count: value.count, target: value.target,
      ids: list(value.ids).slice(0, 3).map(clip), ...(value.reason ? { reason: clip(value.reason) } : {}),
    });
  }
  if (report.composition) result.composition = { status: report.composition.status,
    initial: counts(report.composition.initial), edited: counts(report.composition.edited) };
  if (report.review) {
    result.review = {};
    for (const stage of ['initial', 'edited']) {
      const evidence = report.review[stage];
      if (!evidence) continue;
      const paths = list(evidence.crops).map(value => value.path);
      result.review[stage] = { issues: `review-${stage}/issues.json`, crops: paths.slice(0, 8), cropCount: paths.length,
        omitted: (evidence.omitted || 0) + Math.max(0, paths.length - 8) };
    }
    if (report.review.comparison) result.review.comparison = report.review.comparison.path;
  }
  return result;
}
