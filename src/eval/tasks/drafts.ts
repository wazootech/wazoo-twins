/**
 * Held-out draft tasks (plan Phase 0 task 0.6): 10 {thread context,
 * requested reply} tasks. Verifiers check that required facts are present
 * and that no dates/IDs/emails/amounts are invented: any such token in the
 * draft must be on the task's allow-list (see verifiers.ts).
 *
 * Grounding: every required fact traces to ~/MEMORY.md; the `source`
 * field names the section. Frozen before agent tuning; never imported
 * into any agent prompt. Drafts are for Ethan to review — never sent.
 */
import type { EvalTask } from "../types.ts";
import { verifyDraftText } from "../verifiers.ts";

function draftTask(task: EvalTask): EvalTask {
  return { ...task, verify: (answer) => verifyDraftText(answer, task) };
}

export const DRAFT_TASKS: EvalTask[] = [
  draftTask({
    id: "draft-01-travis-followup",
    kind: "draft",
    question:
      "Draft a follow-up reply to Travis Long (Benchmark Motion) asking for a 30-min call next week.",
    source: "MEMORY.md — Commitments / Benchmark Motion",
    keywords: ["Travis Long", "Benchmark Motion", "call"],
    factTypes: ["Person", "Event"],
    expectedSubstrings: ["30-min", "mornings", "1:30-4:30pm", "6-day", "comp"],
    draftPoints: [
      "Ask for a 30-min call next week, mornings PT",
      "Note the Tue/Thu 1:30-4:30pm PT teaching block is unavailable",
      "Ask about the 6-day onsite schedule",
      "Ask about the comp range and timeline",
    ],
    allowedEmails: ["travis@autonomoussearch.io"],
    allowedAmounts: ["$60M"],
  }),
  draftTask({
    id: "draft-02-openhack-ananay",
    kind: "draft",
    question:
      "Draft a reply to Ananay at OpenHack apologizing if the free-plan/Mythos request was off base and asking about a paid-tier trial to evaluate full scans.",
    source: "MEMORY.md — Facts / OpenHack evaluation",
    keywords: ["OpenHack", "Ananay", "Mythos"],
    factTypes: ["Thread"],
    expectedSubstrings: ["Ananay", "Mythos", "paid", "trial", "full scans"],
    draftPoints: [
      "Apologize if the free-plan / Mythos request was off base",
      "Ask about a paid-tier trial to evaluate full scans",
      "Note the demo booked for Fri Nov 6, 2:00-2:30pm PT was canceled",
    ],
    allowedEmails: ["ananay@openhack.com"],
  }),
  draftTask({
    id: "draft-03-purav-thanks",
    kind: "draft",
    question:
      "Draft a thank-you reply to Purav Patel sharing the wazoo.dev Clayzo result and confirming the Nov 11 meetup.",
    source: "MEMORY.md — Commitments / Purav Patel",
    keywords: ["Purav Patel", "Clayzo", "meetup"],
    factTypes: ["Person"],
    expectedSubstrings: ["Purav", "Clayzo", "Nov 11", "Airoma Cafe"],
    draftPoints: [
      "Thank Purav for the Nov 4 intro and Clayzo",
      "Share the wazoo.dev Clayzo result (PR #33)",
      "Confirm the meetup Wed Nov 11, 6:00-7:00pm PT at Airoma Cafe",
    ],
    allowedEmails: ["purav@clayzo.com"],
  }),
  draftTask({
    id: "draft-04-sarah-kate-clearance",
    kind: "draft",
    question:
      "Draft a reply to Sarah Kate Hostetter asking about interim vs final clearance timing and confirming the Effectors decision.",
    source: "MEMORY.md — Commitments / RTX offer",
    keywords: ["Sarah Kate Hostetter", "RTX", "Effectors"],
    factTypes: ["Person", "Commitment", "Decision"],
    expectedSubstrings: ["Effectors", "01866752", "clearance", "HWIL"],
    draftPoints: [
      "Ask about interim vs final clearance timing and whether the Jan 18, 2027 start depends on it",
      "Confirm taking Effectors over HWIL",
      "Confirm the HWIL offer req 01874565 withdrawal",
    ],
    allowedIds: ["01866752", "01874565"],
    allowedEmails: ["SarahKate.Hostetter@rtx.com"],
  }),
  draftTask({
    id: "draft-05-shelby-nbis",
    kind: "draft",
    question:
      "Draft a reply to Shelby Frazier asking for the status of the NBIS eApp.",
    source: "MEMORY.md — Commitments / RTX onboarding: NBIS eApp",
    keywords: ["NBIS", "eApp", "Shelby Frazier"],
    factTypes: ["Commitment"],
    expectedSubstrings: [
      "HRC12777765",
      "A00001315986",
      "Shelby Frazier",
      "Nov 8",
    ],
    draftPoints: [
      "Ask Shelby Frazier for the status of the NBIS eApp",
      "Reference case HRC12777765 and A00001315986",
      "Confirm the sections 1-10 scope and the ~Nov 8, 2026 due date",
    ],
    allowedIds: ["HRC12777765", "A00001315986"],
    allowedEmails: ["GSS-CPC@RTX.com"],
  }),
  draftTask({
    id: "draft-06-wanda-drug-screen",
    kind: "draft",
    question:
      "Draft a reply to Wanda Charles confirming the drug screen retest.",
    source:
      "MEMORY.md — Commitments / RTX onboarding: First Advantage drug screen",
    keywords: ["drug screen", "Quest", "Wanda Charles"],
    factTypes: ["Commitment"],
    expectedSubstrings: ["Wanda Charles", "Quest", "Anaheim Ball", "Nov 5"],
    draftPoints: [
      "Confirm the retest at Quest Diagnostics Anaheim Ball",
      "Reference the Thu Nov 5, 9:10am appointment",
      "Ask Wanda Charles about the extension if needed",
    ],
  }),
  draftTask({
    id: "draft-07-lm-studio-apply",
    kind: "draft",
    question:
      "Draft the application note Ethan will send himself to LM Studio (he writes it himself; the Twin only drafts).",
    source: "MEMORY.md — Commitments / LM Studio",
    keywords: ["LM Studio", "Full Stack", "apply"],
    factTypes: ["Opportunity"],
    expectedSubstrings: [
      "apply@lmstudio.ai",
      "Full Stack",
      "TypeScript",
      "résumé",
    ],
    draftPoints: [
      "Apply for the Full Stack Software Engineer role in NYC",
      "Note TypeScript/React, API backend, SDK, CLI, and SQL/data modeling experience",
      "Mention the sparql-engine CLI work",
      "Send with résumé to apply@lmstudio.ai",
    ],
    allowedEmails: ["apply@lmstudio.ai"],
    allowedAmounts: ["$150K", "$350K"],
  }),
  draftTask({
    id: "draft-08-john-blog-sync",
    kind: "draft",
    question:
      "Draft a message to John Carlo Manuel with the agenda for the next blog sync.",
    source: "MEMORY.md — Commitments / John Carlo Manuel",
    keywords: ["John Carlo Manuel", "blog"],
    factTypes: ["Person"],
    expectedSubstrings: ["John", "blog.wazoo.dev", "Wednesday", "fundamentals"],
    draftPoints: [
      "Propose the Wednesday 9:30am sync agenda",
      "Cover the blog.wazoo.dev launch and the fundamentals pillar",
      "Note the Sunday 6pm sync as the alternate",
    ],
  }),
  draftTask({
    id: "draft-09-vogel-docs",
    kind: "draft",
    question:
      "Draft a reply to Patrick Vogel about the citizenship verification documents.",
    source: "MEMORY.md — Commitments / RTX onboarding: empowerU / Vogel",
    keywords: ["Vogel", "citizenship", "RTX"],
    factTypes: ["Commitment"],
    expectedSubstrings: ["Vogel", "driver's license", "passport"],
    forbiddenSubstrings: ["attached", "attaching", "see attached"],
    draftPoints: [
      "Reply to Patrick Vogel about the citizenship verification",
      "Confirm a driver's license/state ID plus a birth certificate or US passport/passport card will be provided via the secure email flow",
      "Do not attach document images to regular email",
    ],
  }),
  draftTask({
    id: "draft-10-manmeet-caltrans",
    kind: "draft",
    question:
      "Draft a LinkedIn outreach message to Manmeet Kaur Phagurah asking about open Caltrans roles fitting a B.S. in computer science.",
    source: "MEMORY.md — People / Manmeet Kaur Phagurah",
    keywords: ["Manmeet", "Caltrans"],
    factTypes: ["Person"],
    expectedSubstrings: ["Manmeet", "Caltrans", "computer science"],
    draftPoints: [
      "Ask Manmeet Kaur Phagurah about open Caltrans roles fitting a B.S. in computer science",
      "Mention Ethan's software engineering background",
      "Ask whether a Technical Project Engineer path or software roles fit better",
    ],
  }),
];
