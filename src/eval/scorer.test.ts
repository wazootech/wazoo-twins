import { assertEquals } from "@std/assert";
import { compareReports, scoreResults } from "./scorer.ts";
import type { EvalReport } from "./scorer.ts";
import type { HarnessResult, TaskResult } from "./types.ts";

function taskResult(
  id: string,
  kind: TaskResult["kind"],
  pass: boolean,
): TaskResult {
  return {
    id,
    kind,
    pass,
    details: pass ? [] : ["failed"],
    provenanceFailures: 0,
    unapprovedActions: 0,
    durationMs: 1,
    answerExcerpt: "",
  };
}

function harnessResult(results: TaskResult[]): HarnessResult {
  const passed = results.filter((r) => r.pass).length;
  return {
    results,
    total: results.length,
    passed,
    failed: results.length - passed,
    passAt1: results.length === 0 ? 0 : passed / results.length,
    provenanceFailures: 0,
    unapprovedActions: 0,
    failedRun: false,
  };
}

Deno.test("scorer: aggregates pass@1 overall and per kind", () => {
  const report = scoreResults(
    harnessResult([
      taskResult("brief-01", "briefing", true),
      taskResult("brief-02", "briefing", false),
      taskResult("draft-01", "draft", true),
      taskResult("sched-01", "scheduling", true),
    ]),
    { world: "synthetic", worldNote: "test", taskSet: "test" },
  );
  assertEquals(report.totals.tasks, 4);
  assertEquals(report.totals.passed, 3);
  assertEquals(report.totals.passAt1, 0.75);
  assertEquals(report.perKind.briefing, { tasks: 2, passed: 1, passAt1: 0.5 });
  assertEquals(report.perKind.draft, { tasks: 1, passed: 1, passAt1: 1 });
  assertEquals(report.perKind.smoke, { tasks: 0, passed: 0, passAt1: 0 });
  assertEquals(report.world, "synthetic");
});

Deno.test("scorer: draft approval proxy is the fraction of passing drafts", () => {
  const report = scoreResults(
    harnessResult([
      taskResult("draft-01", "draft", true),
      taskResult("draft-02", "draft", false),
      taskResult("brief-01", "briefing", true),
    ]),
    { world: "synthetic", worldNote: "test", taskSet: "test" },
  );
  assertEquals(report.draftApprovalProxy.drafts, 2);
  assertEquals(report.draftApprovalProxy.approvable, 1);
  assertEquals(report.draftApprovalProxy.score, 0.5);
  assertEquals(
    report.draftApprovalProxy.note.includes("NOT a human approval rate"),
    true,
  );
});

Deno.test("scorer: compareReports lists regressions and improvements, never hides them", () => {
  const baseline: EvalReport = scoreResults(
    harnessResult([
      taskResult("a", "briefing", true),
      taskResult("b", "briefing", false),
      taskResult("c", "briefing", true),
    ]),
    { world: "synthetic", worldNote: "test", taskSet: "test" },
  );
  const current: EvalReport = scoreResults(
    harnessResult([
      taskResult("a", "briefing", false),
      taskResult("b", "briefing", true),
      taskResult("c", "briefing", true),
    ]),
    { world: "synthetic", worldNote: "test", taskSet: "test" },
  );
  const comparison = compareReports(current, baseline);
  assertEquals(comparison.regressions.length, 1);
  assertEquals(comparison.regressions[0].startsWith("a:"), true);
  assertEquals(comparison.improvements.length, 1);
  assertEquals(comparison.improvements[0].startsWith("b:"), true);
  assertEquals(comparison.passAt1Delta, 0);
});

Deno.test("scorer: failedRun propagates from the harness", () => {
  const harness = harnessResult([taskResult("a", "briefing", true)]);
  harness.failedRun = true;
  harness.unapprovedActions = 1;
  const report = scoreResults(harness, {
    world: "synthetic",
    worldNote: "test",
    taskSet: "test",
  });
  assertEquals(report.failedRun, true);
  assertEquals(report.totals.unapprovedActions, 1);
});
