/**
 * Held-out correction-task runner tests (correction-loop spec §8).
 *
 * The five scenarios are frozen (see src/eval/tasks/corrections.ts) and
 * run against a fresh synthetic world each. A scenario failure is a
 * correction-loop failure, not a data problem — the scenarios were
 * written before the build.
 */
import { assert, assertEquals } from "@std/assert";
import {
  CORRECTION_SCENARIOS,
  runCorrectionScenarios,
} from "./tasks/corrections.ts";

Deno.test("correction tasks: five frozen scenarios, unique ids", () => {
  assertEquals(CORRECTION_SCENARIOS.length, 5);
  const ids = new Set(CORRECTION_SCENARIOS.map((s) => s.id));
  assertEquals(ids.size, 5);
  for (const scenario of CORRECTION_SCENARIOS) {
    assert(
      scenario.description.length > 0,
      `${scenario.id}: needs a description`,
    );
    assert(
      scenario.source.length > 0,
      `${scenario.id}: needs a grounding source`,
    );
  }
});

Deno.test("correction tasks: every held-out scenario passes", async () => {
  const results = await runCorrectionScenarios();
  assertEquals(results.length, 5);
  for (const result of results) {
    assert(
      result.pass,
      `${result.id} failed:\n${result.details.join("\n")}`,
    );
  }
});
