/**
 * Permission tiers (plan §3.5; correction-loop spec §3).
 *
 * read -> draft -> approved -> auto (Phase 3 only).
 * A sub-agent cannot escalate its own tier. Phase 1 runs at read/draft
 * only: no external action is permitted at all. Phase 2 adds internal
 * World writes at the "approved" tier: auto writes are audited, ask-first
 * writes need Ethan's approval, and external writes always need an
 * approval card on top of the tier — tier approval is not card approval.
 *
 * Forbidden always, at every tier, in v1: autonomous sends, money
 * movement, job applications, public posting.
 */

export type PermissionTier = "read" | "draft" | "approved" | "auto";

export const TIER_ORDER: PermissionTier[] = [
  "read",
  "draft",
  "approved",
  "auto",
];

/** Actions the Twin can ever be asked to do. */
export type TwinAction =
  | "world.read"
  | "world.write"
  | "world.write.internal"
  | "draft.create"
  | "gmail.send"
  | "calendar.create"
  | "github.write"
  | "money.move"
  | "job.apply"
  | "post.publish";

/** Actions that are forbidden at every tier in v1. */
export const FORBIDDEN_ALWAYS: ReadonlySet<TwinAction> = new Set([
  "money.move",
  "job.apply",
  "post.publish",
]);

/**
 * Minimum tier required for each action.
 *
 * `world.write` was "read" in Phase 1 — harmless then, because nothing
 * ever wrote, but wrong as a rule: a write is not a read. Phase 2 raises
 * it to "approved", the same tier as `world.write.internal`.
 */
export const ACTION_MIN_TIER: Record<TwinAction, PermissionTier> = {
  "world.read": "read",
  "world.write": "approved",
  "world.write.internal": "approved",
  "draft.create": "draft",
  "gmail.send": "approved",
  "calendar.create": "approved",
  "github.write": "approved",
  "money.move": "auto",
  "job.apply": "auto",
  "post.publish": "auto",
};

/** Phase 1 runs read-only: the highest tier any agent may hold. */
export const PHASE1_MAX_TIER: PermissionTier = "draft";

/** Phase 2: internal World writes are permitted; external writes still need a card. */
export const PHASE2_MAX_TIER: PermissionTier = "approved";

/** Clamp a tier to a maximum (the orchestrator clamps to the phase max). */
export function clampTier(
  tier: PermissionTier,
  maxTier: PermissionTier,
): PermissionTier {
  return TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(maxTier)
    ? maxTier
    : tier;
}

// ---------------------------------------------------------------------------
// Internal-write classification (correction-loop spec §3).
//
// Auto, audited: Ethan's corrections; Twin corrections from a fresh, cited
// source; procedure patches that pass eval in a fork.
// Ask first: a write that contradicts a fact Ethan asserted directly, with
// no fresh source; a write that deletes or retracts a whole procedure; any
// write the verifier flags as low-confidence.
// ---------------------------------------------------------------------------

export type InternalWriteClass = "auto" | "ask-first";

export interface InternalWriteInput {
  /** The write contradicts a fact Ethan asserted directly. */
  contradictsEthanAssertedFact: boolean;
  /** The write deletes or retracts a whole procedure. */
  retractsWholeProcedure: boolean;
  /** The verifier flagged this write as low-confidence. */
  lowConfidence: boolean;
  /** The write carries a fresh, cited source (not a stale import). */
  hasFreshSource: boolean;
}

/**
 * Classify an internal write. The Twin may change its own memory freely
 * with a full trail, but it may not silently override Ethan, and it may
 * not destroy knowledge it cannot rebuild.
 */
export function classifyInternalWrite(
  input: InternalWriteInput,
): InternalWriteClass {
  if (input.retractsWholeProcedure) return "ask-first";
  if (input.lowConfidence) return "ask-first";
  // Contradicting a fact Ethan asserted directly is ask-first, never auto
  // — spec §5 rule 2 ("Ethan wins over any other source, always") and the
  // spec §9 risk table. A fresh source does not override Ethan; it is the
  // evidence Ethan sees when he is asked.
  if (input.contradictsEthanAssertedFact) return "ask-first";
  return "auto";
}

/**
 * Enforce an internal write. Throws when the caller's tier is below
 * "approved", and when an ask-first write has not been approved by Ethan.
 * Sub-agents cannot escalate: they hold the tier they were given.
 */
export function requireInternalWrite(
  tier: PermissionTier,
  classification: InternalWriteClass,
  approved: boolean,
): void {
  requirePermission("world.write.internal", tier);
  if (classification === "ask-first" && !approved) {
    throw new Error(
      "permission denied: internal write is ask-first and has not been approved by Ethan",
    );
  }
}

/** Is `action` allowed at `tier`? Never true for forbidden actions. */
export function isActionAllowed(
  action: TwinAction,
  tier: PermissionTier,
): boolean {
  if (FORBIDDEN_ALWAYS.has(action)) return false;
  return TIER_ORDER.indexOf(tier) >=
    TIER_ORDER.indexOf(ACTION_MIN_TIER[action]);
}

/**
 * Enforce a permission check. Throws on denial so a violation can never
 * silently proceed. Call sites must catch and record the denial in the audit log.
 */
export function requirePermission(
  action: TwinAction,
  tier: PermissionTier,
): void {
  if (!isActionAllowed(action, tier)) {
    throw new Error(
      `permission denied: action "${action}" requires tier "${
        ACTION_MIN_TIER[action]
      }", current tier is "${tier}"`,
    );
  }
}
