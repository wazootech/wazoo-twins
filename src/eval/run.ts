/**
 * Eval runner (plan Phase 0 task 0.6 / Phase 1 task 1.7).
 *
 * `deno task eval` — runs the full held-out set through the harness and
 * writes a JSON report.
 *
 * - First run: writes eval-data/baseline.json.
 * - Later runs: compares against the baseline, writes eval-data/latest.json,
 *   and lists any regression (a task that passed in the baseline but fails
 *   now). Regressions are listed, never hidden, and fail the run.
 * - `--smoke` also runs the 20 smoke questions.
 * - `--world real` runs against the real seeded World via createWorldClient
 *   (default libsql backend, `~/workspace/wazoo-twins-data/world.db`).
 *   The real baseline was recorded Nov 6, 2026: held-out 24/25 (96.0%),
 *   smoke 18/20, 0 provenance failures, 0 unapproved actions (see
 *   eval-data/README.md). The seed was still being written when it was
 *   taken, so re-baseline once the seed settles. The synthetic world
 *   remains the default for `deno task eval` (no extra permissions needed);
 *   synthetic-baseline numbers are never presented as real baseline numbers:
 *   the report records `world: "synthetic" | "real"` and a `worldNote`.
 *   Note: the real path dynamically imports src/world/client.ts, which
 *   pulls in the libsql native module — it needs `--allow-sys --allow-ffi`
 *   (and `--allow-write` for the libsql backend), which the `deno task eval`
 *   flags do not grant. Run it directly, e.g.:
 *   `deno run --allow-read --allow-env --allow-net --allow-sys --allow-ffi
 *   --allow-write src/eval/run.ts --world real`
 * - `--force-baseline` overwrites the existing baseline.
 *
 * Exit code: 1 when an unapproved action was attempted, when a regression
 * vs. the baseline is found, or when the requested world is unavailable.
 * A low pass@1 alone does not fail the run — the Phase 0 baseline is
 * expected to be low; that is the point.
 */
import { join } from "@std/path";
import type { WorldClient } from "../world/client.ts";
import { answerFromWorld, runEval } from "./harness.ts";
import {
  compareReports,
  readReport,
  scoreResults,
  writeReport,
} from "./scorer.ts";
import { seedSyntheticWorld } from "./synthetic-world.ts";
import { ALL_TASKS, HELD_OUT_TASKS, toTaskJson } from "./tasks/index.ts";

const EVAL_DATA_DIR = new URL("../../eval-data/", import.meta.url).pathname;
const BASELINE_PATH = join(EVAL_DATA_DIR, "baseline.json");
const LATEST_PATH = join(EVAL_DATA_DIR, "latest.json");
const TASKS_PATH = join(EVAL_DATA_DIR, "tasks.json");

/** Read a `--flag value` or `--flag=value` argument. */
function flagValue(args: string[], flag: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split("=")[1];
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

export const SYNTHETIC_WORLD_NOTE =
  "SYNTHETIC run: hand-written in-memory world (src/eval/synthetic-world.ts), not the real seeded World. These numbers measure the harness, not the Twin. The real baseline lives in eval-data/baseline.json (world: real); the first synthetic baseline is preserved at eval-data/baseline-synthetic.json. Do not present synthetic numbers as real baseline numbers.";

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function buildWorld(kind: "synthetic" | "real"): Promise<WorldClient> {
  if (kind === "synthetic") return await seedSyntheticWorld();
  // Dynamic import: src/world/client.ts pulls in the libsql native module
  // at import time, which needs --allow-sys. The synthetic path must never
  // pay that cost, and `deno task eval` does not grant --allow-sys.
  // Backend is env-driven (TWIN_WORLD_BACKEND, default libsql).
  try {
    const { createWorldClient } = await import("../world/client.ts");
    return await createWorldClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `real-World run failed: ${message}` +
        (message.includes("Requires ")
          ? " If this is a permission error (NotCapable), re-run directly with " +
            "--allow-sys --allow-ffi (and --allow-write for the libsql backend): " +
            "deno run --allow-read --allow-env --allow-net --allow-sys " +
            "--allow-ffi --allow-write src/eval/run.ts --world real"
          : ""),
    );
  }
}

async function main(): Promise<number> {
  const args = Deno.args;
  const withSmoke = args.includes("--smoke");
  const forceBaseline = args.includes("--force-baseline");
  const worldArg = flagValue(args, "--world") ?? "synthetic";
  if (worldArg !== "synthetic" && worldArg !== "real") {
    console.error(
      `unknown --world value: ${worldArg} (expected "synthetic" or "real")`,
    );
    return 1;
  }
  const worldKind = worldArg as "synthetic" | "real";

  let world: WorldClient;
  try {
    world = await buildWorld(worldKind);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const tasks = withSmoke ? ALL_TASKS : HELD_OUT_TASKS;
  const taskSet = withSmoke ? "held-out-v1+smoke-v1" : "held-out-v1";
  const factCount = await world.count();
  console.log(
    `Running ${tasks.length} tasks (${taskSet}) against the ${worldKind} world (${factCount} facts)...`,
  );
  if (worldKind === "real" && factCount === 0) {
    console.log(
      "WARNING: the real World is EMPTY — no seed has been run yet. " +
        "Scores from this run measure an unseeded world, not the Twin, " +
        "and must not be recorded as the real baseline.",
    );
  }

  const harness = await runEval(world, tasks, answerFromWorld);
  await world.close();

  const report = scoreResults(harness, {
    world: worldKind,
    worldNote: worldKind === "synthetic"
      ? SYNTHETIC_WORLD_NOTE
      : "Real World via createWorldClient (env-selected backend).",
    taskSet,
  });

  // The task definitions (serializable form) are the single source of truth.
  await Deno.writeTextFile(
    TASKS_PATH,
    JSON.stringify(tasks.map(toTaskJson), null, 2) + "\n",
  );
  console.log(`Task definitions written to ${TASKS_PATH}`);

  for (const result of report.results) {
    const mark = result.pass ? "PASS" : "FAIL";
    console.log(`[${mark}] ${result.id} (${result.kind})`);
    for (const detail of result.details) console.log(`       - ${detail}`);
  }
  console.log(
    `\npass@1: ${report.totals.passed}/${report.totals.tasks} ` +
      `(${(report.totals.passAt1 * 100).toFixed(1)}%) | ` +
      `provenance failures: ${report.totals.provenanceFailures} | ` +
      `unapproved actions: ${report.totals.unapprovedActions} | ` +
      `draft approval proxy: ${
        (report.draftApprovalProxy.score * 100).toFixed(1)
      }%`,
  );

  if (report.failedRun) {
    console.error(
      "\nRUN FAILED: an unapproved action was attempted (must stay zero).",
    );
    await writeReport(LATEST_PATH, report);
    return 1;
  }

  if (!(await fileExists(BASELINE_PATH)) || forceBaseline) {
    await writeReport(BASELINE_PATH, report);
    console.log(`\nBaseline written to ${BASELINE_PATH}`);
    return 0;
  }

  const baseline = await readReport(BASELINE_PATH);
  await writeReport(LATEST_PATH, report);
  if (baseline.world !== report.world) {
    // Cross-world comparisons are apples-to-oranges: a synthetic run and a
    // real run do not share a world, so a delta between them is not a
    // regression (or an improvement). Report the numbers, skip the verdict.
    console.log(
      `\nCompared against baseline ${BASELINE_PATH}: SKIPPED — baseline is "${baseline.world}" world, this run is "${report.world}" world. Compare only same-world runs.`,
    );
    return 0;
  }
  const comparison = compareReports(report, baseline);
  console.log(`\nCompared against baseline ${BASELINE_PATH}:`);
  console.log(
    `  pass@1 delta: ${(comparison.passAt1Delta * 100).toFixed(1)} pts`,
  );
  console.log(`  provenance delta: ${comparison.provenanceDelta}`);
  console.log(`  unapproved delta: ${comparison.unapprovedDelta}`);
  for (const improvement of comparison.improvements) {
    console.log(`  improved: ${improvement}`);
  }
  if (comparison.regressions.length > 0) {
    console.error("\nREGRESSIONS vs baseline (must be explained, not hidden):");
    for (const regression of comparison.regressions) {
      console.error(`  - ${regression}`);
    }
    return 1;
  }
  console.log("  no regressions vs baseline.");
  return 0;
}

if (import.meta.main) {
  Deno.exit(await main());
}
