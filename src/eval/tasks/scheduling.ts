/**
 * Held-out scheduling tasks (plan Phase 0 task 0.6): 5 {request,
 * constraints} tasks. Verifiers check that the teaching block (Tue/Thu
 * 1:30–4:30pm PT, MEMORY.md — Tue/Thu work block) is never violated and
 * that the proposed slot is one of the candidates.
 *
 * Grounding: the teaching block and every candidate's context trace to
 * ~/MEMORY.md; the `source` field names the section. Frozen before agent
 * tuning; never imported into any agent prompt.
 */
import type { EvalTask } from "../types.ts";
import { verifySchedulingAnswer } from "../verifiers.ts";

function schedulingTask(task: EvalTask): EvalTask {
  return { ...task, verify: (answer) => verifySchedulingAnswer(answer, task) };
}

export const SCHEDULING_TASKS: EvalTask[] = [
  schedulingTask({
    id: "sched-01-travis-call",
    kind: "scheduling",
    question: "Propose a 30-min call with Travis Long next week.",
    source: "MEMORY.md — Commitments / Benchmark Motion; Tue/Thu work block",
    keywords: ["teaching block", "Travis Long", "call"],
    factTypes: ["Event"],
    expectedSubstrings: ["Proposed:", "1:30", "4:30pm"],
    candidates: [
      "Tue Nov 10, 2026, 10:00am PT",
      "Tue Nov 10, 2026, 2:00pm PT",
      "Thu Nov 12, 2026, 11:00am PT",
      "Thu Nov 12, 2026, 3:00pm PT",
      "Wed Nov 11, 2026, 10:00am PT",
    ],
  }),
  schedulingTask({
    id: "sched-02-ernest-followup",
    kind: "scheduling",
    question: "Propose a follow-up call with Ernest McCarter next week.",
    source: "MEMORY.md — Commitments / General Translation; Tue/Thu work block",
    keywords: ["teaching block", "Ernest McCarter", "call"],
    factTypes: ["Event"],
    expectedSubstrings: ["Proposed:", "1:30", "4:30pm"],
    candidates: [
      "Tue Nov 10, 2026, 3:00pm PT",
      "Wed Nov 11, 2026, 11:00am PT",
      "Thu Nov 12, 2026, 2:00pm PT",
      "Fri Nov 13, 2026, 10:00am PT",
    ],
  }),
  schedulingTask({
    id: "sched-03-purav-meetup",
    kind: "scheduling",
    question: "Propose a time for the in-person meetup with Purav Patel.",
    source: "MEMORY.md — Commitments / Purav Patel; Tue/Thu work block",
    keywords: ["teaching block", "Purav Patel", "meetup"],
    factTypes: ["Event"],
    expectedSubstrings: ["Proposed:", "1:30", "4:30pm"],
    candidates: [
      "Tue Nov 10, 2026, 2:00pm PT",
      "Wed Nov 11, 2026, 6:00pm PT",
      "Thu Nov 12, 2026, 4:00pm PT",
      "Fri Nov 13, 2026, 6:00pm PT",
    ],
  }),
  schedulingTask({
    id: "sched-04-john-sync",
    kind: "scheduling",
    question: "Propose a time for the next sync with John Carlo Manuel.",
    source: "MEMORY.md — Commitments / John Carlo Manuel; Tue/Thu work block",
    keywords: ["teaching block", "John Carlo Manuel", "sync"],
    factTypes: ["Event"],
    expectedSubstrings: ["Proposed:", "1:30", "4:30pm"],
    candidates: [
      "Thu Nov 12, 2026, 3:00pm PT",
      "Sun Nov 8, 2026, 6:00pm PT",
      "Wed Nov 11, 2026, 9:30am PT",
    ],
  }),
  schedulingTask({
    id: "sched-05-peter-followup",
    kind: "scheduling",
    question: "Propose a follow-up call with Peter Van Voorhis next week.",
    source: "MEMORY.md — Commitments / General Translation; Tue/Thu work block",
    keywords: ["teaching block", "Peter Van Voorhis", "call"],
    factTypes: ["Event"],
    expectedSubstrings: ["Proposed:", "1:30", "4:30pm"],
    candidates: [
      "Mon Nov 9, 2026, 10:00am PT",
      "Thu Nov 12, 2026, 2:00pm PT",
      "Wed Nov 11, 2026, 11:00am PT",
    ],
  }),
];
