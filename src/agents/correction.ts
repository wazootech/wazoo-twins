/**
 * Correction loop (correction-loop spec §2–§8; plan Phase 2, task 2.4).
 *
 * The Twin's internal-write path: the World becomes mutable, but only
 * through supersession, never silent overwrite. Three entry points:
 *
 * - `applyCorrection` — Ethan corrects the Twin, or a sync import brings a
 *   newer fact. The replacement supersedes the old fact; the old fact
 *   stays in history.
 * - `applyProcedurePatch` — a Twin-proposed procedure change, evaluated in
 *   a fork first (worlds-sdk-ts#232 pattern) and promoted only with no
 *   regression.
 * - `undoCorrection` — "undo that correction" in chat restores the
 *   previous head of the chain, as a correction itself.
 *
 * Approval: internal writes are auto when classified auto, ask-first when
 * the write contradicts a fact Ethan asserted directly (with no fresh
 * source), retracts a whole procedure, or is low-confidence (spec §3).
 * External writes are NOT in this slice — they stay approval-card only.
 *
 * "A fact Ethan asserted directly" is decided by the typed author field
 * on the fact's provenance (`author: "Ethan"`), populated at write time
 * by the correction loop (issue #6). The free-text check (source starts
 * with "Ethan") survives only as a migration fallback for facts written
 * before the field existed.
 */
import { SyntheticWorldClient } from "../eval/synthetic-world.ts";
import {
  classifyInternalWrite,
  type PermissionTier,
  requireInternalWrite,
} from "../orchestrator/permissions.ts";
import { gateFactWrite, openQuestionFact } from "../orchestrator/verifier.ts";
import { type CorrectionAuditKind, recordWriteAudit } from "../world/audit.ts";
import type { WorldClient } from "../world/client.ts";
import {
  authorFromSource,
  chainContaining,
  currentHead,
  history,
  supersede,
} from "../world/provenance.ts";
import type { Fact, FactAuthor, Iri } from "../world/types.ts";
import { claimFor } from "./common.ts";
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";

/** Where a correction came from. */
export type CorrectionOrigin = "ethan" | "sync" | "twin-proposal";

export interface CorrectionRequest {
  /** Fact being corrected. Omitted for a brand-new fact. */
  oldId?: Iri;
  /** The replacement fact, with provenance (source + retrievedAt required). */
  replacement: Fact;
  source: CorrectionOrigin;
  /** Who asserted the replacement: "Ethan", "twin", or a sub-agent name. */
  author: string;
  /** The write contradicts a fact Ethan asserted directly. */
  contradictsEthanAssertedFact?: boolean;
  /** The write deletes or retracts a whole procedure. */
  retractsWholeProcedure?: boolean;
  /** The verifier flagged this write as low-confidence. */
  lowConfidence?: boolean;
  /** Ethan approved an ask-first write. */
  approved?: boolean;
}

export type CorrectionStatus =
  | "applied"
  | "ask-first"
  | "blocked"
  | "open-question"
  | "rejected";

export interface CorrectionResult {
  status: CorrectionStatus;
  newFactId?: string;
  oldId?: string;
  /** Audit facts written for this correction (Action, plus Approval when approved). */
  auditIds: string[];
  /** What the Twin states about the outcome — the undo message lives here. */
  message: string;
  /** The question to ask Ethan, for ask-first and open-question outcomes. */
  question?: string;
  details?: string[];
}

/**
 * True when a fact was asserted directly by Ethan. Reads the typed
 * `provenance.author` field when present; facts written before the field
 * existed fall back to the old string-prefix convention (issue #6).
 */
export function assertedByEthan(fact: Fact): boolean {
  if (fact.provenance.author !== undefined) {
    return fact.provenance.author === "Ethan";
  }
  return authorFromSource(fact.provenance.source) === "Ethan";
}

/** One-line rendering of a fact for messages ("label: key=value; ..."). */
function describeFact(fact: Fact): string {
  const props = Object.entries(fact.properties)
    .filter(([k]) => k !== "supersededBy" && k !== "supersedesStatement")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return props ? `${fact.label}: ${props}` : fact.label;
}

async function auditCorrection(
  world: WorldClient,
  record: {
    actor: string;
    kind: CorrectionAuditKind;
    target: string;
    supersedes?: string;
    decision: "auto" | "approved";
    approvedBy?: string;
    outcome: string;
    at: string;
  },
): Promise<string[]> {
  const facts = await recordWriteAudit(
    world,
    { id: crypto.randomUUID(), ...record },
    { source: "twin:correction-loop", retrievedAt: record.at },
  );
  return facts.map((f) => f.id);
}

/**
 * Apply one correction. Returns ask-first (nothing written) when the
 * write needs Ethan's approval, open-question when the claim is
 * untraceable, blocked when it cannot land at all.
 */
export async function applyCorrection(
  world: WorldClient,
  req: CorrectionRequest,
  opts: { tier?: PermissionTier; now?: string } = {},
): Promise<CorrectionResult> {
  const now = opts.now ?? new Date().toISOString();
  const tier: PermissionTier = opts.tier ?? "approved";
  const allFacts = await world.findFacts({});

  // 1. Write gate (spec §2.2): an untraceable claim is BLOCKED, never a fact.
  const gate = gateFactWrite(req.replacement, allFacts);
  if (!gate.allowed) {
    const question = gate.openQuestion ??
      `Needs verification: ${req.replacement.label}`;
    const openFact = openQuestionFact(
      question,
      req.replacement.provenance.source || "twin:correction-loop",
      now,
    );
    await world.addFacts([openFact]);
    const auditIds = await auditCorrection(world, {
      actor: req.author,
      kind: "world.open-question",
      target: openFact.id,
      decision: "auto",
      outcome: `blocked: ${gate.reason ?? "untraceable claim"}`,
      at: now,
    });
    return {
      status: "open-question",
      newFactId: openFact.id,
      auditIds,
      message:
        `I could not verify "${req.replacement.label}", so I did not write it as a fact. I recorded it as an open question instead.`,
      question,
      details: gate.reason ? [gate.reason] : [],
    };
  }

  // 2. Classification (spec §3). A correction to a fact Ethan asserted
  // directly, with no fresh source, is ask-first even when the request
  // did not say so — the old fact's provenance is the evidence.
  const oldFact = req.oldId ? await world.getFact(req.oldId) : undefined;
  const contradictsEthan = req.contradictsEthanAssertedFact ??
    (oldFact !== undefined && assertedByEthan(oldFact) &&
      req.source !== "ethan");
  const classification = classifyInternalWrite({
    contradictsEthanAssertedFact: contradictsEthan,
    retractsWholeProcedure: req.retractsWholeProcedure ?? false,
    lowConfidence: req.lowConfidence ?? false,
    hasFreshSource: req.source === "ethan" || req.source === "sync",
  });
  if (classification === "ask-first" && !req.approved) {
    const question = oldFact
      ? `This would change "${describeFact(oldFact)}" to "${
        describeFact(req.replacement)
      }". Should I apply it?`
      : `Should I write "${describeFact(req.replacement)}" to the World?`;
    return {
      status: "ask-first",
      oldId: req.oldId,
      auditIds: [],
      message: question,
      question,
    };
  }

  // 3. Tier enforcement: internal writes need the approved tier, and
  // ask-first writes need Ethan's approval. Throws on violation.
  requireInternalWrite(tier, classification, req.approved ?? false);

  // 4. Resolve the current head of the chain (spec §2.1). A correction to
  // an already-superseded fact applies to the live head, not the stale id.
  let head: Fact | undefined;
  if (req.oldId) {
    head = currentHead(allFacts, req.oldId);
    if (!head) {
      return {
        status: "blocked",
        oldId: req.oldId,
        auditIds: [],
        message: `Cannot correct ${req.oldId}: no such fact in the World.`,
        details: [`no fact with id ${req.oldId}`],
      };
    }
  }

  // 5. Validate the supersession itself (provenance + distinct id).
  // The marker quads are written by the WorldClient; this call is the
  // validation gate, and it throws on a missing-provenance or same-id write.
  if (head) {
    try {
      supersede(head.id, req.replacement);
    } catch (err) {
      return {
        status: "blocked",
        oldId: head.id,
        auditIds: [],
        message: `Cannot correct ${head.id}: ${
          err instanceof Error ? err.message : String(err)
        }.`,
        details: [err instanceof Error ? err.message : String(err)],
      };
    }
    // The replacement links back to what it supersedes (spec §2.2).
    req.replacement.properties["supersedesStatement"] = head.id;
  }

  // 6. Apply: supersede, or add when this is a brand-new fact. The typed
  // author is stamped here, at write time (issue #6) — "who asserted this"
  // is recorded on the fact itself, not inferred later from the source.
  req.replacement.provenance.author = req.author as FactAuthor;
  if (head) {
    await world.supersede(head.id, req.replacement);
  } else {
    await world.addFacts([req.replacement]);
  }

  // 7. Audit: every write, auto or approved, is an Action fact (+ Approval
  // when an ask-first write was approved).
  const auditIds = await auditCorrection(world, {
    actor: req.author,
    kind: "world.correct",
    target: req.replacement.id,
    supersedes: head?.id,
    decision: classification === "ask-first" ? "approved" : "auto",
    approvedBy: classification === "ask-first" ? "Ethan" : undefined,
    outcome: head ? `applied — supersedes ${head.id}` : "applied — new fact",
    at: now,
  });

  return {
    status: "applied",
    newFactId: req.replacement.id,
    oldId: head?.id,
    auditIds,
    message: head
      ? `Corrected ${req.replacement.label}: superseded ${head.id} — the old fact stays in history.`
      : `Wrote new fact ${req.replacement.label} to the World.`,
  };
}

/**
 * Undo a correction in chat (spec §4). Restores the previous head of the
 * chain by superseding the current head with a copy of the previous head
 * — the undo is itself a correction, so the chain stays intact and the
 * undone version stays in history with its eval result.
 */
export async function undoCorrection(
  world: WorldClient,
  input: {
    /** Any fact id in the chain (head or older). */
    factId: Iri;
    author: string;
    approved?: boolean;
    tier?: PermissionTier;
    now?: string;
  },
): Promise<CorrectionResult> {
  const now = input.now ?? new Date().toISOString();
  const tier: PermissionTier = input.tier ?? "approved";
  const allFacts = await world.findFacts({});
  const chain = chainContaining(allFacts, input.factId);
  if (chain.length < 2) {
    return {
      status: "blocked",
      oldId: input.factId,
      auditIds: [],
      message:
        `Nothing to undo for ${input.factId} — it has never been corrected.`,
      details: [`chain length ${chain.length}`],
    };
  }
  const head = chain[chain.length - 1];
  const previous = chain[chain.length - 2];

  // Undoing a correction Ethan asserted is ask-first — unless Ethan
  // himself asked for the undo in chat. The Twin must not silently
  // override Ethan, but Ethan overriding his own correction is his call.
  const classification = classifyInternalWrite({
    contradictsEthanAssertedFact: assertedByEthan(head) &&
      input.author !== "Ethan",
    retractsWholeProcedure: false,
    lowConfidence: false,
    hasFreshSource: false,
  });
  if (classification === "ask-first" && !input.approved) {
    const question = `Undoing this would restore "${
      describeFact(previous)
    }" over "${describeFact(head)}". Should I undo it?`;
    return {
      status: "ask-first",
      oldId: head.id,
      auditIds: [],
      message: question,
      question,
    };
  }
  requireInternalWrite(tier, classification, input.approved ?? false);

  const restoration: Fact = {
    ...previous,
    id: `${previous.id}-undo-${crypto.randomUUID().slice(0, 8)}`,
    properties: { ...previous.properties },
    provenance: {
      source: input.author === "Ethan"
        ? `Ethan, in chat ${now}`
        : `twin:undo ${now}`,
      retrievedAt: now,
      author: input.author as FactAuthor,
    },
  };
  delete restoration.properties["supersededBy"];
  await world.supersede(head.id, restoration);
  const auditIds = await auditCorrection(world, {
    actor: input.author,
    kind: "world.undo",
    target: restoration.id,
    supersedes: head.id,
    decision: classification === "ask-first" ? "approved" : "auto",
    approvedBy: classification === "ask-first" ? "Ethan" : undefined,
    outcome: `undid correction — restored ${previous.id}`,
    at: now,
  });
  return {
    status: "applied",
    newFactId: restoration.id,
    oldId: head.id,
    auditIds,
    message: `Undid the correction to ${previous.label}: restored "${
      describeFact(previous)
    }" (was "${describeFact(head)}").`,
  };
}

// ---------------------------------------------------------------------------
// Conflict resolution (spec §5).
// ---------------------------------------------------------------------------

/**
 * Resolve a conflict between an existing fact and a candidate fact.
 * Ethan wins over any source; provenance recency wins for facts that
 * change over time; a fresh public source wins over a stale import. When
 * no rule resolves it, neither fact becomes current — an open question is
 * written and surfaced in the evening summary.
 */
export async function resolveConflict(
  world: WorldClient,
  input: {
    oldId: Iri;
    candidate: Fact;
    candidateAuthor: string;
    approved?: boolean;
    tier?: PermissionTier;
    now?: string;
  },
): Promise<CorrectionResult> {
  const now = input.now ?? new Date().toISOString();
  const oldFact = await world.getFact(input.oldId);
  if (!oldFact) {
    return {
      status: "blocked",
      oldId: input.oldId,
      auditIds: [],
      message:
        `Cannot resolve a conflict for ${input.oldId}: no such fact in the World.`,
      details: [`no fact with id ${input.oldId}`],
    };
  }
  const candidateIsEthan = input.candidateAuthor === "Ethan" ||
    assertedByEthan(input.candidate);
  const oldIsEthan = assertedByEthan(oldFact);
  if (oldIsEthan && !candidateIsEthan) {
    // Rule 2: Ethan wins. A non-Ethan candidate contradicting Ethan is
    // ask-first, never auto.
    return await applyCorrection(world, {
      oldId: input.oldId,
      replacement: input.candidate,
      source: "sync",
      author: input.candidateAuthor,
      contradictsEthanAssertedFact: true,
      approved: input.approved,
    }, { tier: input.tier, now });
  }
  if (candidateIsEthan) {
    return await applyCorrection(world, {
      oldId: input.oldId,
      replacement: input.candidate,
      source: "ethan",
      author: "Ethan",
      approved: input.approved,
    }, { tier: input.tier, now });
  }
  const candidateIsFresher =
    input.candidate.provenance.retrievedAt > oldFact.provenance.retrievedAt;
  const candidateIsPublic = /^https?:\/\//.test(
    input.candidate.provenance.source,
  );
  if (candidateIsFresher || candidateIsPublic) {
    // Rules 1 and 3: recency wins; a fresh public source wins over stale.
    return await applyCorrection(world, {
      oldId: input.oldId,
      replacement: input.candidate,
      source: "sync",
      author: input.candidateAuthor,
      approved: input.approved,
    }, { tier: input.tier, now });
  }
  // Rule 4: unresolvable — write neither as current, ask Ethan one question.
  const question = `Conflict on ${oldFact.label}: the World says "${
    describeFact(oldFact)
  }" [${oldFact.provenance.source}], but a newer import says "${
    describeFact(input.candidate)
  }" [${input.candidate.provenance.source}]. Which is right?`;
  const openFact = openQuestionFact(question, "twin:correction-loop", now);
  await world.addFacts([openFact]);
  const auditIds = await auditCorrection(world, {
    actor: input.candidateAuthor,
    kind: "world.open-question",
    target: openFact.id,
    decision: "auto",
    outcome: `unresolved conflict on ${input.oldId}`,
    at: now,
  });
  return {
    status: "open-question",
    newFactId: openFact.id,
    oldId: input.oldId,
    auditIds,
    message:
      `I found a conflict on ${oldFact.label} and could not resolve it, so I wrote neither value as current. I recorded it as an open question for the evening summary.`,
    question,
  };
}

// ---------------------------------------------------------------------------
// Procedure patches (spec §2.3–§2.4; worlds-sdk-ts#232 pattern).
// ---------------------------------------------------------------------------

export interface ProcedureStepInput {
  description: string;
  precondition?: string;
  expectedOutcome?: string;
  evidence?: string;
}

export interface RegressionCheck {
  name: string;
  check: (fork: WorldClient) => Promise<{ pass: boolean; details: string[] }>;
}

export interface ProcedurePatchRequest {
  procedureId: Iri;
  procedureName: string;
  /** The full new step set, in order. An empty set retracts the procedure. */
  steps: ProcedureStepInput[];
  /** Evidence supporting the patch (source strings, kept on the new version). */
  evidence: string[];
  source: string;
  author: string;
  regressionChecks: RegressionCheck[];
  lowConfidence?: boolean;
  approved?: boolean;
}

export interface ProcedurePatchResult extends CorrectionResult {
  /** The new procedure version id, when promoted. */
  versionId?: string;
  /** Regression check details from the fork eval. */
  evalDetails?: string[];
}

/** Build the new procedure version's facts (Procedure + steps as quads). */
function buildProcedureVersion(
  req: ProcedurePatchRequest,
  versionId: string,
  now: string,
): Fact[] {
  const provenance = { source: req.source, retrievedAt: now };
  const facts: Fact[] = [{
    id: versionId,
    type: "Procedure",
    label: req.procedureName,
    properties: {
      name: req.procedureName,
      description: req.procedureName,
      ...(req.evidence.length > 0 ? { evidence: req.evidence.join("; ") } : {}),
    },
    provenance,
  }];
  req.steps.forEach((step, i) => {
    facts.push({
      id: `${versionId}-step-${i + 1}`,
      type: "ProcedureStep",
      label: `${req.procedureName} — step ${i + 1}`,
      properties: {
        procedure: versionId,
        stepIndex: String(i + 1),
        description: step.description,
        ...(step.precondition ? { precondition: step.precondition } : {}),
        ...(step.expectedOutcome
          ? { expectedOutcome: step.expectedOutcome }
          : {}),
        ...(step.evidence ? { evidence: step.evidence } : {}),
      },
      provenance,
    });
  });
  return facts;
}

/**
 * Apply a procedure patch in a fork, run the regression checks, and
 * promote only on a per-item diff with no regression. The fork is a fresh
 * in-memory world seeded with the current facts; the real World is never
 * touched until every check passes.
 */
export async function applyProcedurePatch(
  world: WorldClient,
  req: ProcedurePatchRequest,
  opts: { tier?: PermissionTier; now?: string } = {},
): Promise<ProcedurePatchResult> {
  const now = opts.now ?? new Date().toISOString();
  const tier: PermissionTier = opts.tier ?? "approved";
  const allFacts = await world.findFacts({});
  const procedure = currentHead(allFacts, req.procedureId);
  if (!procedure) {
    return {
      status: "blocked",
      oldId: req.procedureId,
      auditIds: [],
      message:
        `Cannot patch procedure ${req.procedureId}: no such procedure in the World.`,
      details: [`no procedure with id ${req.procedureId}`],
    };
  }

  // Retracting a whole procedure is ask-first (spec §3).
  const classification = classifyInternalWrite({
    contradictsEthanAssertedFact: false,
    retractsWholeProcedure: req.steps.length === 0,
    lowConfidence: req.lowConfidence ?? false,
    hasFreshSource: true,
  });
  if (classification === "ask-first" && !req.approved) {
    return {
      status: "ask-first",
      oldId: req.procedureId,
      auditIds: [],
      message: req.steps.length === 0
        ? `This would retract the whole "${req.procedureName}" procedure. Should I retract it?`
        : `This procedure patch was flagged low-confidence. Should I apply it?`,
      question:
        `Apply the proposed change to procedure "${req.procedureName}"?`,
    };
  }
  requireInternalWrite(tier, classification, req.approved ?? false);

  const version = history(allFacts, req.procedureId).length + 1;
  const versionId = `${req.procedureId}-v${version}`;
  const newFacts = buildProcedureVersion(req, versionId, now);

  // Gate the new version: it must carry provenance and trace.
  for (const fact of newFacts) {
    const gate = gateFactWrite(fact, allFacts);
    if (!gate.allowed) {
      return {
        status: "blocked",
        oldId: req.procedureId,
        auditIds: [],
        message: `Cannot patch procedure ${req.procedureId}: ${
          gate.reason ?? "untraceable"
        }.`,
        details: gate.reason ? [gate.reason] : [],
      };
    }
  }

  // Fork eval: clone the World, apply the patch there, run the checks.
  const fork = new SyntheticWorldClient();
  await fork.addFacts(allFacts);
  const oldSteps = allFacts.filter((f) =>
    f.type === "ProcedureStep" &&
    f.properties["procedure"] === procedure.id
  );
  await fork.supersede(procedure.id, newFacts[0]);
  const newSteps = newFacts.slice(1);
  for (let i = 0; i < Math.max(oldSteps.length, newSteps.length); i++) {
    const oldStep = oldSteps[i];
    const newStep = newSteps[i];
    if (oldStep && newStep) {
      await fork.supersede(oldStep.id, newStep);
    } else if (newStep) {
      await fork.addFacts([newStep]);
    } else if (oldStep) {
      // A removed step is superseded by a retraction marker, never deleted.
      await fork.supersede(oldStep.id, {
        id: `${oldStep.id}-retracted`,
        type: "ProcedureStep",
        label: `${oldStep.label} (retracted)`,
        properties: {
          procedure: versionId,
          stepIndex: oldStep.properties["stepIndex"] ?? String(i + 1),
          description: `Retracted by ${versionId}`,
          status: "retracted",
        },
        provenance: { source: req.source, retrievedAt: now },
      });
    }
  }
  const evalDetails: string[] = [];
  let allPassed = true;
  for (const check of req.regressionChecks) {
    const result = await check.check(fork);
    evalDetails.push(
      `${check.name}: ${result.pass ? "pass" : "FAIL"}${
        result.details.length > 0 ? ` — ${result.details.join("; ")}` : ""
      }`,
    );
    if (!result.pass) allPassed = false;
  }

  if (!allPassed) {
    // Rejected in the fork: never promoted. The rejection is audited so
    // the failed version stays in history and is not re-proposed blindly.
    const auditIds = await auditCorrection(world, {
      actor: req.author,
      kind: "procedure.patch.rejected",
      target: versionId,
      supersedes: procedure.id,
      decision: "auto",
      outcome: `rejected in fork eval: ${evalDetails.join(" | ")}`,
      at: now,
    });
    return {
      status: "rejected",
      oldId: req.procedureId,
      auditIds,
      message:
        `Procedure patch ${versionId} was rejected in the fork eval and was not promoted.`,
      evalDetails,
      details: evalDetails,
    };
  }

  // Promote: apply the same version to the real World.
  await world.supersede(procedure.id, newFacts[0]);
  for (let i = 0; i < Math.max(oldSteps.length, newSteps.length); i++) {
    const oldStep = oldSteps[i];
    const newStep = newSteps[i];
    if (oldStep && newStep) {
      await world.supersede(oldStep.id, newStep);
    } else if (newStep) {
      await world.addFacts([newStep]);
    } else if (oldStep) {
      await world.supersede(oldStep.id, {
        id: `${oldStep.id}-retracted`,
        type: "ProcedureStep",
        label: `${oldStep.label} (retracted)`,
        properties: {
          procedure: versionId,
          stepIndex: oldStep.properties["stepIndex"] ?? String(i + 1),
          description: `Retracted by ${versionId}`,
          status: "retracted",
        },
        provenance: { source: req.source, retrievedAt: now },
      });
    }
  }
  const auditIds = await auditCorrection(world, {
    actor: req.author,
    kind: "procedure.patch",
    target: versionId,
    supersedes: procedure.id,
    decision: "auto",
    outcome: `promoted after fork eval passed: ${evalDetails.join(" | ")}`,
    at: now,
  });
  return {
    status: "applied",
    versionId,
    newFactId: versionId,
    oldId: req.procedureId,
    auditIds,
    message:
      `Procedure "${req.procedureName}" updated to ${versionId} — fork eval passed, no regression.`,
    evalDetails,
  };
}

// ---------------------------------------------------------------------------
// Sub-agent wrapper: the correction loop as a SubAgent the orchestrator
// can dispatch (plan §3.4). Input is a CorrectionRequest, an undo request,
// or a procedure-patch request, distinguished by `kind`.
//
// NOTE: the orchestrator loop still clamps tiers to the Phase 1 maximum
// ("draft"), so the correction agent only writes when invoked with an
// approved-tier context (direct invocation from the chat/service layer).
// Wiring it into the loop's planner is a follow-up, not this slice.
// ---------------------------------------------------------------------------

export type CorrectionAgentInput =
  | ({ kind: "correct" } & CorrectionRequest)
  | {
    kind: "undo";
    factId: Iri;
    author: string;
    approved?: boolean;
  }
  | ({ kind: "procedure-patch" } & ProcedurePatchRequest)
  | {
    kind: "sync-conflict";
    oldId: Iri;
    candidate: Fact;
    candidateAuthor: string;
    approved?: boolean;
  };

function isCorrectionAgentInput(input: unknown): input is CorrectionAgentInput {
  return input !== null && typeof input === "object" &&
    typeof (input as Record<string, unknown>)["kind"] === "string";
}

async function resultToAgentResult(
  result: CorrectionResult,
  agent: string,
  world: WorldClient,
): Promise<AgentResult> {
  // Cite the fact that was actually written, never a synthetic claim: a
  // claim must trace to a World fact, or it is not a claim at all.
  const claims = [];
  if (result.newFactId) {
    const fact = await world.getFact(result.newFactId);
    if (fact) claims.push(claimFor(fact, result.message));
  }
  return {
    agent,
    claims,
    summary: [result.message],
    notes: result.question ? [result.question] : [],
  };
}

export function createCorrectionAgent(): SubAgent {
  return {
    name: "correction",
    async run(input: unknown, ctx: AgentContext): Promise<AgentResult> {
      if (!isCorrectionAgentInput(input)) {
        return {
          agent: "correction",
          claims: [],
          summary: [],
          notes: [
            "Correction input needs a `kind`: correct, undo, procedure-patch, or sync-conflict.",
          ],
        };
      }
      const now = new Date().toISOString();
      try {
        if (input.kind === "correct") {
          const result = await applyCorrection(ctx.world, input, {
            tier: ctx.tier,
            now,
          });
          return await resultToAgentResult(result, "correction", ctx.world);
        }
        if (input.kind === "undo") {
          const result = await undoCorrection(ctx.world, {
            factId: input.factId,
            author: input.author,
            approved: input.approved,
            tier: ctx.tier,
            now,
          });
          return await resultToAgentResult(result, "correction", ctx.world);
        }
        if (input.kind === "procedure-patch") {
          const result = await applyProcedurePatch(ctx.world, input, {
            tier: ctx.tier,
            now,
          });
          return await resultToAgentResult(result, "correction", ctx.world);
        }
        const result = await resolveConflict(ctx.world, {
          oldId: input.oldId,
          candidate: input.candidate,
          candidateAuthor: input.candidateAuthor,
          approved: input.approved,
          tier: ctx.tier,
          now,
        });
        return await resultToAgentResult(result, "correction", ctx.world);
      } catch (err) {
        return {
          agent: "correction",
          claims: [],
          summary: [],
          notes: [
            `Correction failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ],
        };
      }
    },
  };
}

export const correctionAgent: SubAgent = createCorrectionAgent();
