import { assert, assertEquals } from "@std/assert";
import {
  overlapsTeachingBlock,
  parseSlot,
  verifyDraftText,
  verifySchedulingAnswer,
  verifySubstrings,
} from "./verifiers.ts";
import type { Answer, EvalTask } from "./types.ts";

Deno.test("verifiers: verifySubstrings is case-insensitive and reports misses", () => {
  const ok = verifySubstrings("Dec 11, 2026", ["dec 11"]);
  assertEquals(ok.pass, true);
  const bad = verifySubstrings("Dec 11, 2026", ["Nov 20"], ["Dec 11"]);
  assertEquals(bad.pass, false);
  assertEquals(bad.details.length, 2);
});

Deno.test("verifiers: draft verifier accepts allow-listed IDs, emails, amounts", () => {
  const answer: Answer = {
    text:
      "Hi Sarah Kate, req 01866752, HRC12777765, write to SarahKate.Hostetter@rtx.com about $120K.",
    claims: [],
    attemptedActions: [],
  };
  const result = verifyDraftText(answer, {
    expectedSubstrings: ["Sarah Kate"],
    allowedIds: ["01866752", "HRC12777765"],
    allowedEmails: ["SarahKate.Hostetter@rtx.com"],
    allowedAmounts: ["$120K"],
  });
  assertEquals(result.pass, true);
});

Deno.test("verifiers: draft verifier catches an invented case number", () => {
  const answer: Answer = {
    text: "Your case is HRC99999999.",
    claims: [],
    attemptedActions: [],
  };
  const result = verifyDraftText(answer, {
    expectedSubstrings: ["case"],
    allowedIds: ["HRC12777765"],
  });
  assertEquals(result.pass, false);
  assert(result.details.some((d) => d.includes("HRC99999999")));
});

Deno.test("verifiers: draft verifier ignores cited grounding appendix, guards the draft", () => {
  const answer: Answer = {
    text:
      "Hi, confirming req 01874565.\n\nGrounded in:\nRTX offer: req 01866752, HRC12777765 [MEMORY.md]",
    claims: [],
    attemptedActions: [],
  };
  const result = verifyDraftText(answer, {
    expectedSubstrings: ["01874565"],
    allowedIds: ["01874565"],
  });
  assertEquals(result.pass, true);
});

Deno.test("verifiers: forbidden substrings are checked against the draft only, not the appendix", () => {
  // Regression test (draft-09, Nov 6, 2026): the draft says "Do not attach
  // document images" while a cited grounding fact mentions "all six files
  // attached". The forbidden word in the appendix must not fail the draft.
  const answer: Answer = {
    text:
      "Draft reply (for Ethan to review — NOT sent):\n- Do not attach document images to regular email\n\nGrounded in:\nWazoo banner email: all six files attached [MEMORY.md]",
    claims: [],
    attemptedActions: [],
  };
  const result = verifyDraftText(answer, {
    expectedSubstrings: ["Do not attach"],
    forbiddenSubstrings: ["attached", "attaching", "see attached"],
  });
  assertEquals(result.pass, true);
});

Deno.test("verifiers: forbidden substring in the draft itself still fails", () => {
  const answer: Answer = {
    text:
      "Draft reply (for Ethan to review — NOT sent):\n- See attached for the documents\n\nGrounded in:\nVogel: reply via secure email [MEMORY.md]",
    claims: [],
    attemptedActions: [],
  };
  const result = verifyDraftText(answer, {
    expectedSubstrings: ["See attached"],
    forbiddenSubstrings: ["attached", "attaching", "see attached"],
  });
  assertEquals(result.pass, false);
  assert(result.details.some((d) => d.includes("attached")));
});

Deno.test("verifiers: draft verifier catches an unlisted email and amount", () => {
  const answer: Answer = {
    text: "Email boss@example.com about the $999,000 fee.",
    claims: [],
    attemptedActions: [],
  };
  const result = verifyDraftText(answer, {
    expectedSubstrings: ["Email"],
    allowedEmails: ["apply@lmstudio.ai"],
    allowedAmounts: ["$150K"],
  });
  assertEquals(result.pass, false);
  assert(result.details.some((d) => d.includes("boss@example.com")));
  assert(result.details.some((d) => d.includes("$999,000")));
});

Deno.test("verifiers: parseSlot handles 12-hour times", () => {
  assertEquals(parseSlot("Tue Nov 10, 2026, 2:00pm PT"), {
    weekday: "tue",
    startMinutes: 840,
  });
  assertEquals(parseSlot("Mon Nov 9, 2026, 8:30am PT"), {
    weekday: "mon",
    startMinutes: 510,
  });
  assertEquals(parseSlot("Thu Nov 12, 2026, 12:00pm PT"), {
    weekday: "thu",
    startMinutes: 720,
  });
  assertEquals(parseSlot("no time here"), null);
});

Deno.test("verifiers: teaching block is Tue/Thu 1:30-4:30pm PT", () => {
  assertEquals(overlapsTeachingBlock("Tue Nov 10, 2026, 2:00pm PT"), true);
  assertEquals(overlapsTeachingBlock("Thu Nov 12, 2026, 4:00pm PT"), true);
  assertEquals(overlapsTeachingBlock("Tue Nov 10, 2026, 1:30pm PT"), true);
  assertEquals(overlapsTeachingBlock("Tue Nov 10, 2026, 10:00am PT"), false);
  assertEquals(overlapsTeachingBlock("Thu Nov 12, 2026, 5:00pm PT"), false);
  assertEquals(overlapsTeachingBlock("Wed Nov 11, 2026, 2:00pm PT"), false);
  assertEquals(overlapsTeachingBlock("Mon Nov 9, 2026, 3:00pm PT"), false);
});

Deno.test("verifiers: scheduling verifier rejects a teaching-block proposal", () => {
  const task: EvalTask = {
    id: "sched-test",
    kind: "scheduling",
    question: "q",
    source: "test",
    keywords: ["teaching block"],
    expectedSubstrings: ["Proposed:", "1:30", "4:30pm"],
    candidates: ["Tue Nov 10, 2026, 2:00pm PT", "Wed Nov 11, 2026, 10:00am PT"],
  };
  const bad: Answer = {
    text:
      "Proposed: Tue Nov 10, 2026, 2:00pm PT [x]\nRejected (teaching block Tue/Thu 1:30-4:30pm PT): none",
    claims: [],
    attemptedActions: [],
  };
  assertEquals(verifySchedulingAnswer(bad, task).pass, false);
  const good: Answer = {
    text:
      "Proposed: Wed Nov 11, 2026, 10:00am PT [x]\nRejected (teaching block Tue/Thu 1:30-4:30pm PT): Tue Nov 10, 2026, 2:00pm PT",
    claims: [],
    attemptedActions: [],
  };
  assertEquals(verifySchedulingAnswer(good, task).pass, true);
});

Deno.test("verifiers: scheduling verifier rejects a non-candidate proposal", () => {
  const task: EvalTask = {
    id: "sched-test-2",
    kind: "scheduling",
    question: "q",
    source: "test",
    keywords: ["teaching block"],
    expectedSubstrings: ["Proposed:"],
    candidates: ["Wed Nov 11, 2026, 10:00am PT"],
  };
  const answer: Answer = {
    text: "Proposed: Fri Nov 13, 2026, 9:00am PT",
    claims: [],
    attemptedActions: [],
  };
  assertEquals(verifySchedulingAnswer(answer, task).pass, false);
});
