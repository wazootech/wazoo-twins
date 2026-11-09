/**
 * Verifier gate (plan §3.5; correction-loop spec §2.2).
 *
 * Every claim in a Twin answer must trace to a World fact or a fresh public
 * source. A claim with no supporting fact is returned marked UNVERIFIED —
 * never silently dropped, never silently asserted.
 *
 * The write gate is stricter: a write with an untraceable claim is BLOCKED,
 * not just marked. UNVERIFIED claims may become open questions, never facts.
 * A claim traces when its citation names a World fact that exists, a
 * public URL, or any other source that names where the claim came from
 * (a Gmail message, a MEMORY.md reference, Ethan in chat). Only a claim
 * with no citation at all, or a citation to a World fact that does not
 * exist, is untraceable.
 */
import { provenanceErrors } from "../world/provenance.ts";
import type { Citation, CitedClaim, Fact } from "../world/types.ts";

export interface VerificationResult {
  claims: CitedClaim[];
  /** Count of claims that failed verification (must stay zero in eval). */
  unverifiedCount: number;
}

/**
 * Verify a list of claims against the facts they cite.
 * A claim is verified only if every citation names a fact present in `facts`.
 */
export function verifyClaims(
  claims: { text: string; citations: Citation[] }[],
  facts: Fact[],
): VerificationResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const verified: CitedClaim[] = claims.map((claim) => {
    const citationsPresent = claim.citations.filter((c) => byId.has(c.factId));
    const verified = claim.citations.length > 0 &&
      citationsPresent.length === claim.citations.length;
    return {
      text: claim.text,
      citations: citationsPresent,
      verified,
    };
  });
  return {
    claims: verified,
    unverifiedCount: verified.filter((c) => !c.verified).length,
  };
}

/** Render a claim for display: UNVERIFIED claims are labelled, never hidden. */
export function renderClaim(claim: CitedClaim): string {
  const sources = claim.citations.map((c) => c.source).join(", ");
  const suffix = sources ? ` [${sources}]` : "";
  return claim.verified
    ? `${claim.text}${suffix}`
    : `${claim.text} [UNVERIFIED]${suffix}`;
}

// ---------------------------------------------------------------------------
// Write gate (correction-loop spec §2.2).
// ---------------------------------------------------------------------------

export interface WriteGateResult {
  /** False when the write must not land as a fact. */
  allowed: boolean;
  /** True when the write was blocked (as opposed to never attempted). */
  blocked: boolean;
  /** Why the write was blocked, when blocked. */
  reason?: string;
  /**
   * The open-question text to write instead, when the claim is untraceable
   * but worth asking Ethan about. Never a fact — a Task with status
   * "open-question".
   */
  openQuestion?: string;
}

/**
 * True when a citation is a dangling World reference: it names a `twin:`
 * fact that is not present in `facts`. A citation is a trace when it
 * names a fact that exists, a public URL, or any other non-empty source
 * that names where the claim came from — a Gmail message id, a calendar
 * event, a GitHub URL, a MEMORY.md reference, or Ethan in chat. Those
 * sources ARE the trace; only a citation to a World fact that does not
 * exist is untraceable.
 */
function isTracedCitation(c: Citation, byId: Map<string, Fact>): boolean {
  if (!c.source.trim() && !c.factId.trim()) return false;
  const ref = c.factId.trim() || c.source.trim();
  // A dangling World reference is a `twin:` fact IRI (twin:<class>/<slug>)
  // for a fact that is not in the World. System sources such as
  // "twin:correction-loop" carry no "/" and name no fact, so they are not
  // references at all — they are the trace itself.
  if (ref.startsWith("twin:") && ref.includes("/") && !byId.has(ref)) {
    return false;
  }
  return true;
}

/**
 * Gate one write claim: the claim may land as a fact only when at least
 * one citation traces to a source (see `isTracedCitation`). A claim with
 * no citations, or only dangling World references, is blocked and becomes
 * an open question instead.
 */
export function gateWrite(
  claim: { text: string; citations: Citation[] },
  facts: Fact[],
): WriteGateResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const traced = claim.citations.some((c) => isTracedCitation(c, byId));
  if (traced) return { allowed: true, blocked: false };
  return {
    allowed: false,
    blocked: true,
    reason:
      `untraceable claim — no World fact, public source, or named source behind "${
        claim.text.slice(0, 80)
      }"`,
    openQuestion: `Needs verification: ${claim.text}`,
  };
}

/**
 * Gate a whole fact before writing it: provenance must be present
 * (spec §2.2), and the fact's own provenance source must trace. A fact
 * whose source is a `twin:` IRI for a fact that is not in the World is
 * blocked; a fact with an empty source is blocked.
 */
export function gateFactWrite(fact: Fact, facts: Fact[]): WriteGateResult {
  const errors = provenanceErrors(fact);
  if (errors.length > 0) {
    return {
      allowed: false,
      blocked: true,
      reason: `missing provenance: ${errors.join("; ")}`,
      openQuestion:
        `Needs verification: ${fact.label} (no provenance recorded)`,
    };
  }
  return gateWrite(
    {
      text: fact.label,
      citations: [{
        factId: fact.provenance.source,
        source: fact.provenance.source,
      }],
    },
    facts,
  );
}

/**
 * Build the open-question Task fact for a blocked write (spec §2.2).
 * The question is never asserted as a fact — it is a Task with status
 * "open-question", surfaced in the evening summary until Ethan resolves it.
 */
export function openQuestionFact(
  question: string,
  source: string,
  at: string,
): Fact {
  return {
    id: `twin:task/open-question-${crypto.randomUUID()}`,
    type: "Task",
    label: question.slice(0, 120),
    properties: {
      description: question,
      status: "open-question",
      question,
    },
    provenance: { source, retrievedAt: at },
  };
}
