/**
 * Permission tiers (plan §3.5).
 *
 * read -> draft -> approved -> auto (Phase 3 only).
 * A sub-agent cannot escalate its own tier. Phase 1 runs at read/draft
 * only: no external action is permitted at all.
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

/** Minimum tier required for each action. */
export const ACTION_MIN_TIER: Record<TwinAction, PermissionTier> = {
  "world.read": "read",
  "world.write": "read",
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
