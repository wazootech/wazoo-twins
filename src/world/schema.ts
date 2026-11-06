/**
 * Ontology for Ethan's World (plan §3.2).
 *
 * Namespace: https://wazoo.dev/twins# — the Twin's own ontology, kept
 * separate from Worlds' own vocabulary. Human-readable form lives in
 * docs/ontology.md, which Ethan owns.
 *
 * Every class lists its required properties. The seed validators enforce
 * these; a fact missing a required property is quarantined, never half-landed.
 */

export const TWIN_NS = "https://wazoo.dev/twins#";

export const Classes = {
  Person: `${TWIN_NS}Person`,
  Organization: `${TWIN_NS}Organization`,
  Commitment: `${TWIN_NS}Commitment`,
  Deadline: `${TWIN_NS}Deadline`,
  Task: `${TWIN_NS}Task`,
  Thread: `${TWIN_NS}Thread`,
  Decision: `${TWIN_NS}Decision`,
  Event: `${TWIN_NS}Event`,
  Opportunity: `${TWIN_NS}Opportunity`,
  Run: `${TWIN_NS}Run`,
  Action: `${TWIN_NS}Action`,
  Approval: `${TWIN_NS}Approval`,
} as const;

export type ClassName = keyof typeof Classes;

/** Property IRIs, grouped by the class they belong to. */
export const Props = {
  // Common
  name: `${TWIN_NS}name`,
  label: `${TWIN_NS}label`,
  description: `${TWIN_NS}description`,
  status: `${TWIN_NS}status`,
  // Person
  role: `${TWIN_NS}role`,
  org: `${TWIN_NS}org`,
  contact: `${TWIN_NS}contact`,
  relationship: `${TWIN_NS}relationship`,
  // Organization
  orgType: `${TWIN_NS}orgType`,
  // Commitment / Deadline / Task
  due: `${TWIN_NS}due`,
  consequence: `${TWIN_NS}consequence`,
  owner: `${TWIN_NS}owner`,
  nextAction: `${TWIN_NS}nextAction`,
  // Thread
  channel: `${TWIN_NS}channel`,
  participants: `${TWIN_NS}participants`,
  lastMessage: `${TWIN_NS}lastMessage`,
  needsReply: `${TWIN_NS}needsReply`,
  // Decision
  decidedAt: `${TWIN_NS}decidedAt`,
  rationale: `${TWIN_NS}rationale`,
  // Event
  start: `${TWIN_NS}start`,
  end: `${TWIN_NS}end`,
  attendees: `${TWIN_NS}attendees`,
  kind: `${TWIN_NS}kind`,
  // Opportunity
  stage: `${TWIN_NS}stage`,
  // Run / Action / Approval (audit)
  agent: `${TWIN_NS}agent`,
  task: `${TWIN_NS}task`,
  started: `${TWIN_NS}started`,
  ended: `${TWIN_NS}ended`,
  outcome: `${TWIN_NS}outcome`,
  actor: `${TWIN_NS}actor`,
  actionType: `${TWIN_NS}actionType`,
  target: `${TWIN_NS}target`,
  approvedBy: `${TWIN_NS}approvedBy`,
  at: `${TWIN_NS}at`,
  approvalDecision: `${TWIN_NS}approvalDecision`,
  // Provenance (Twin-level, per worlds-sdk-ts#221)
  source: `${TWIN_NS}source`,
  retrievedAt: `${TWIN_NS}retrievedAt`,
  supersededBy: `${TWIN_NS}supersededBy`,
} as const;

/** Required properties per class. Seed validation enforces these. */
export const RequiredProps: Record<ClassName, string[]> = {
  Person: ["name"],
  Organization: ["name"],
  Commitment: ["description", "status"],
  Deadline: ["description", "due"],
  Task: ["description", "status"],
  Thread: ["channel", "participants"],
  Decision: ["description", "decidedAt"],
  Event: ["start", "kind"],
  Opportunity: ["name", "stage"],
  Run: ["agent", "task", "started", "outcome"],
  Action: ["actor", "actionType", "target", "at"],
  Approval: ["description", "approvedBy", "approvalDecision", "at"],
};

/** Validate one fact against the ontology. Returns errors, if any. */
export function validateFact(
  fact: { type: string; label: string; properties: Record<string, string> },
): string[] {
  const errors: string[] = [];
  const required = (RequiredProps as Record<string, string[]>)[fact.type];
  if (!required) {
    errors.push(`unknown class: ${fact.type}`);
    return errors;
  }
  if (!fact.label.trim()) errors.push(`missing label for ${fact.type}`);
  for (const prop of required) {
    const value = fact.properties[prop];
    if (value === undefined || value.trim() === "") {
      errors.push(
        `missing required property "${prop}" for ${fact.type} "${fact.label}"`,
      );
    }
  }
  return errors;
}
