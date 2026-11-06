/**
 * Cron job definitions (plan §1.2, Phase 1 task 1.2).
 *
 * These are data, not a scheduler: the jobs are registered as runtime crons
 * by the parent agent (same pattern as the blog-ideas and NBIS-reminder
 * jobs). Each definition names the command that performs the work, so the
 * schedule is reviewable here and executable anywhere.
 *
 * Times are America/Los_Angeles.
 */
import type { PermissionTier } from "../orchestrator/permissions.ts";

export interface CronJobDefinition {
  /** Stable id, e.g. "twin-morning-brief". */
  id: string;
  /** Cron expression (5-field, local time). */
  schedule: string;
  /** What the job does. */
  description: string;
  /** Command run by the scheduler (run from the repo root). */
  command: string;
  /** Highest permission tier the job may act at. Phase 1: read/draft only. */
  maxTier: PermissionTier;
}

export const TWIN_CRON_JOBS: CronJobDefinition[] = [
  {
    id: "twin-morning-brief",
    schedule: "30 7 * * *",
    description:
      "Morning brief: today's calendar, deadlines in the next 7 days, unanswered outreach, outstanding items, one next action per open thread.",
    command: "deno task brief --kind morning",
    maxTier: "read",
  },
  {
    id: "twin-evening-summary",
    schedule: "0 18 * * *",
    description:
      "Evening summary: what moved today, what is still open, trackers updated.",
    command: "deno task brief --kind evening",
    maxTier: "read",
  },
  {
    id: "twin-overnight-sync",
    schedule: "0 3 * * *",
    description:
      "Overnight World sync: Gmail/Calendar/GitHub deltas imported, validated, indexed. Read-only sync.",
    command: "deno task seed --incremental",
    maxTier: "read",
  },
];
