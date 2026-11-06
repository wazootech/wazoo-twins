/**
 * Orchestrator loop (plan §3.3) — intent -> plan -> dispatch -> merge ->
 * verify -> act-or-ask -> audit.
 *
 * Bounds: max 3 rounds, max 10 tool calls (one sub-agent run = one call).
 * Sub-agents never call each other; all coordination goes through this loop.
 *
 * Phase 1 tier enforcement: the effective tier is clamped to
 * `PHASE1_MAX_TIER` ("draft"). External actions (send / file / create /
 * apply / publish) are never performed — the loop returns `needs-approval`
 * with an approval card and records the permission denial in its notes.
 *
 * Verification: claims are checked against World facts via `verifyClaims`.
 * Contract note — `verifier.ts` only knows World facts, but plan §3.3 says
 * a claim may also trace to "a fresh public source". Claims whose citations
 * are all public URLs (http(s) links returned by the research/GitHub agents
 * from live API responses) are therefore treated as traced to a public
 * source and kept verified, with their URLs retained as citations. A claim
 * with no citation at all is always UNVERIFIED, never asserted.
 *
 * Merge: duplicate claims (same text) are collapsed, keeping the copy whose
 * cited facts have the most recent provenance (`retrievedAt`).
 *
 * Audit: every run writes a Run fact and an Action fact via `audit.ts`
 * (provenance `twin:orchestrator`). An audit-write failure is recorded in
 * notes; it never fails the run.
 */
import { actionToFact, runToFact } from "../world/audit.ts";
import { provenance } from "../world/provenance.ts";
import type { Citation, CitedClaim, Fact } from "../world/types.ts";
import { briefingAgent } from "../agents/briefing.ts";
import { calendarAgent } from "../agents/calendar.ts";
import { githubAgent } from "../agents/github.ts";
import { inboxAgent } from "../agents/inbox.ts";
import { jobsAgent } from "../agents/jobs.ts";
import { researchAgent } from "../agents/research.ts";
import type { AgentContext, SubAgent } from "../agents/types.ts";
import {
  type PermissionTier,
  PHASE1_MAX_TIER,
  requirePermission,
  TIER_ORDER,
  type TwinAction,
} from "./permissions.ts";
import { type IntentKind, planIntent, type PlannedCall } from "./planner.ts";
import { verifyClaims } from "./verifier.ts";

export const MAX_ROUNDS = 3;
export const MAX_TOOL_CALLS = 10;

const DEFAULT_AGENTS: Record<string, SubAgent> = {
  briefing: briefingAgent,
  inbox: inboxAgent,
  calendar: calendarAgent,
  github: githubAgent,
  jobs: jobsAgent,
  research: researchAgent,
};

export interface OrchestratorOptions {
  /** Override the agent registry (used by tests to inject fakes). */
  agents?: Record<string, SubAgent>;
}

export interface OrchestratorResult {
  intent: string;
  kind: IntentKind;
  claims: CitedClaim[];
  summary: string[];
  notes: string[];
  /** "present" = read-only/draft result; "needs-approval" = external action requested; "ask" = missing context. */
  action: "present" | "needs-approval" | "ask";
  question?: string;
  approvalCard?: string;
  runId: string;
  actionIds: string[];
  rounds: number;
  toolCalls: number;
}

const EXTERNAL_ACTIONS: {
  pattern: RegExp;
  action: TwinAction;
  label: string;
}[] = [
  { pattern: /\bsend\b/, action: "gmail.send", label: "send email" },
  {
    pattern: /\b(file|submit)\b/,
    action: "github.write",
    label: "file/submit",
  },
  {
    pattern: /\b(book|create (an? )?(event|meeting|hold|issue))\b/,
    action: "calendar.create",
    label: "create calendar event",
  },
  {
    pattern: /\bapply\b/,
    action: "job.apply",
    label: "submit a job application",
  },
  {
    pattern: /\b(post|publish)\b/,
    action: "post.publish",
    label: "publish/post publicly",
  },
];

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

/** Latest `retrievedAt` among a claim's World citations ("" when none). */
async function latestRetrievedAt(
  claim: CitedClaim,
  ctx: AgentContext,
): Promise<string> {
  let latest = "";
  for (const c of claim.citations) {
    if (isUrl(c.factId)) continue;
    const fact = await ctx.world.getFact(c.factId);
    if (fact && fact.provenance.retrievedAt > latest) {
      latest = fact.provenance.retrievedAt;
    }
  }
  return latest;
}

/** Collapse duplicate claims, keeping the copy with the most recent provenance. */
async function mergeClaims(
  claims: CitedClaim[],
  ctx: AgentContext,
  notes: string[],
): Promise<CitedClaim[]> {
  const byText = new Map<string, CitedClaim>();
  for (const claim of claims) {
    const key = claim.text.trim().toLowerCase();
    const existing = byText.get(key);
    if (!existing) {
      byText.set(key, claim);
      continue;
    }
    const [a, b] = await Promise.all([
      latestRetrievedAt(existing, ctx),
      latestRetrievedAt(claim, ctx),
    ]);
    if (b > a) byText.set(key, claim);
    notes.push(
      `Merged duplicate claim, kept most recent provenance: "${
        claim.text.slice(0, 80)
      }"`,
    );
  }
  return [...byText.values()];
}

/** Verify merged claims: World citations via `verifyClaims`, URL-only citations via the public-source rule. */
async function verifyMergedClaims(
  claims: CitedClaim[],
  ctx: AgentContext,
): Promise<CitedClaim[]> {
  interface Split {
    text: string;
    worldCitations: Citation[];
    urlCitations: Citation[];
  }
  const splits: Split[] = claims.map((c) => ({
    text: c.text,
    worldCitations: c.citations.filter((x) => !isUrl(x.factId)),
    urlCitations: c.citations.filter((x) => isUrl(x.factId)),
  }));
  const factIds = [
    ...new Set(splits.flatMap((s) => s.worldCitations.map((x) => x.factId))),
  ];
  const facts = (await Promise.all(factIds.map((id) => ctx.world.getFact(id))))
    .filter((f): f is Fact => f !== undefined);
  const verification = verifyClaims(
    splits.filter((s) => s.worldCitations.length > 0)
      .map((s) => ({ text: s.text, citations: s.worldCitations })),
    facts,
  );
  const verifiedByText = new Map(verification.claims.map((c) => [c.text, c]));
  return splits.map((s) => {
    if (s.worldCitations.length === 0 && s.urlCitations.length > 0) {
      return { text: s.text, citations: s.urlCitations, verified: true };
    }
    if (s.worldCitations.length === 0) {
      return { text: s.text, citations: [], verified: false };
    }
    const v = verifiedByText.get(s.text);
    if (!v) {
      return {
        text: s.text,
        citations: [...s.worldCitations, ...s.urlCitations],
        verified: false,
      };
    }
    return {
      text: v.text,
      citations: [...v.citations, ...s.urlCitations],
      verified: v.verified,
    };
  });
}

export async function runIntent(
  intent: string,
  ctx: AgentContext,
  opts: OrchestratorOptions = {},
): Promise<OrchestratorResult> {
  const started = new Date().toISOString();
  const agents = { ...DEFAULT_AGENTS, ...(opts.agents ?? {}) };
  const notes: string[] = [];

  // Phase 1 tier clamp: no agent may hold a tier above "draft".
  const effectiveTier: PermissionTier =
    TIER_ORDER.indexOf(ctx.tier) > TIER_ORDER.indexOf(PHASE1_MAX_TIER)
      ? PHASE1_MAX_TIER
      : ctx.tier;
  if (effectiveTier !== ctx.tier) {
    notes.push(
      `Tier clamped to Phase 1 maximum "${PHASE1_MAX_TIER}" (requested "${ctx.tier}").`,
    );
  }
  const agentCtx: AgentContext = { ...ctx, tier: effectiveTier };

  // 1. Plan.
  const plan = planIntent(intent);

  // 2. Dispatch (bounded rounds + tool calls).
  let toolCalls = 0;
  let rounds = 0;
  const allClaims: CitedClaim[] = [];
  const summary: string[] = [];
  let pendingCalls: PlannedCall[] = plan.calls;
  let researchDispatched = plan.calls.some((c) => c.agent === "research");
  let followUpDone = false;
  while (
    rounds < MAX_ROUNDS && pendingCalls.length > 0 && toolCalls < MAX_TOOL_CALLS
  ) {
    rounds++;
    const roundNotes: string[] = [];
    for (const call of pendingCalls) {
      if (toolCalls >= MAX_TOOL_CALLS) {
        notes.push(
          `Tool-call cap reached (${MAX_TOOL_CALLS}); remaining calls skipped.`,
        );
        break;
      }
      const agent = agents[call.agent];
      if (!agent) {
        notes.push(`No agent named "${call.agent}" — call skipped.`);
        continue;
      }
      toolCalls++;
      try {
        const result = await agent.run(call.input, agentCtx);
        allClaims.push(...result.claims);
        summary.push(...result.summary);
        notes.push(...result.notes);
        roundNotes.push(...result.notes);
      } catch (err) {
        notes.push(
          `Agent "${call.agent}" failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    // One follow-up round at most: if a result reports missing context and
    // research has not run yet, dispatch it once with the original intent.
    const missingContext = roundNotes.some((n) =>
      /no .* (record|facts|results)|missing context/i.test(n)
    );
    if (
      missingContext && !followUpDone && !researchDispatched &&
      rounds < MAX_ROUNDS
    ) {
      followUpDone = true;
      researchDispatched = true;
      pendingCalls = [{ agent: "research", input: { query: intent } }];
    } else {
      pendingCalls = [];
    }
  }

  // 3. Merge (conflicts resolved by provenance recency).
  const merged = await mergeClaims(allClaims, ctx, notes);

  // 4. Verify (untraceable claims stay marked UNVERIFIED, never asserted).
  const claims = await verifyMergedClaims(merged, ctx);
  const unverifiedCount = claims.filter((c) => !c.verified).length;

  // 5. Act or ask.
  let action: OrchestratorResult["action"] = "present";
  let question: string | undefined;
  let approvalCard: string | undefined;
  const external = EXTERNAL_ACTIONS.find((e) =>
    e.pattern.test(intent.toLowerCase())
  );
  if (external) {
    action = "needs-approval";
    try {
      requirePermission(external.action, effectiveTier);
      approvalCard = `Approval requested: ${external.label} — "${intent}". ` +
        `Phase 1 cannot perform this yet; approval would be recorded and the action deferred to Phase 2.`;
    } catch (err) {
      notes.push(
        `Permission denied: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      approvalCard =
        `Approval required (not granted in Phase 1): ${external.label} — "${intent}". No external action was taken.`;
    }
  } else if (claims.length === 0) {
    action = "ask";
    question =
      `I don't have that in the World yet. Can you tell me more about "${intent}"?`;
  }

  // 6. Audit: Run + Action quads in the World itself.
  const ended = new Date().toISOString();
  const runId = crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const auditProvenance = provenance("twin:orchestrator", ended);
  // Contract note (Nov 6, 2026): `audit.ts` emits short class names
  // ("Run", "Action"), matching `validateFact`. The explicit `type`
  // overrides below are retained as defense only — they set the same value
  // `audit.ts` already produces, so audit quads land even if that file
  // regresses to full-IRI types.
  const runFact = {
    ...runToFact(
      {
        id: runId,
        agent: "orchestrator",
        task: intent.slice(0, 200),
        started,
        ended,
        outcome:
          `${action} — ${claims.length} claim(s), ${unverifiedCount} unverified, ${toolCalls} tool call(s)`,
      },
      auditProvenance,
    ),
    type: "Run",
  };
  const actionFact = {
    ...actionToFact(
      {
        id: actionId,
        actor: "orchestrator",
        actionType: action === "present"
          ? "present"
          : action === "needs-approval"
          ? "request-approval"
          : "ask",
        target: intent.slice(0, 200),
        at: ended,
      },
      auditProvenance,
    ),
    type: "Action",
  };
  let actionIds: string[] = [];
  try {
    await ctx.world.addFacts([runFact, actionFact]);
    actionIds = [runFact.id, actionFact.id];
  } catch (err) {
    notes.push(
      `Audit write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    intent,
    kind: plan.kind,
    claims,
    summary,
    notes,
    action,
    question,
    approvalCard,
    runId,
    actionIds,
    rounds,
    toolCalls,
  };
}
