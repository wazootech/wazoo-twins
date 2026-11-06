/**
 * Smoke runner (plan Phase 0 task 0.5).
 *
 * `deno task smoke` — answers the 20 hand-written smoke questions by
 * querying the WorldClient (keyword search + findFacts) and composing a
 * cited answer, then verifies each one deterministically.
 *
 * Default world is the synthetic in-memory world (see
 * src/eval/synthetic-world.ts). `--world real` runs against the real seeded
 * World via createWorldClient (default libsql backend). The real smoke
 * baseline is 18/20 (Nov 6, 2026; see eval-data/README.md for the two gaps).
 *
 * Note: the real path dynamically imports src/world/client.ts, which
 * pulls in the libsql native module — it needs `--allow-sys` (and
 * `--allow-write` for the libsql backend), which the `deno task smoke`
 * flags do not grant. Run it directly, e.g.:
 * `deno run --allow-read --allow-env --allow-net --allow-sys --allow-write
 * src/eval/smoke.ts --world real`
 *
 * Exit code: 1 when any smoke question fails.
 */
import type { WorldClient } from "../world/client.ts";
import { answerFromWorld, runEval } from "./harness.ts";
import { seedSyntheticWorld } from "./synthetic-world.ts";
import { SMOKE_TASKS } from "./tasks/index.ts";

/** Read a `--flag value` or `--flag=value` argument. */
function flagValue(args: string[], flag: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split("=")[1];
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

async function main(): Promise<number> {
  const worldArg = flagValue(Deno.args, "--world") ?? "synthetic";
  let world: WorldClient;
  if (worldArg === "real") {
    try {
      // Dynamic import: src/world/client.ts pulls in the libsql native
      // module at import time, which needs --allow-sys. The synthetic path
      // must never pay that cost.
      const { createWorldClient } = await import("../world/client.ts");
      world = await createWorldClient();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `real-World smoke run failed: ${message}` +
          (message.includes("Requires ")
            ? " If this is a permission error (NotCapable), re-run directly with " +
              "--allow-sys --allow-ffi (and --allow-write for the libsql backend)."
            : ""),
      );
      return 1;
    }
  } else if (worldArg === "synthetic") {
    world = await seedSyntheticWorld();
  } else {
    console.error(
      `unknown --world value: ${worldArg} (expected "synthetic" or "real")`,
    );
    return 1;
  }

  console.log(
    `Running ${SMOKE_TASKS.length} smoke questions against the ${worldArg} world...`,
  );
  const result = await runEval(world, SMOKE_TASKS, answerFromWorld);
  await world.close();

  for (const taskResult of result.results) {
    const mark = taskResult.pass ? "PASS" : "FAIL";
    const task = SMOKE_TASKS.find((t) => t.id === taskResult.id);
    console.log(`[${mark}] ${taskResult.id}: ${task?.question ?? ""}`);
    for (const detail of taskResult.details) console.log(`       - ${detail}`);
  }
  console.log(
    `\nSmoke: ${result.passed}/${result.total} passed | ` +
      `provenance failures: ${result.provenanceFailures} | ` +
      `unapproved actions: ${result.unapprovedActions}`,
  );
  if (result.failedRun) {
    console.error(
      "RUN FAILED: an unapproved action was attempted (must stay zero).",
    );
  }
  return result.passed === result.total && !result.failedRun ? 0 : 1;
}

if (import.meta.main) {
  Deno.exit(await main());
}
