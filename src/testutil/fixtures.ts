/**
 * Fixture facts modelling Ethan's World on Fri 2026-11-06 (the day the
 * v1 plan was written). Every fact carries provenance `test-fixture`.
 * `today` defaults to 2026-11-06; pass another date to shift the scenario.
 */
import type { Fact } from "../world/types.ts";

function fact(
  id: string,
  type: string,
  label: string,
  properties: Record<string, string>,
  retrievedAt = "2026-11-06T00:00:00Z",
): Fact {
  return {
    id,
    type,
    label,
    properties,
    provenance: { source: "test-fixture", retrievedAt },
  };
}

export function ethanFixtureFacts(): Fact[] {
  return [
    fact("twin:event/ernest-call", "Event", "Call with Ernest McCarter", {
      start: "2026-11-06T11:00:00-08:00",
      end: "2026-11-06T11:30:00-08:00",
      kind: "call",
      attendees: "Ernest McCarter",
    }),
    fact("twin:event/teaching-thu", "Event", "Teaching at codeCampus", {
      start: "2026-11-05T14:15:00-08:00",
      end: "2026-11-05T16:00:00-08:00",
      kind: "teaching",
      attendees: "codeCampus students",
    }),
    fact("twin:event/john-call", "Event", "Call with John Carlo Manuel", {
      start: "2026-11-06T15:00:00-08:00",
      end: "2026-11-06T15:45:00-08:00",
      kind: "call",
      attendees: "John Carlo Manuel",
    }),
    fact("twin:event/jeff-call", "Event", "Call with Jeff Kazzee", {
      start: "2026-11-06T15:30:00-08:00",
      end: "2026-11-06T16:00:00-08:00",
      kind: "call",
      attendees: "Jeff Kazzee",
    }),
    fact("twin:deadline/kgc-abstract", "Deadline", "KGC abstract draft", {
      description: "KGC abstract draft in Ethan's own voice",
      due: "2026-11-12",
    }),
    fact(
      "twin:deadline/mozilla",
      "Deadline",
      "Mozilla Human-Scale AI Incubator proposal",
      {
        description: "Mozilla Human-Scale AI Incubator proposal",
        due: "2026-11-20",
      },
    ),
    fact("twin:deadline/yc-decisions", "Deadline", "YC W27 decisions", {
      description: "YC W27 decisions",
      due: "2026-12-11",
    }),
    fact("twin:commitment/nbis-eapp", "Commitment", "NBIS eApp (SF-86)", {
      description: "Complete NBIS eApp sections 1–10 and certify",
      status: "open",
      due: "2026-11-08",
      nextAction: "Complete sections 1–10 in NBIS eApp",
    }),
    fact(
      "twin:commitment/vogel-docs",
      "Commitment",
      "Vogel citizenship documents",
      {
        description:
          "Send citizenship documents to Patrick Vogel via secure email",
        status: "open",
        nextAction:
          "Send driver's license + birth certificate via secure email",
      },
    ),
    fact("twin:commitment/drug-screen", "Commitment", "Drug screen retest", {
      description: "Quest Diagnostics drug screen retest",
      status: "done",
    }),
    fact("twin:thread/travis-long", "Thread", "Thread with Travis Long", {
      channel: "gmail",
      participants: "Travis Long",
      lastMessage:
        "Hi Ethan — would love to chat about the Founding Engineer role.",
      needsReply: "true",
    }),
    fact("twin:thread/purav-patel", "Thread", "Thread with Purav Patel", {
      channel: "gmail",
      participants: "Purav Patel",
      lastMessage: "See you Nov 11 at Airoma Cafe.",
      needsReply: "false",
    }),
    fact("twin:opportunity/rtx", "Opportunity", "RTX Effectors", {
      name: "RTX Effectors",
      stage: "offer-decided",
      nextAction: "Complete NBIS eApp",
      due: "2026-11-08",
    }),
    fact("twin:opportunity/gt", "Opportunity", "General Translation", {
      name: "General Translation",
      stage: "interview",
      nextAction: "Prep for Ernest call",
      due: "2026-11-06",
    }),
    fact("twin:opportunity/lmstudio", "Opportunity", "LM Studio", {
      name: "LM Studio",
      stage: "apply",
      nextAction: "Email resume to apply@lmstudio.ai",
    }),
    fact("twin:opportunity/benchmark", "Opportunity", "Benchmark Motion", {
      name: "Benchmark Motion",
      stage: "intro-call",
      nextAction: "Join Travis Long call Mon Nov 9, 8:30am PT",
      due: "2026-11-09",
    }),
    fact("twin:opportunity/eclerx", "Opportunity", "eClerx", {
      name: "eClerx",
      stage: "interview-round-1-done",
      nextAction: "Wait for Round 2 outcome",
    }),
    fact("twin:opportunity/intuit", "Opportunity", "Intuit", {
      name: "Intuit",
      stage: "referral-sent",
      nextAction: "Confirm posting with Akanksh",
    }),
    fact("twin:person/ernest-mccarter", "Person", "Ernest McCarter", {
      name: "Ernest McCarter",
      role: "VP of Engineering",
      org: "General Translation",
    }),
    fact("twin:person/travis-long", "Person", "Travis Long", {
      name: "Travis Long",
      role: "Founder, Autonomous Search",
      org: "Benchmark Motion",
    }),
  ];
}
