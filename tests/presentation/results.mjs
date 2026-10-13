const productionGroups = ["T01/T09", "T03", "T04", "T05", "T06", "T07", "T08", "T10", "T11", "T12", "T13", "T14/T15", "T18", "ORACLE"];
export const requiredCases = [
  ...["1280x720", "1920x1080"].flatMap((project) => productionGroups.map((group) => `${project}:${group}`)),
  "strict-mode:T11",
];

export function summarize(report) {
  const tests = [];
  const visit = (suites) => { for (const suite of suites) { for (const spec of suite.specs ?? []) for (const test of spec.tests) tests.push({ title: spec.title, project: test.projectName, status: test.status, expectedStatus: test.expectedStatus, results: test.results }); visit(suite.suites ?? []); } };
  visit(report.suites);
  const collected = tests.map((test) => `${test.project}:${test.title.split(":")[0]}`);
  const missing = requiredCases.filter((key) => !collected.includes(key));
  const unexpected = collected.filter((key, index) => !requiredCases.includes(key) || collected.indexOf(key) !== index);
  const counts = {
    expected: requiredCases.length, selected: requiredCases.length, collected: tests.length,
    executed: tests.filter((test) => test.results.some((result) => result.status !== "skipped")).length,
    passed: tests.filter((test) => test.status === "expected" && test.expectedStatus === "passed" && test.results.every((result) => result.status === "passed")).length,
    failed: tests.filter((test) => test.status === "unexpected" || test.expectedStatus !== "passed").length,
    skipped: tests.filter((test) => test.status === "skipped").length,
    flaky: tests.filter((test) => test.status === "flaky").length,
  };
  return { counts, requiredCases, missing, unexpected, tests, complete: !missing.length && !unexpected.length && counts.passed === counts.expected && counts.executed === counts.expected && !counts.failed && !counts.skipped && !counts.flaky };
}
