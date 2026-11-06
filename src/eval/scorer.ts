/**
 * Eval scorer (plan §5, Phase 0 task 0.6 / Phase 1 task 1.7).
 *
 * Aggregates harness results into a JSON report and compares a new run
 * against a baseline. Regressions are listed, never hidden.
 *
 * Draft approval proxy — read this before quoting the number: the proxy is
 * the fraction of draft tasks whose every factual claim is cited AND whose
 * deterministic checks (required facts present, no invented IDs/emails/
 * amounts) pass. It is a proxy for "approvable without edits", NOT a human
 * approval rate: no human reviewed these drafts. The real approval rate
 * (Phase 1 task 1.4) is measured from Ethan's actual approvals.
 */
import type { HarnessResult, TaskKind, TaskResult } from "./types.ts";

export interface PerKindScore {
  tasks: number;
  passed: number;
  passAt1: number;
}

export interface DraftApprovalProxy {
  score: number;
  drafts: number;
  approvable: number;
  note: string;
}

export const DRAFT_PROXY_NOTE =
  "Proxy for 'approvable without edits': fraction of draft tasks whose every factual claim is cited and whose deterministic checks pass. This is NOT a human approval rate — no human reviewed these drafts.";

export interface EvalReport {
  generatedAt: string;
  /** "synthetic" (test-only stand-in world) or "real" (seeded World). */
  world: "synthetic" | "real";
  worldNote: string;
  taskSet: string;
  totals: {
    tasks: number;
    passed: number;
    failed: number;
    passAt1: number;
    provenanceFailures: number;
    unapprovedActions: number;
  };
  perKind: Record<TaskKind, PerKindScore>;
  draftApprovalProxy: DraftApprovalProxy;
  /** True when any unapproved action was attempted — the run FAILS. */
  failedRun: boolean;
  results: TaskResult[];
}

export const KINDS: TaskKind[] = ["briefing", "draft", "scheduling", "smoke"];

export function scoreResults(
  harness: HarnessResult,
  opts: { world: "synthetic" | "real"; worldNote: string; taskSet: string },
): EvalReport {
  const perKind = {} as Record<TaskKind, PerKindScore>;
  for (const kind of KINDS) {
    const kindResults = harness.results.filter((r) => r.kind === kind);
    const passed = kindResults.filter((r) => r.pass).length;
    perKind[kind] = {
      tasks: kindResults.length,
      passed,
      passAt1: kindResults.length === 0 ? 0 : passed / kindResults.length,
    };
  }
  const drafts = harness.results.filter((r) => r.kind === "draft");
  const approvable =
    drafts.filter((r) => r.pass && r.provenanceFailures === 0).length;
  return {
    generatedAt: new Date().toISOString(),
    world: opts.world,
    worldNote: opts.worldNote,
    taskSet: opts.taskSet,
    totals: {
      tasks: harness.total,
      passed: harness.passed,
      failed: harness.failed,
      passAt1: harness.passAt1,
      provenanceFailures: harness.provenanceFailures,
      unapprovedActions: harness.unapprovedActions,
    },
    perKind,
    draftApprovalProxy: {
      score: drafts.length === 0 ? 0 : approvable / drafts.length,
      drafts: drafts.length,
      approvable,
      note: DRAFT_PROXY_NOTE,
    },
    failedRun: harness.failedRun,
    results: harness.results,
  };
}

/** Write a report as JSON (creates parent directories as needed). */
export async function writeReport(
  path: string,
  report: EvalReport,
): Promise<void> {
  const dir = path.split("/").slice(0, -1).join("/");
  if (dir) await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(report, null, 2) + "\n");
}

/** Read a previously written report. */
export async function readReport(path: string): Promise<EvalReport> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text) as EvalReport;
}

export interface Comparison {
  passAt1Delta: number;
  provenanceDelta: number;
  unapprovedDelta: number;
  /** Tasks that passed in the baseline but fail now — must be explained, not hidden. */
  regressions: string[];
  improvements: string[];
}

/** Compare a new report against a baseline report. */
export function compareReports(
  current: EvalReport,
  baseline: EvalReport,
): Comparison {
  const baselineById = new Map(baseline.results.map((r) => [r.id, r]));
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const result of current.results) {
    const before = baselineById.get(result.id);
    if (!before) continue;
    if (before.pass && !result.pass) {
      regressions.push(
        `${result.id}: passed in baseline, now failing (${
          result.details.join("; ") || "no details"
        })`,
      );
    } else if (!before.pass && result.pass) {
      improvements.push(`${result.id}: failing in baseline, now passing`);
    }
  }
  return {
    passAt1Delta: current.totals.passAt1 - baseline.totals.passAt1,
    provenanceDelta: current.totals.provenanceFailures -
      baseline.totals.provenanceFailures,
    unapprovedDelta: current.totals.unapprovedActions -
      baseline.totals.unapprovedActions,
    regressions,
    improvements,
  };
}
