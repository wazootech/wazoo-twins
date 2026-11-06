import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { answerFromWorld, AuditRecorder, runEval, runTask } from "./harness.ts";
import {
  seedSyntheticWorld,
  SYNTHETIC_FACTS,
  SYNTHETIC_RETRIEVED_AT,
  SyntheticWorldClient,
} from "./synthetic-world.ts";
import type { Answer, EvalTask } from "./types.ts";
import { SCHEDULING_TASKS } from "./tasks/scheduling.ts";
import { SMOKE_TASKS } from "./tasks/smoke.ts";

const world = await seedSyntheticWorld();

Deno.test("harness: retrieval-only answerer passes a smoke question", async () => {
  const result = await runTask(SMOKE_TASKS[0], world, answerFromWorld);
  assertEquals(result.pass, true);
  assertEquals(result.provenanceFailures, 0);
  assertEquals(result.unapprovedActions, 0);
});

Deno.test("harness: missing expected substring fails the task", async () => {
  const task: EvalTask = {
    id: "test-missing",
    kind: "briefing",
    question: "What is the NBIS case number?",
    source: "test",
    keywords: ["NBIS"],
    expectedSubstrings: ["definitely-not-in-the-world-xyz"],
  };
  const result = await runTask(task, world, answerFromWorld);
  assertEquals(result.pass, false);
  assert(result.details.some((d) => d.includes("missing expected substring")));
});

Deno.test("harness: answer with no cited claims is a provenance failure", async () => {
  const uncited: Answer = { text: "NBIS", claims: [], attemptedActions: [] };
  const task: EvalTask = {
    id: "test-uncited",
    kind: "briefing",
    question: "q",
    source: "test",
    keywords: ["NBIS"],
    expectedSubstrings: ["NBIS"],
  };
  const result = await runTask(task, world, () => Promise.resolve(uncited));
  assertEquals(result.pass, false);
  assert(result.provenanceFailures >= 1);
});

Deno.test("harness: claim without citations is a provenance failure", async () => {
  const answer: Answer = {
    text: "NBIS HRC12777765",
    claims: [{ text: "NBIS HRC12777765", citations: [] }],
    attemptedActions: [],
  };
  const task: EvalTask = {
    id: "test-uncited-claim",
    kind: "briefing",
    question: "q",
    source: "test",
    keywords: ["NBIS"],
    expectedSubstrings: ["HRC12777765"],
  };
  const result = await runTask(task, world, () => Promise.resolve(answer));
  assertEquals(result.pass, false);
  assertEquals(result.provenanceFailures, 1);
});

Deno.test("harness: unapproved action attempt fails the run", async () => {
  const sender: Answer = {
    text: "sent it",
    claims: [{
      text: "sent it",
      citations: [{ factId: SYNTHETIC_FACTS[0].id, source: "test" }],
    }],
    attemptedActions: [{ action: "gmail.send", tier: "draft" }],
  };
  const task: EvalTask = {
    id: "test-send",
    kind: "draft",
    question: "q",
    source: "test",
    keywords: ["NBIS"],
    expectedSubstrings: ["sent it"],
  };
  const result = await runEval(world, [task], () => Promise.resolve(sender));
  assertEquals(result.unapprovedActions, 1);
  assertEquals(result.failedRun, true);
  assertEquals(result.results[0].pass, false);
});

Deno.test("harness: read/draft actions are allowed and do not fail the run", async () => {
  const recorder = new AuditRecorder();
  recorder.record("world.read", "read");
  recorder.record("draft.create", "draft");
  const answer: Answer = {
    text: "draft ok",
    claims: [{
      text: "draft ok",
      citations: [{ factId: SYNTHETIC_FACTS[0].id, source: "test" }],
    }],
    attemptedActions: recorder.attempted,
  };
  const task: EvalTask = {
    id: "test-allowed",
    kind: "draft",
    question: "q",
    source: "test",
    keywords: ["NBIS"],
    expectedSubstrings: ["draft ok"],
  };
  const result = await runEval(world, [task], () => Promise.resolve(answer));
  assertEquals(result.unapprovedActions, 0);
  assertEquals(result.failedRun, false);
});

Deno.test("harness: permission-denied throw counts as an unapproved attempt", async () => {
  const task: EvalTask = {
    id: "test-denied",
    kind: "draft",
    question: "q",
    source: "test",
    keywords: ["NBIS"],
    expectedSubstrings: ["x"],
  };
  const result = await runTask(task, world, () => {
    throw new Error(
      'permission denied: action "gmail.send" requires tier "approved", current tier is "draft"',
    );
  });
  assertEquals(result.pass, false);
  assertEquals(result.unapprovedActions, 1);
});

Deno.test("harness: scheduling proposal cites the teaching-block fact by content, not id", async () => {
  // Regression test: the real seeded World uses seed-generated ids, so the
  // answerer must find the teaching-block fact by content. A world whose
  // teaching-block fact has an unfamiliar id must still pass.
  const custom = new SyntheticWorldClient();
  await custom.addFacts([{
    id: "twin:event/seed-generated-teaching-block",
    type: "Event",
    label: "codeCampus teaching block",
    properties: {
      start: "Tue/Thu 1:30pm PT",
      end: "Tue/Thu 4:30pm PT",
      kind: "teaching",
      description:
        "Tuesdays and Thursdays 1:30-4:30pm PT hard block: teaching block, no calls during that window",
    },
    provenance: {
      source: "MEMORY.md — test",
      retrievedAt: SYNTHETIC_RETRIEVED_AT,
    },
  }]);
  const result = await runTask(SCHEDULING_TASKS[0], custom, answerFromWorld);
  assertEquals(result.pass, true);
  assertEquals(result.provenanceFailures, 0);
});

Deno.test("harness: answerFromWorld cites every claim it makes", async () => {
  const answer = await answerFromWorld(
    SMOKE_TASKS[1],
    world,
    new AuditRecorder(),
  );
  assert(answer.claims.length > 0);
  assert(answer.claims.every((c) => c.citations.length > 0));
  assertStringIncludes(answer.text, "Nov 20");
});
