import { assert, assertEquals } from "@std/assert";
import { parseMemoryMarkdown, parsePersonFile } from "./memory-md.ts";

const NOW = "2026-11-06T12:00:00.000Z";

Deno.test("parseMemoryMarkdown: decision and deadline bullets classify with dates", () => {
  const text = [
    "## Facts",
    "- RTX Effectors offer decided Oct 12, 2026 over HWIL.",
    "- NBIS eApp due about Nov 8, 2026, complete sections 1-10.",
    "- Wazoo is a solo-founded project with no legal entity yet.",
    "- x",
  ].join("\n");
  const { facts, skipped, parsed } = parseMemoryMarkdown(
    text,
    "MEMORY.md",
    "memory",
    undefined,
    NOW,
  );
  assertEquals(parsed, 3);
  assertEquals(skipped, 0);
  const byType = new Map(facts.map((f) => [f.type, f]));
  assertEquals(byType.get("Decision")?.properties["decidedAt"], "2026-10-12");
  assertEquals(byType.get("Deadline")?.properties["due"], "2026-11-08");
  assertEquals(byType.get("Commitment")?.properties["status"], "noted");
  assert(facts.every((f) => f.provenance.source === "MEMORY.md"));
});

Deno.test("parseMemoryMarkdown: deadline uses the date nearest the keyword, not the log date", () => {
  const text = [
    "## Facts",
    "- CCPA request SENT Fri Nov 6, 2026, 2:53am PT. Confirmation due Fri Nov 20, 2026; full response due Mon Dec 21, 2026.",
  ].join("\n");
  const { facts } = parseMemoryMarkdown(
    text,
    "MEMORY.md",
    "memory",
    undefined,
    NOW,
  );
  assertEquals(facts.length, 1);
  assertEquals(facts[0].type, "Deadline");
  assertEquals(facts[0].properties["due"], "2026-11-20");
});

Deno.test("parseMemoryMarkdown: weak deadline words need a date in the same clause", () => {
  const text = [
    "## Facts",
    // Incidental "request" — log entries, not deadlines.
    "- Benchmark Motion Calendly checked Fri Nov 6, 2026 at Ethan's request for the earliest slot that does not conflict.",
    "- CCPA request drafted, superseding the earlier pending/unmade state (Nov 6, 2026): Ethan clarified he is not looking to sue.",
    "- CCPA request SENT Fri Nov 6, 2026, 2:53am PT, at Ethan's direction: sent message id 1a1b07e03f66de4e, verified in Gmail Sent.",
    // Weak keyword with the date in the same clause — a real deadline.
    "- Request 4,000 free Kiro credits on Devpost Resources tab by Tue Dec 1, 2026, 12:00pm PT.",
    // Real MEMORY.md text: no "due" word, relative deadline, "~Nov 8" is
    // the author's computed due date.
    '- RTX onboarding: NBIS eApp (SF-86) outstanding — original request Oct 28, 2026 (case HRC12777765) asked for completion within 4 days; 1st reminder arrived Wed Nov 4, again "within four (4) days" (so ~Nov 8).',
  ].join("\n");
  const { facts } = parseMemoryMarkdown(
    text,
    "MEMORY.md",
    "memory",
    undefined,
    NOW,
  );
  assertEquals(facts.length, 5);
  assertEquals(facts[0].type, "Commitment");
  assertEquals(facts[1].type, "Commitment");
  assertEquals(facts[2].type, "Commitment");
  assertEquals(facts[3].type, "Deadline");
  assertEquals(facts[3].properties["due"], "2026-12-01");
  assertEquals(facts[4].type, "Deadline");
  assertEquals(facts[4].properties["due"], "2026-11-08");
});

Deno.test("parseMemoryMarkdown: [event] bullets become Events with the file date", () => {
  const text = [
    "## Verified extraction",
    "- [event|high] On Nov 4, 2026, an Ernest interview prep Google Doc was created for Ethan.",
    "- [fact|medium] A guidance reply was drafted but NOT posted.",
    "  - claim: 12345",
  ].join("\n");
  const { facts, parsed } = parseMemoryMarkdown(
    text,
    "memory/2026-11-05.md",
    "daily",
    "2026-11-05",
    NOW,
  );
  assertEquals(parsed, 2);
  assertEquals(facts.length, 2);
  assertEquals(facts[0].type, "Event");
  assertEquals(facts[0].properties["start"], "2026-11-04");
  assertEquals(facts[1].type, "Commitment");
});

Deno.test("parseMemoryMarkdown: nested bullets and short lines are skipped, not guessed", () => {
  const text = [
    "## Facts",
    "- Real bullet with enough text to be a fact.",
    "  - nested sub-item, not a fact",
    "- ok",
  ].join("\n");
  const { facts, parsed } = parseMemoryMarkdown(
    text,
    "MEMORY.md",
    "memory",
    undefined,
    NOW,
  );
  assertEquals(parsed, 1);
  assertEquals(facts.length, 1);
});

Deno.test("parsePersonFile: builds a Person fact with name and contact", () => {
  const text = [
    "# John Carlo Manuel",
    "- Wazoo collaborator helping with developer relations — john@example.com",
  ].join("\n");
  const fact = parsePersonFile(
    text,
    "John Carlo Manuel",
    "memory/people/john-carlo-manuel.md",
    NOW,
  );
  assert(fact !== undefined);
  assertEquals(fact.type, "Person");
  assertEquals(fact.properties["name"], "John Carlo Manuel");
  assertEquals(fact.properties["contact"], "john@example.com");
  assertEquals(fact.id, "twin:person/john-carlo-manuel");
});
