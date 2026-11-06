/**
 * Shared eval types (plan §5, Phase 0 task 0.6).
 *
 * An EvalTask is one held-out (or smoke) item: a question plus a
 * deterministic verifier. Held-out here means the task DEFINITIONS were
 * frozen before any agent tuning and are never imported into any agent
 * prompt — not wazoobench-style train/held-out separation. Their answers
 * live in the seeded World; that is the point (see eval-data/README.md).
 */
import type { Citation } from "../world/types.ts";
import type {
  PermissionTier,
  TwinAction,
} from "../orchestrator/permissions.ts";

export type TaskKind = "briefing" | "draft" | "scheduling" | "smoke";

/** Result of running one task's verifier against an answer. */
export interface VerifierResult {
  pass: boolean;
  details: string[];
}

/** One claim in an answer, with its evidence attached. */
export interface AnswerClaim {
  text: string;
  citations: Citation[];
}

/** An external action an answerer attempted (recorded for the audit). */
export interface AttemptedAction {
  action: TwinAction;
  tier: PermissionTier;
}

/** What an answerer produces for one task. */
export interface Answer {
  text: string;
  claims: AnswerClaim[];
  attemptedActions: AttemptedAction[];
}

/**
 * One eval task.
 *
 * `verify`, when present, overrides the default substring check. The
 * default check requires every `expectedSubstrings` entry (case-insensitive)
 * to appear in the answer text and no `forbiddenSubstrings` entry to appear.
 * Draft tasks use `verifyDraftText` (see verifiers.ts); scheduling tasks use
 * `verifySchedulingAnswer`.
 */
export interface EvalTask {
  id: string;
  kind: TaskKind;
  /** The question / request, as the Twin would receive it. */
  question: string;
  /** Grounding source, e.g. "MEMORY.md — Commitments / RTX offer". */
  source: string;
  /** Keywords for World retrieval (search + findFacts). */
  keywords: string[];
  /** Ontology classes to also pull via findFacts, if any. */
  factTypes?: string[];
  /** Substrings that must appear in the answer (case-insensitive). */
  expectedSubstrings: string[];
  /** Substrings that must NOT appear in the answer. */
  forbiddenSubstrings?: string[];
  /** Draft tasks: the points the requester asked the reply to cover. */
  draftPoints?: string[];
  /** Scheduling tasks: candidate slots the answer must choose among. */
  candidates?: string[];
  /** Draft tasks: IDs that may legitimately appear (req/case numbers). */
  allowedIds?: string[];
  /** Draft tasks: email addresses that may legitimately appear. */
  allowedEmails?: string[];
  /** Draft tasks: dollar amounts that may legitimately appear. */
  allowedAmounts?: string[];
  verify?: (answer: Answer) => VerifierResult;
}

/** Per-task outcome from the harness. */
export interface TaskResult {
  id: string;
  kind: TaskKind;
  pass: boolean;
  details: string[];
  /** Claims in the answer with no citation (target: zero). */
  provenanceFailures: number;
  /** Actions attempted outside the read/draft tiers (target: zero). */
  unapprovedActions: number;
  durationMs: number;
  /** First 300 chars of the answer, for the report. */
  answerExcerpt: string;
}

/** Whole-run outcome from the harness. */
export interface HarnessResult {
  results: TaskResult[];
  total: number;
  passed: number;
  failed: number;
  passAt1: number;
  provenanceFailures: number;
  unapprovedActions: number;
  /** True when any unapproved action was attempted — the run FAILS. */
  failedRun: boolean;
}
