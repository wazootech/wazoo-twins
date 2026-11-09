/**
 * Audit quads (plan §3.1, §3.5; correction-loop spec §6): every Twin run,
 * action, and approval is recorded in the World itself, so the audit trail
 * is queryable with the same SPARQL as everything else.
 *
 * NOTE (Nov 6, 2026, integration fix): Fact `type` is the SHORT class name
 * ("Run", "Action", "Approval"), matching every other Fact and what
 * `validateFact` accepts. An earlier version emitted full IRIs
 * (`Classes.Run`); the backend rejected those as unknown classes, which the
 * orchestrator worked around by normalizing in loop.ts. Short names are the
 * contract now; the loop normalization is retained as defense only.
 */
import type { WorldClient } from "./client.ts";
import type { Fact, Provenance } from "./types.ts";

export interface RunRecord {
  id: string;
  agent: string;
  task: string;
  started: string;
  ended: string;
  outcome: string;
}

export interface ActionRecord {
  id: string;
  actor: string;
  actionType: string;
  target: string;
  at: string;
  approvedBy?: string;
}

export interface ApprovalRecord {
  id: string;
  description: string;
  approvedBy: string;
  approvalDecision: "approved" | "denied";
  at: string;
}

export function runToFact(record: RunRecord, provenance: Provenance): Fact {
  return {
    id: `twin:run/${record.id}`,
    type: "Run",
    label: `${record.agent}: ${record.task}`,
    properties: {
      agent: record.agent,
      task: record.task,
      started: record.started,
      ended: record.ended,
      outcome: record.outcome,
    },
    provenance,
  };
}

export function actionToFact(
  record: ActionRecord,
  provenance: Provenance,
): Fact {
  return {
    id: `twin:action/${record.id}`,
    type: "Action",
    label: `${record.actor} ${record.actionType} ${record.target}`,
    properties: {
      actor: record.actor,
      actionType: record.actionType,
      target: record.target,
      at: record.at,
      ...(record.approvedBy ? { approvedBy: record.approvedBy } : {}),
    },
    provenance,
  };
}

export function approvalToFact(
  record: ApprovalRecord,
  provenance: Provenance,
): Fact {
  return {
    id: `twin:approval/${record.id}`,
    type: "Approval",
    label: `${record.approvalDecision}: ${record.description}`,
    properties: {
      description: record.description,
      approvedBy: record.approvedBy,
      approvalDecision: record.approvalDecision,
      at: record.at,
    },
    provenance,
  };
}

// ---------------------------------------------------------------------------
// Correction-loop write audit (spec §6).
//
// Every internal write produces an Action fact, and ask-first writes that
// were approved also produce an Approval fact. Auto writes record that
// they were auto under the tier rule (`approvedBy: "auto:internal-write"`),
// so "what did you change today?" has a cited answer for every write,
// including the ones that needed no card.
// ---------------------------------------------------------------------------

export type CorrectionAuditKind =
  | "world.correct"
  | "world.undo"
  | "procedure.patch"
  | "procedure.patch.rejected"
  | "world.open-question";

export interface CorrectionAuditRecord {
  id: string;
  /** Who made the write: "Ethan", "twin", or a named sub-agent. */
  actor: string;
  kind: CorrectionAuditKind;
  /** IRI of the fact that was written (or that was asked about). */
  target: string;
  /** IRI of the fact this write superseded, if any. */
  supersedes?: string;
  /** "auto" for auto-tier writes, "approved" for ask-first writes Ethan approved. */
  decision: "auto" | "approved";
  /** Who approved an ask-first write ("Ethan"); absent for auto writes. */
  approvedBy?: string;
  /** Free-form outcome, e.g. "applied", "rejected in fork: step missing". */
  outcome: string;
  at: string;
}

/**
 * Audit facts for one correction-loop write: an Action fact always, plus
 * an Approval fact when an ask-first write was approved. Returns the facts
 * to write (the caller writes them — audit.ts never writes by itself,
 * except through `recordWriteAudit` below).
 */
export function correctionAuditFacts(
  record: CorrectionAuditRecord,
  provenance: Provenance,
): Fact[] {
  const action = actionToFact(
    {
      id: record.id,
      actor: record.actor,
      actionType: record.kind,
      target: record.target,
      at: record.at,
      ...(record.decision === "approved" && record.approvedBy
        ? { approvedBy: record.approvedBy }
        : {}),
    },
    provenance,
  );
  // The supersession link and the outcome ride on the Action fact so the
  // audit query needs no join.
  if (record.supersedes) {
    action.properties["supersedesStatement"] = record.supersedes;
  }
  action.properties["outcome"] = record.outcome;
  if (record.decision === "approved") {
    return [
      action,
      approvalToFact(
        {
          id: `${record.id}-approval`,
          description: `${record.kind} ${record.target}`,
          approvedBy: record.approvedBy ?? "Ethan",
          approvalDecision: "approved",
          at: record.at,
        },
        provenance,
      ),
    ];
  }
  return [action];
}

/** Write a correction-loop audit record into the World. */
export async function recordWriteAudit(
  world: WorldClient,
  record: CorrectionAuditRecord,
  provenance: Provenance,
): Promise<Fact[]> {
  const facts = correctionAuditFacts(record, provenance);
  await world.addFacts(facts);
  return facts;
}
