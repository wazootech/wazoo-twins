/**
 * Held-out briefing questions (plan Phase 0 task 0.6): 10 questions
 * answerable from the World — dates, owners, next actions.
 *
 * Grounding: every expected answer traces to ~/MEMORY.md or the
 * opportunity tracker; the `source` field names the section. Frozen before
 * agent tuning; never imported into any agent prompt.
 */
import type { EvalTask } from "../types.ts";

export const BRIEFING_TASKS: EvalTask[] = [
  {
    id: "brief-01-rtx-outstanding",
    kind: "briefing",
    question: "What RTX onboarding items are still outstanding?",
    source:
      "MEMORY.md — Commitments / RTX onboarding: NBIS eApp; Vogel docs; drug screen",
    keywords: ["RTX", "NBIS", "Vogel", "outstanding"],
    factTypes: ["Commitment"],
    expectedSubstrings: ["NBIS", "HRC12777765", "Vogel", "outstanding"],
  },
  {
    id: "brief-02-deadlines-week",
    kind: "briefing",
    question: "What deadlines fall in the next 7 days from Nov 6?",
    source: "MEMORY.md — Commitments / RTX onboarding: NBIS eApp; drug screen",
    keywords: ["deadline", "Nov", "due"],
    factTypes: ["Deadline", "Commitment"],
    expectedSubstrings: ["NBIS", "Nov 8", "Nov 5"],
  },
  {
    id: "brief-03-gt-next",
    kind: "briefing",
    question: "What is the next action for General Translation?",
    source: "MEMORY.md — Commitments / General Translation",
    keywords: ["General Translation", "Ernest", "next"],
    factTypes: ["Opportunity"],
    expectedSubstrings: ["Ernest", "Nov 6", "11:00"],
  },
  {
    id: "brief-04-lm-studio-next",
    kind: "briefing",
    question: "What is the next step for LM Studio?",
    source: "MEMORY.md — Commitments / LM Studio",
    keywords: ["LM Studio", "apply"],
    factTypes: ["Opportunity"],
    expectedSubstrings: ["apply@lmstudio.ai", "Full Stack"],
  },
  {
    id: "brief-05-eclerx-status",
    kind: "briefing",
    question: "What is the status of the eClerx interview process?",
    source: "MEMORY.md — Commitments / eClerx interview",
    keywords: ["eClerx", "interview"],
    factTypes: ["Opportunity"],
    expectedSubstrings: ["Anish Kothuri", "Nov 3", "outcome pending"],
  },
  {
    id: "brief-06-mozilla-blockers",
    kind: "briefing",
    question: "What is blocking the Mozilla proposal?",
    source: "MEMORY.md — Commitments / Mozilla Human-Scale AI Incubator",
    keywords: ["Mozilla", "blockers", "pilot"],
    factTypes: ["Deadline"],
    expectedSubstrings: ["applicant type", "pilot community"],
  },
  {
    id: "brief-07-john-sync",
    kind: "briefing",
    question: "When does Ethan sync with John Carlo Manuel?",
    source: "MEMORY.md — Commitments / John Carlo Manuel",
    keywords: ["John Carlo Manuel", "sync"],
    factTypes: ["Person"],
    expectedSubstrings: ["Wednesdays 9:30am", "Sundays 6pm", "blog.wazoo.dev"],
  },
  {
    id: "brief-08-benchmark-next",
    kind: "briefing",
    question: "What is the next step with Benchmark Motion / Travis Long?",
    source: "MEMORY.md — Commitments / Benchmark Motion",
    keywords: ["Benchmark Motion", "Travis Long", "next"],
    factTypes: ["Event", "Person"],
    expectedSubstrings: ["Nov 9", "8:30", "Travis Long"],
  },
  {
    id: "brief-09-kiroween-credits",
    kind: "briefing",
    question: "What does Ethan need to do for Kiroween credits, and by when?",
    source: "MEMORY.md — Facts / Kiroween 2026",
    keywords: ["Kiroween", "credits"],
    factTypes: ["Deadline"],
    expectedSubstrings: ["4,000", "Dec 1", "Devpost"],
  },
  {
    id: "brief-10-discord-status",
    kind: "briefing",
    question: "What is the status of the Discord data request?",
    source: "MEMORY.md — Facts / Discord account",
    keywords: ["Discord", "CCPA", "privacy"],
    factTypes: ["Commitment"],
    expectedSubstrings: ["privacy@discord.com", "Nov 20", "Dec 21"],
  },
];
