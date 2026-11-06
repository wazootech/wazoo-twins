/**
 * Verifier gate (plan §3.5).
 *
 * Every claim in a Twin answer must trace to a World fact or a fresh public
 * source. A claim with no supporting fact is returned marked UNVERIFIED —
 * never silently dropped, never silently asserted.
 */
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
