/**
 * Audit quads (plan §3.1, §3.5): every Twin run, action, and approval is
 * recorded in the World itself, so the audit trail is queryable with the
 * same SPARQL as everything else.
 *
 * NOTE (Nov 6, 2026, integration fix): Fact `type` is the SHORT class name
 * ("Run", "Action", "Approval"), matching every other Fact and what
 * `validateFact` accepts. An earlier version emitted full IRIs
 * (`Classes.Run`); the backend rejected those as unknown classes, which the
 * orchestrator worked around by normalizing in loop.ts. Short names are the
 * contract now; the loop normalization is retained as defense only.
 */
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
