/**
 * Held-out correction tasks (correction-loop spec §8).
 *
 * Frozen before the build, never in the seed: five scenarios that prove
 * the acceptance criteria. These are NOT EvalTasks — a correction is a
 * procedure (apply, check the World, answer a later question), not a
 * question with substrings — so they are not part of HELD_OUT_TASKS and
 * are never written to eval-data/tasks.json. They run against a fresh
 * synthetic world per scenario, via `runCorrectionScenarios()`.
 *
 * Grounding: every fact corrected here is a SYNTHETIC_FACTS entry (see
 * src/eval/synthetic-world.ts), so the corrected and original values are
 * both known exactly.
 */
import { buildEveningSummary } from "../../agents/briefing.ts";
import { currentFacts } from "../../world/provenance.ts";
import {
  applyCorrection,
  applyProcedurePatch,
  resolveConflict,
  undoCorrection,
} from "../../agents/correction.ts";
import { answerFromWorld, AuditRecorder } from "../harness.ts";
import { seedSyntheticWorld } from "../synthetic-world.ts";
import type { EvalTask } from "../types.ts";
import type { Fact } from "../../world/types.ts";

export interface CorrectionScenarioResult {
  id: string;
  pass: boolean;
  details: string[];
}

export interface CorrectionScenario {
  id: string;
  description: string;
  source: string;
  run: () => Promise<CorrectionScenarioResult>;
}

const NOW = "2026-11-08T13:00:00.000Z";
const TODAY = "2026-11-08";

function result(
  id: string,
  checks: Array<[boolean, string]>,
): CorrectionScenarioResult {
  const details = checks.map(([ok, text]) => `${ok ? "ok" : "FAIL"}: ${text}`);
  return { id, pass: checks.every(([ok]) => ok), details };
}

function commitmentFact(
  id: string,
  description: string,
  status: string,
  source: string,
  retrievedAt: string,
): Fact {
  return {
    id,
    type: "Commitment",
    label: id,
    properties: { description, status },
    provenance: { source, retrievedAt },
  };
}

async function answerContains(
  world: Awaited<ReturnType<typeof seedSyntheticWorld>>,
  question: string,
  keywords: string[],
  expected: string,
  forbidden: string,
): Promise<[boolean, string]> {
  const task: EvalTask = {
    id: "corr-check",
    kind: "briefing",
    question,
    source: "correction scenario",
    keywords,
    expectedSubstrings: [expected],
  };
  const answer = await answerFromWorld(task, world, new AuditRecorder());
  const hasExpected = answer.text.includes(expected);
  const hasForbidden = answer.text.includes(forbidden);
  return [
    hasExpected && !hasForbidden,
    `"${question}" → contains "${expected}" (${hasExpected}), excludes "${forbidden}" (${!hasForbidden})`,
  ];
}

/** Spec §8.1: five Ethan corrections land as supersessions and win in later briefs. */
async function scenarioFiveCorrections(): Promise<CorrectionScenarioResult> {
  const world = await seedSyntheticWorld();
  const corrections: Array<{
    oldId: string;
    replacement: Fact;
    question: string;
    keywords: string[];
    expected: string;
    forbidden: string;
  }> = [
    {
      oldId: "twin:commitment/nbis-eapp",
      replacement: commitmentFact(
        "twin:commitment/nbis-eapp-v2",
        "SF-86 clearance application; case HRC12777765; complete sections 1-10",
        "done",
        `Ethan, in chat ${NOW}`,
        NOW,
      ),
      question: "What is the status of the NBIS eApp?",
      keywords: ["NBIS", "eApp"],
      expected: "done",
      forbidden: "outstanding",
    },
    {
      oldId: "twin:deadline/mozilla",
      replacement: {
        id: "twin:deadline/mozilla-v2",
        type: "Deadline",
        label: "Mozilla Human-Scale AI Incubator proposal",
        properties: {
          description:
            "Deadline Fri Nov 22, 2026, 11:59pm PT. Proposal draft, NOT submitted.",
          due: "2026-11-22T23:59:00-08:00",
        },
        provenance: { source: `Ethan, in chat ${NOW}`, retrievedAt: NOW },
      },
      question: "When is the Mozilla deadline?",
      keywords: ["Mozilla", "deadline"],
      expected: "2026-11-22",
      forbidden: "2026-11-20",
    },
    {
      oldId: "twin:deadline/techstars",
      replacement: {
        id: "twin:deadline/techstars-v2",
        type: "Deadline",
        label: "Techstars Spring 2027",
        properties: {
          description: "Deadline Wed Nov 20, 2026. Accelerator backup.",
          due: "2026-11-20",
        },
        provenance: { source: `Ethan, in chat ${NOW}`, retrievedAt: NOW },
      },
      question: "When is the Techstars deadline?",
      keywords: ["Techstars"],
      expected: "2026-11-20",
      forbidden: "2026-11-18",
    },
    {
      oldId: "twin:deadline/kiroween-credits",
      replacement: {
        id: "twin:deadline/kiroween-credits-v2",
        type: "Deadline",
        label: "Kiroween 2026 credits request",
        properties: {
          description:
            "Request 4,000 free Kiro credits by Tue Dec 3, 2026, 12:00pm PT.",
          due: "2026-12-03T12:00:00-08:00",
        },
        provenance: { source: `Ethan, in chat ${NOW}`, retrievedAt: NOW },
      },
      question: "When is the Kiroween credits request due?",
      keywords: ["Kiroween", "credits"],
      expected: "2026-12-03",
      forbidden: "2026-12-01",
    },
    {
      oldId: "twin:commitment/drug-screen",
      replacement: commitmentFact(
        "twin:commitment/drug-screen-v2",
        "First Advantage retest completed Nov 5, 2026 at Quest Diagnostics Anaheim Ball; awaiting result",
        "completed, awaiting result",
        `Ethan, in chat ${NOW}`,
        NOW,
      ),
      question: "What is the drug screen status?",
      keywords: ["drug", "screen"],
      expected: "completed, awaiting result",
      forbidden: "outcome unknown",
    },
  ];
  const checks: Array<[boolean, string]> = [];
  for (const c of corrections) {
    const applied = await applyCorrection(world, {
      oldId: c.oldId,
      replacement: c.replacement,
      source: "ethan",
      author: "Ethan",
    }, { now: NOW });
    checks.push([
      applied.status === "applied",
      `correction to ${c.oldId} applied (${applied.status})`,
    ]);
    const old = await world.getFact(c.oldId);
    checks.push([
      old !== undefined,
      `old fact ${c.oldId} still retrievable in history`,
    ]);
    checks.push(
      await answerContains(
        world,
        c.question,
        c.keywords,
        c.expected,
        c.forbidden,
      ),
    );
  }
  await world.close();
  return result("corr-01-five-ethan-corrections", checks);
}

/** Spec §8.2: a sync import contradicts an older fact; the newer fact wins and the conflict surfaces. */
async function scenarioSyncContradiction(): Promise<CorrectionScenarioResult> {
  const world = await seedSyntheticWorld();
  const resolved = await resolveConflict(world, {
    oldId: "twin:commitment/nbis-eapp",
    candidate: commitmentFact(
      "twin:commitment/nbis-eapp-v2",
      "SF-86 clearance application; case HRC12777765; complete sections 1-10",
      "done",
      "gmail:msg-456",
      NOW,
    ),
    candidateAuthor: "twin",
    // Explicit `now`: the default is wall-clock time, which is a different
    // UTC date from the scenario's TODAY and would hide the audit fact
    // from the evening summary.
    now: NOW,
  });
  const checks: Array<[boolean, string]> = [];
  checks.push([
    resolved.status === "applied",
    `sync contradiction resolved as applied (${resolved.status})`,
  ]);
  const replacement = await world.getFact("twin:commitment/nbis-eapp-v2");
  checks.push([
    replacement?.properties["status"] === "done",
    "newer fact wins with its source cited",
  ]);
  checks.push([
    replacement?.provenance.source === "gmail:msg-456",
    "replacement cites its source (gmail:msg-456)",
  ]);
  const summary = await buildEveningSummary(world, TODAY);
  checks.push([
    summary.markdown.includes("Corrections & open questions"),
    "evening summary has a Corrections & open questions section",
  ]);
  checks.push([
    summary.markdown.includes("nbis-eapp-v2"),
    "evening summary surfaces the correction",
  ]);
  await world.close();
  return result("corr-02-sync-contradiction", checks);
}

/** Spec §8.3: a Twin-proposed procedure patch that would regress a held-out task is rejected in the fork. */
async function scenarioRegressingPatch(): Promise<CorrectionScenarioResult> {
  const world = await seedSyntheticWorld();
  // Seed a procedure in the synthetic world first (procedures are not
  // part of SYNTHETIC_FACTS).
  await world.addFacts([
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
  ]);
  const patch = await applyProcedurePatch(world, {
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
        // Current facts only: the superseded old step is still in the
        // fork by design (history is preserved), so a raw findFacts
        // would "find" the calendar step even after it was removed.
        const steps = currentFacts(
          await fork.findFacts({ type: "ProcedureStep" }),
        );
        const ok = steps.some((s) =>
          s.properties["description"] === "Check the calendar" &&
          s.properties["procedure"] === "twin:procedure/call-prep-v2"
        );
        return {
          pass: ok,
          details: ok ? [] : ["calendar step missing in fork"],
        };
      },
    }],
  }, { now: NOW });
  const checks: Array<[boolean, string]> = [];
  checks.push([
    patch.status === "rejected",
    `regressing patch rejected in the fork (${patch.status})`,
  ]);
  checks.push([
    (await world.getFact("twin:procedure/call-prep-v2")) === undefined,
    "rejected patch never promoted (no v2 in the World)",
  ]);
  const rejections = (await world.findFacts({ type: "Action" }))
    .filter((a) => a.properties["actionType"] === "procedure.patch.rejected");
  checks.push([rejections.length === 1, "rejection audited"]);
  await world.close();
  return result("corr-03-regressing-patch-rejected", checks);
}

/** Spec §8.4: undo in chat restores the previous head and states what it undid. */
async function scenarioUndo(): Promise<CorrectionScenarioResult> {
  const world = await seedSyntheticWorld();
  const checks: Array<[boolean, string]> = [];
  await applyCorrection(world, {
    oldId: "twin:deadline/mozilla",
    replacement: {
      id: "twin:deadline/mozilla-v2",
      type: "Deadline",
      label: "Mozilla Human-Scale AI Incubator proposal",
      properties: {
        description: "Deadline Fri Nov 22, 2026, 11:59pm PT.",
        due: "2026-11-22T23:59:00-08:00",
      },
      provenance: { source: `Ethan, in chat ${NOW}`, retrievedAt: NOW },
    },
    source: "ethan",
    author: "Ethan",
  }, { now: NOW });
  const undone = await undoCorrection(world, {
    factId: "twin:deadline/mozilla-v2",
    author: "Ethan",
  });
  checks.push([undone.status === "applied", `undo applied (${undone.status})`]);
  checks.push([
    undone.message.includes("Undid the correction") &&
    undone.message.includes("Nov 20"),
    "undo message states what it undid",
  ]);
  checks.push(
    await answerContains(
      world,
      "When is the Mozilla deadline?",
      ["Mozilla", "deadline"],
      "2026-11-20",
      "2026-11-22",
    ),
  );
  await world.close();
  return result("corr-04-undo", checks);
}

/** Spec §8.5: the guards — missing provenance, silent overwrite, unapproved ask-first. */
async function scenarioGuards(): Promise<CorrectionScenarioResult> {
  const world = await seedSyntheticWorld();
  const checks: Array<[boolean, string]> = [];
  // Missing provenance: blocked, never a fact.
  const noProv = commitmentFact(
    "twin:commitment/mozilla-v2",
    "Mozilla deadline Nov 22",
    "open",
    "",
    "",
  );
  const blocked = await applyCorrection(world, {
    oldId: "twin:deadline/mozilla",
    replacement: noProv,
    source: "ethan",
    author: "Ethan",
  }, { now: NOW });
  checks.push([
    blocked.status === "open-question",
    `missing-provenance write blocked (${blocked.status})`,
  ]);
  checks.push([
    (await world.getFact("twin:commitment/mozilla-v2")) === undefined,
    "blocked write never lands as a fact",
  ]);
  // Silent overwrite is impossible: supersede keeps the old fact.
  const applied = await applyCorrection(world, {
    oldId: "twin:deadline/mozilla",
    replacement: {
      id: "twin:deadline/mozilla-v2",
      type: "Deadline",
      label: "Mozilla Human-Scale AI Incubator proposal",
      properties: {
        description: "Deadline Fri Nov 22, 2026, 11:59pm PT.",
        due: "2026-11-22T23:59:00-08:00",
      },
      provenance: { source: `Ethan, in chat ${NOW}`, retrievedAt: NOW },
    },
    source: "ethan",
    author: "Ethan",
  }, { now: NOW });
  checks.push([applied.status === "applied", "correction applied"]);
  const old = await world.getFact("twin:deadline/mozilla");
  checks.push([
    old?.properties["due"] === "2026-11-20T23:59:00-08:00",
    "old fact still retrievable with its original content (no silent overwrite)",
  ]);
  // Ask-first without approval: not applied. With approval: applied + Approval fact.
  const world2 = await seedSyntheticWorld();
  const replacement = commitmentFact(
    "twin:commitment/nbis-eapp-v2",
    "NBIS eApp done",
    "done",
    "gmail:msg-999",
    NOW,
  );
  // Make the old fact Ethan-asserted so the write is ask-first.
  const oldFact = await world2.getFact("twin:commitment/nbis-eapp");
  if (oldFact) {
    await world2.addFacts([{
      ...oldFact,
      provenance: { source: `Ethan, in chat ${NOW}`, retrievedAt: NOW },
    }]);
  }
  const denied = await applyCorrection(world2, {
    oldId: "twin:commitment/nbis-eapp",
    replacement,
    source: "sync",
    author: "twin",
  }, { now: NOW });
  checks.push([
    denied.status === "ask-first",
    `unapproved ask-first write not applied (${denied.status})`,
  ]);
  checks.push([
    (await world2.getFact("twin:commitment/nbis-eapp-v2")) === undefined,
    "unapproved ask-first write left no fact",
  ]);
  const approved = await applyCorrection(world2, {
    oldId: "twin:commitment/nbis-eapp",
    replacement,
    source: "sync",
    author: "twin",
    approved: true,
  }, { now: NOW });
  checks.push([
    approved.status === "applied",
    "approved ask-first write applied",
  ]);
  checks.push([
    (await world2.findFacts({ type: "Approval" })).length === 1,
    "approved ask-first write recorded an Approval fact",
  ]);
  await world.close();
  await world2.close();
  return result("corr-05-guards", checks);
}

export const CORRECTION_SCENARIOS: CorrectionScenario[] = [
  {
    id: "corr-01-five-ethan-corrections",
    description:
      "Five Ethan corrections land as supersessions and win in later briefs (spec §8.1).",
    source: "SYNTHETIC_FACTS (synthetic-world.ts)",
    run: scenarioFiveCorrections,
  },
  {
    id: "corr-02-sync-contradiction",
    description:
      "A sync import contradicts an older fact; the newer fact wins and the conflict surfaces in the evening summary (spec §8.2).",
    source: "SYNTHETIC_FACTS (synthetic-world.ts)",
    run: scenarioSyncContradiction,
  },
  {
    id: "corr-03-regressing-patch-rejected",
    description:
      "A procedure patch that would regress a held-out task is rejected in the fork and never promoted (spec §8.3).",
    source: "synthetic procedure seeded in-scenario",
    run: scenarioRegressingPatch,
  },
  {
    id: "corr-04-undo",
    description:
      "Undo in chat restores the previous head and states what it undid (spec §8.4).",
    source: "SYNTHETIC_FACTS (synthetic-world.ts)",
    run: scenarioUndo,
  },
  {
    id: "corr-05-guards",
    description:
      "Zero writes with missing provenance, zero silent overwrites, zero unapproved ask-first writes (spec §8.5).",
    source: "SYNTHETIC_FACTS (synthetic-world.ts)",
    run: scenarioGuards,
  },
];

/** Run every held-out correction scenario against a fresh synthetic world. */
export async function runCorrectionScenarios(): Promise<
  CorrectionScenarioResult[]
> {
  const results: CorrectionScenarioResult[] = [];
  for (const scenario of CORRECTION_SCENARIOS) {
    results.push(await scenario.run());
  }
  return results;
}
