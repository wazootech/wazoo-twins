/**
 * Correction-loop tests (correction-loop spec §2–§5, §8).
 *
 * Covers: Ethan corrections land as supersessions and win in later
 * answers; sync-import contradictions; regressing procedure patches
 * rejected in the fork; undo restores the previous head; the guards —
 * missing provenance, silent overwrite, unapproved ask-first writes.
 */
import { assert, assertEquals } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { currentHead, history } from "../world/provenance.ts";
import type { Fact } from "../world/types.ts";
import {
  applyCorrection,
  applyProcedurePatch,
  assertedByEthan,
  type CorrectionRequest,
  resolveConflict,
  undoCorrection,
} from "./correction.ts";

const NOW = "2026-11-08T12:00:00.000Z";
const LATER = "2026-11-08T13:00:00.000Z";

function commitment(
  id: string,
  description: string,
  status = "open",
  source = "MEMORY.md — test",
  retrievedAt = NOW,
): Fact {
  return {
    id,
    type: "Commitment",
    label: id,
    properties: { description, status },
    provenance: { source, retrievedAt },
  };
}

function ethanCorrection(
  oldId: string,
  replacement: Fact,
  over: Partial<CorrectionRequest> = {},
): CorrectionRequest {
  return {
    oldId,
    replacement,
    source: "ethan",
    author: "Ethan",
    ...over,
  };
}

Deno.test("correction: Ethan correction supersedes and the old fact stays in history", async () => {
  const world = createFakeWorldClient([
    commitment("twin:commitment/mozilla", "Mozilla deadline Nov 20", "open"),
  ]);
  const replacement = commitment(
    "twin:commitment/mozilla-v2",
    "Mozilla deadline Nov 22",
    "open",
    `Ethan, in chat ${NOW}`,
    LATER,
  );
  const result = await applyCorrection(
    world,
    ethanCorrection("twin:commitment/mozilla", replacement),
    { now: LATER },
  );
  assertEquals(result.status, "applied");
  assertEquals(result.newFactId, "twin:commitment/mozilla-v2");
  assertEquals(result.oldId, "twin:commitment/mozilla");
  assert(result.message.includes("Corrected"));
  // The old fact is still retrievable with its original content.
  const old = await world.getFact("twin:commitment/mozilla");
  assertEquals(old?.properties["description"], "Mozilla deadline Nov 20");
  const head = currentHead(
    await world.findFacts({}),
    "twin:commitment/mozilla",
  );
  assertEquals(head?.id, "twin:commitment/mozilla-v2");
  assertEquals(
    history(await world.findFacts({}), "twin:commitment/mozilla").length,
    2,
  );
  // The replacement links back to what it superseded (spec §2.2).
  const replacementFact = await world.getFact("twin:commitment/mozilla-v2");
  assertEquals(
    replacementFact?.properties["supersedesStatement"],
    "twin:commitment/mozilla",
  );
  // Audit: one Action fact, no Approval fact for an auto write.
  const actions = await world.findFacts({ type: "Action" });
  assertEquals(actions.length, 1);
  assertEquals(actions[0].properties["actionType"], "world.correct");
  assertEquals(
    await world.findFacts({ type: "Approval" }).then((f) => f.length),
    0,
  );
  await world.close();
});

Deno.test("correction: a write without provenance is blocked, never a fact", async () => {
  const world = createFakeWorldClient([
    commitment("twin:commitment/mozilla", "Mozilla deadline Nov 20"),
  ]);
  const replacement = commitment(
    "twin:commitment/mozilla-v2",
    "Mozilla deadline Nov 22",
  );
  replacement.provenance = { source: "", retrievedAt: "" };
  const result = await applyCorrection(
    world,
    ethanCorrection("twin:commitment/mozilla", replacement),
    { now: LATER },
  );
  assertEquals(result.status, "open-question");
  assertEquals(await world.getFact("twin:commitment/mozilla-v2"), undefined);
  // An open-question Task was written instead, and the old fact is untouched.
  const questions = (await world.findFacts({ type: "Task" }))
    .filter((f) => f.properties["status"] === "open-question");
  assertEquals(questions.length, 1);
  assertEquals(
    (await world.getFact("twin:commitment/mozilla"))?.properties["description"],
    "Mozilla deadline Nov 20",
  );
  await world.close();
});

Deno.test("correction: an untraceable claim is blocked and becomes an open question", async () => {
  const world = createFakeWorldClient();
  const replacement = commitment(
    "twin:commitment/x",
    "A claim citing a fact that does not exist",
    "open",
    "twin:commitment/does-not-exist",
  );
  const result = await applyCorrection(
    world,
    { replacement, source: "twin-proposal", author: "twin" },
    { now: LATER },
  );
  assertEquals(result.status, "open-question");
  assertEquals(await world.getFact("twin:commitment/x"), undefined);
  assert(result.question?.startsWith("Needs verification"));
  await world.close();
});

Deno.test("correction: contradicting Ethan without approval is ask-first and writes nothing", async () => {
  const world = createFakeWorldClient([
    commitment(
      "twin:commitment/mozilla",
      "Mozilla deadline Nov 20",
      "open",
      `Ethan, in chat ${NOW}`,
    ),
  ]);
  assert(assertedByEthan((await world.getFact("twin:commitment/mozilla"))!));
  const replacement = commitment(
    "twin:commitment/mozilla-v2",
    "Mozilla deadline Nov 18",
    "open",
    "gmail:msg-999",
    LATER,
  );
  const result = await applyCorrection(
    world,
    {
      oldId: "twin:commitment/mozilla",
      replacement,
      source: "sync",
      author: "twin",
    },
    { now: LATER },
  );
  assertEquals(result.status, "ask-first");
  assert(result.question?.includes("Should I apply it?"));
  assertEquals(await world.getFact("twin:commitment/mozilla-v2"), undefined);
  assertEquals(
    await world.findFacts({ type: "Action" }).then((f) => f.length),
    0,
  );
  // With Ethan's approval the same write lands, with an Approval fact.
  const approved = await applyCorrection(
    world,
    {
      oldId: "twin:commitment/mozilla",
      replacement,
      source: "sync",
      author: "twin",
      approved: true,
    },
    { now: LATER },
  );
  assertEquals(approved.status, "applied");
  assertEquals(
    await world.findFacts({ type: "Approval" }).then((f) => f.length),
    1,
  );
  await world.close();
});

Deno.test("correction: correcting a missing fact is blocked", async () => {
  const world = createFakeWorldClient();
  const result = await applyCorrection(
    world,
    ethanCorrection(
      "twin:commitment/missing",
      commitment("twin:commitment/missing-v2", "x"),
    ),
    { now: LATER },
  );
  assertEquals(result.status, "blocked");
  await world.close();
});

Deno.test("correction: undo restores the previous head and states what it undid", async () => {
  const world = createFakeWorldClient([
    commitment("twin:commitment/mozilla", "Mozilla deadline Nov 20"),
  ]);
  await applyCorrection(
    world,
    ethanCorrection(
      "twin:commitment/mozilla",
      commitment(
        "twin:commitment/mozilla-v2",
        "Mozilla deadline Nov 22",
        "open",
        `Ethan, in chat ${NOW}`,
        LATER,
      ),
    ),
    { now: LATER },
  );
  const result = await undoCorrection(world, {
    factId: "twin:commitment/mozilla-v2",
    author: "Ethan",
  });
  assertEquals(result.status, "applied");
  assert(result.message.includes("Undid the correction"));
  assert(result.message.includes("Nov 20"));
  const head = currentHead(
    await world.findFacts({}),
    "twin:commitment/mozilla",
  );
  assertEquals(head?.properties["description"], "Mozilla deadline Nov 20");
  // The chain is intact: original, correction, undo = 3 links.
  assertEquals(
    history(await world.findFacts({}), "twin:commitment/mozilla").length,
    3,
  );
  await world.close();
});

Deno.test("correction: undo with nothing to undo is blocked", async () => {
  const world = createFakeWorldClient([
    commitment("twin:commitment/mozilla", "Mozilla deadline Nov 20"),
  ]);
  const result = await undoCorrection(world, {
    factId: "twin:commitment/mozilla",
    author: "Ethan",
  });
  assertEquals(result.status, "blocked");
  assert(result.message.includes("never been corrected"));
  await world.close();
});

Deno.test("correction: sync conflict — fresher source wins, Ethan wins over sync", async () => {
  const world = createFakeWorldClient([
    commitment(
      "twin:commitment/nbis-eapp",
      "NBIS eApp outstanding",
      "outstanding",
      "MEMORY.md — Commitments",
      NOW,
    ),
  ]);
  // A fresher sync import wins over the stale fact.
  const fresher = await resolveConflict(world, {
    oldId: "twin:commitment/nbis-eapp",
    candidate: commitment(
      "twin:commitment/nbis-eapp-v2",
      "NBIS eApp done",
      "done",
      "gmail:msg-456",
      LATER,
    ),
    candidateAuthor: "twin",
  });
  assertEquals(fresher.status, "applied");
  assertEquals(
    (await world.getFact("twin:commitment/nbis-eapp-v2"))?.properties["status"],
    "done",
  );
  // A non-Ethan candidate contradicting an Ethan-asserted fact is ask-first.
  const world2 = createFakeWorldClient([
    commitment(
      "twin:commitment/mozilla",
      "Mozilla deadline Nov 20",
      "open",
      `Ethan, in chat ${NOW}`,
      NOW,
    ),
  ]);
  const clash = await resolveConflict(world2, {
    oldId: "twin:commitment/mozilla",
    candidate: commitment(
      "twin:commitment/mozilla-v2",
      "Mozilla deadline Nov 18",
      "open",
      "gmail:msg-999",
      LATER,
    ),
    candidateAuthor: "twin",
  });
  assertEquals(clash.status, "ask-first");
  assertEquals(await world2.getFact("twin:commitment/mozilla-v2"), undefined);
  await world.close();
  await world2.close();
});

Deno.test("correction: unresolvable conflict writes an open question, neither fact current", async () => {
  const world = createFakeWorldClient([
    commitment(
      "twin:commitment/x",
      "Value A",
      "open",
      "MEMORY.md — test",
      LATER,
    ),
  ]);
  // Same retrievedAt, not a public source, not Ethan: no rule resolves it.
  const result = await resolveConflict(world, {
    oldId: "twin:commitment/x",
    candidate: commitment(
      "twin:commitment/x-v2",
      "Value B",
      "open",
      "gmail:msg-1",
      LATER,
    ),
    candidateAuthor: "twin",
  });
  assertEquals(result.status, "open-question");
  assertEquals(await world.getFact("twin:commitment/x-v2"), undefined);
  const questions = (await world.findFacts({ type: "Task" }))
    .filter((f) => f.properties["status"] === "open-question");
  assertEquals(questions.length, 1);
  assert(questions[0].properties["question"]?.includes("Conflict on"));
  await world.close();
});

function procedureWorld(): ReturnType<typeof createFakeWorldClient> {
  return createFakeWorldClient([
    {
      id: "twin:procedure/call-prep",
      type: "Procedure",
      label: "Call prep",
      properties: { name: "Call prep", description: "Call prep" },
      provenance: { source: "MEMORY.md — test", retrievedAt: NOW },
    },
    {
      id: "twin:procedure/call-prep-step-1",
      type: "ProcedureStep",
      label: "Call prep — step 1",
      properties: {
        procedure: "twin:procedure/call-prep",
        stepIndex: "1",
        description: "Check the calendar",
        precondition: "a call is scheduled",
        expectedOutcome: "conflicts known",
      },
      provenance: { source: "MEMORY.md — test", retrievedAt: NOW },
    },
    {
      id: "twin:procedure/call-prep-step-2",
      type: "ProcedureStep",
      label: "Call prep — step 2",
      properties: {
        procedure: "twin:procedure/call-prep",
        stepIndex: "2",
        description: "Read the thread",
        precondition: "a thread exists",
        expectedOutcome: "context known",
      },
      provenance: { source: "MEMORY.md — test", retrievedAt: NOW },
    },
  ]);
}

Deno.test("correction: a non-regressing procedure patch promotes after fork eval", async () => {
  const world = procedureWorld();
  const result = await applyProcedurePatch(world, {
    procedureId: "twin:procedure/call-prep",
    procedureName: "Call prep",
    steps: [
      {
        description: "Check the calendar",
        precondition: "a call is scheduled",
        expectedOutcome: "conflicts known",
      },
      {
        description: "Read the thread",
        precondition: "a thread exists",
        expectedOutcome: "context known",
      },
      {
        description: "Write three questions",
        precondition: "context known",
        expectedOutcome: "questions ready",
      },
    ],
    evidence: ["twin:procedure/call-prep-step-1"],
    source: "twin:procedure-patch",
    author: "twin",
    regressionChecks: [{
      name: "calendar-step-present",
      check: async (fork) => {
        const steps = await fork.findFacts({ type: "ProcedureStep" });
        const ok = steps.some((s) =>
          s.properties["description"] === "Check the calendar"
        );
        return {
          pass: ok,
          details: ok ? [] : ["calendar step missing in fork"],
        };
      },
    }],
  }, { now: LATER });
  assertEquals(result.status, "applied");
  assertEquals(result.versionId, "twin:procedure/call-prep-v2");
  const head = currentHead(
    await world.findFacts({}),
    "twin:procedure/call-prep",
  );
  assertEquals(head?.id, "twin:procedure/call-prep-v2");
  const steps = (await world.findFacts({ type: "ProcedureStep" }))
    .filter((s) => s.properties["procedure"] === "twin:procedure/call-prep-v2");
  assertEquals(steps.length, 3);
  const patchActions = (await world.findFacts({ type: "Action" }))
    .filter((a) => a.properties["actionType"] === "procedure.patch");
  assertEquals(patchActions.length, 1);
  await world.close();
});

Deno.test("correction: a regressing procedure patch is rejected in the fork, never promoted", async () => {
  const world = procedureWorld();
  const result = await applyProcedurePatch(world, {
    procedureId: "twin:procedure/call-prep",
    procedureName: "Call prep",
    steps: [
      {
        description: "Read the thread",
        precondition: "a thread exists",
        expectedOutcome: "context known",
      },
    ],
    evidence: ["twin:procedure/call-prep-step-1"],
    source: "twin:procedure-patch",
    author: "twin",
    regressionChecks: [{
      name: "calendar-step-present",
      check: async (fork) => {
        const steps = await fork.findFacts({ type: "ProcedureStep" });
        const ok = steps.some((s) =>
          s.properties["description"] === "Check the calendar" &&
          s.properties["procedure"]?.includes("call-prep-v2")
        );
        return {
          pass: ok,
          details: ok ? [] : ["calendar step missing in fork"],
        };
      },
    }],
  }, { now: LATER });
  assertEquals(result.status, "rejected");
  assert(
    result.evalDetails?.some((d) => d.includes("calendar-step-present: FAIL")),
  );
  // Never promoted: the live head is still v1, and no v2 procedure exists.
  const head = currentHead(
    await world.findFacts({}),
    "twin:procedure/call-prep",
  );
  assertEquals(head?.id, "twin:procedure/call-prep");
  assertEquals(await world.getFact("twin:procedure/call-prep-v2"), undefined);
  // The rejection itself is audited.
  const rejections = (await world.findFacts({ type: "Action" }))
    .filter((a) => a.properties["actionType"] === "procedure.patch.rejected");
  assertEquals(rejections.length, 1);
  await world.close();
});

Deno.test("correction: retracting a whole procedure is ask-first", async () => {
  const world = procedureWorld();
  const result = await applyProcedurePatch(world, {
    procedureId: "twin:procedure/call-prep",
    procedureName: "Call prep",
    steps: [],
    evidence: [],
    source: "twin:procedure-patch",
    author: "twin",
    regressionChecks: [],
  }, { now: LATER });
  assertEquals(result.status, "ask-first");
  assertEquals(await world.getFact("twin:procedure/call-prep-v2"), undefined);
  await world.close();
});
