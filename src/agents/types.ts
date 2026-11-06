/**
 * Sub-agent contract (plan §3.4).
 *
 * Each sub-agent is a module with one job, a fixed tool set, and a fixed
 * output shape (structured + cited). Sub-agents never talk to Ethan
 * directly and never call each other — all coordination goes through the
 * orchestrator. Sub-agents never invent context: if the World doesn't have
 * it, they return an empty result with a note, and the orchestrator asks
 * Ethan or dispatches the research agent.
 */
import type { PermissionTier } from "../orchestrator/permissions.ts";
import type { CitedClaim } from "../world/types.ts";
import type { WorldClient } from "../world/client.ts";

/** What the orchestrator passes to a sub-agent. */
export interface AgentContext {
  world: WorldClient;
  /** The highest tier this agent may act at (Phase 1: "draft" at most). */
  tier: PermissionTier;
  /** ISO date the agent is reasoning about, e.g. "2026-11-06". */
  today: string;
}

/** What a sub-agent returns. */
export interface AgentResult {
  agent: string;
  /** Structured, cited claims. Every claim must carry citations or be marked unverified by the verifier. */
  claims: CitedClaim[];
  /** Human-readable summary lines (each derived from claims). */
  summary: string[];
  /** Notes for the orchestrator: missing context, ambiguities, follow-ups. */
  notes: string[];
}

/** A sub-agent implementation. */
export interface SubAgent {
  name: string;
  run(input: unknown, ctx: AgentContext): Promise<AgentResult>;
}
