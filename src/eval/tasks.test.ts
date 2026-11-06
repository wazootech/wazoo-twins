import { assert, assertEquals } from "@std/assert";
import { answerFromWorld, runEval } from "./harness.ts";
import {
  seedSyntheticWorld,
  SYNTHETIC_FACTS,
  SyntheticWorldClient,
} from "./synthetic-world.ts";
import { ALL_TASKS, HELD_OUT_TASKS } from "./tasks/index.ts";
import { BRIEFING_TASKS } from "./tasks/briefing.ts";
import { DRAFT_TASKS } from "./tasks/drafts.ts";
import { SCHEDULING_TASKS } from "./tasks/scheduling.ts";
import { SMOKE_TASKS } from "./tasks/smoke.ts";

Deno.test("tasks: counts are 20 smoke, 10 briefing, 10 draft, 5 scheduling", () => {
  assertEquals(SMOKE_TASKS.length, 20);
  assertEquals(BRIEFING_TASKS.length, 10);
  assertEquals(DRAFT_TASKS.length, 10);
  assertEquals(SCHEDULING_TASKS.length, 5);
  assertEquals(HELD_OUT_TASKS.length, 25);
  assertEquals(ALL_TASKS.length, 45);
});

Deno.test("tasks: every task has an id, kind, question, source, and keywords", () => {
  const ids = new Set<string>();
  for (const task of ALL_TASKS) {
    assert(task.id.length > 0, "task id must not be empty");
    assert(!ids.has(task.id), `duplicate task id: ${task.id}`);
    ids.add(task.id);
    assert(task.question.length > 0, `${task.id}: question must not be empty`);
    assert(
      task.source.length > 0,
      `${task.id}: source must name the grounding source`,
    );
    assert(task.keywords.length > 0, `${task.id}: keywords must not be empty`);
    assert(
      task.expectedSubstrings.length > 0,
      `${task.id}: expected substrings must not be empty`,
    );
  }
});

Deno.test("tasks: draft tasks have draft points and scheduling tasks have candidates", () => {
  for (const task of DRAFT_TASKS) {
    assert(
      (task.draftPoints ?? []).length > 0,
      `${task.id}: draft tasks need draftPoints`,
    );
  }
  for (const task of SCHEDULING_TASKS) {
    assert(
      (task.candidates ?? []).length >= 2,
      `${task.id}: scheduling tasks need at least 2 candidates`,
    );
    assert(
      task.verify !== undefined,
      `${task.id}: scheduling tasks need a custom verifier`,
    );
  }
  for (const task of DRAFT_TASKS) {
    assert(
      task.verify !== undefined,
      `${task.id}: draft tasks need a custom verifier`,
    );
  }
});

Deno.test("tasks: every task's source names MEMORY.md or the opportunity tracker", () => {
  for (const task of ALL_TASKS) {
    assert(
      task.source.includes("MEMORY.md") ||
        task.source.includes("opportunity-tracker.md"),
      `${task.id}: source must trace to MEMORY.md or the opportunity tracker, got "${task.source}"`,
    );
  }
});

Deno.test("synthetic world: seed facts validate against the ontology", async () => {
  const world = await seedSyntheticWorld();
  assertEquals(await world.count(), SYNTHETIC_FACTS.length);
  const fact = await world.getFact("twin:commitment/nbis-eapp");
  assertEquals(fact?.properties.status, "outstanding");
  await world.close();
});

Deno.test("synthetic world: search finds facts by keyword, findFacts filters by type", async () => {
  const world = await seedSyntheticWorld();
  const hits = await world.search("NBIS eApp");
  assert(hits.some((f) => f.id === "twin:commitment/nbis-eapp"));
  const deadlines = await world.findFacts({ type: "Deadline" });
  assert(deadlines.length >= 5);
  assert(deadlines.every((f) => f.type === "Deadline"));
  await world.close();
});

Deno.test("synthetic world: supersede records the replacement, never silently overwrites", async () => {
  const world = new SyntheticWorldClient();
  await world.addFacts(SYNTHETIC_FACTS);
  const replacement = {
    ...SYNTHETIC_FACTS[1],
    id: "twin:commitment/nbis-eapp-v2",
    properties: { ...SYNTHETIC_FACTS[1].properties, status: "done" },
  };
  await world.supersede("twin:commitment/nbis-eapp", replacement);
  assertEquals(world.supersededBy("twin:commitment/nbis-eapp"), replacement.id);
  // The old fact is still retrievable with its original content.
  const old = await world.getFact("twin:commitment/nbis-eapp");
  assertEquals(old?.properties.status, "outstanding");
  const replacementFact = await world.getFact(replacement.id);
  assertEquals(replacementFact?.properties.status, "done");
  await world.close();
});

Deno.test("tasks: full held-out + smoke set passes against the synthetic world", async () => {
  const world = await seedSyntheticWorld();
  const result = await runEval(world, ALL_TASKS, answerFromWorld);
  await world.close();
  assertEquals(result.unapprovedActions, 0);
  assertEquals(result.provenanceFailures, 0);
  assertEquals(
    result.failed,
    0,
    `failing tasks: ${
      result.results.filter((r) => !r.pass).map((r) =>
        `${r.id} (${r.details.join("; ")})`
      ).join(" | ")
    }`,
  );
});
