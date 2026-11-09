/**
 * Task-set index: the held-out set (Phase 0 task 0.6) and the smoke set
 * (Phase 0 task 0.5). Held-out tasks are frozen before agent tuning and
 * are never imported into any agent prompt.
 */
import type { EvalTask } from "../types.ts";
import { BRIEFING_TASKS } from "./briefing.ts";
import { CORRECTION_SCENARIOS, runCorrectionScenarios } from "./corrections.ts";
import { DRAFT_TASKS } from "./drafts.ts";
import { SCHEDULING_TASKS } from "./scheduling.ts";
import { SMOKE_TASKS } from "./smoke.ts";

export {
  BRIEFING_TASKS,
  CORRECTION_SCENARIOS,
  DRAFT_TASKS,
  runCorrectionScenarios,
  SCHEDULING_TASKS,
  SMOKE_TASKS,
};

/** Held-out set: 10 briefing + 10 draft + 5 scheduling = 25 tasks. */
export const HELD_OUT_TASKS: EvalTask[] = [
  ...BRIEFING_TASKS,
  ...DRAFT_TASKS,
  ...SCHEDULING_TASKS,
];

/** Everything: held-out set + smoke set = 45 tasks. */
export const ALL_TASKS: EvalTask[] = [...HELD_OUT_TASKS, ...SMOKE_TASKS];

/** Serializable form of a task (no `verify` function) for eval-data/tasks.json. */
export function toTaskJson(task: EvalTask): Record<string, unknown> {
  const { verify: _verify, ...rest } = task;
  return rest;
}
