/**
 * Verifier write-gate tests (correction-loop spec §2.2).
 *
 * A write with an untraceable claim is BLOCKED, not just marked.
 * UNVERIFIED claims become open questions, never facts.
 */
import { assert, assertEquals } from "@std/assert";
import { gateFactWrite, gateWrite, openQuestionFact } from "./verifier.ts";
import type { Fact } from "../world/types.ts";

const AT = "2026-11-08T12:00:00.000Z";

function fact(id: string, source: string): Fact {
  return {
    id,
    type: "Commitment",
    label: id,
    properties: { description: id, status: "open" },
    provenance: { source, retrievedAt: AT },
  };
}

const WORLD = [fact("twin:commitment/mozilla", "MEMORY.md — Mozilla")];

Deno.test("verifier: a claim citing an existing World fact passes the gate", () => {
  const result = gateWrite(
    {
      text: "Mozilla deadline is Nov 20",
      citations: [{
        factId: "twin:commitment/mozilla",
        source: "MEMORY.md — Mozilla",
      }],
    },
    WORLD,
  );
  assertEquals(result.allowed, true);
  assertEquals(result.blocked, false);
});

Deno.test("verifier: a claim citing a public URL passes the gate", () => {
  const result = gateWrite(
    {
      text: "KGC demo repo exists",
      citations: [{
        factId: "https://github.com/wazootech/kgc-demo",
        source: "https://github.com/wazootech/kgc-demo",
      }],
    },
    WORLD,
  );
  assertEquals(result.allowed, true);
});

Deno.test("verifier: a claim with no citations is blocked and becomes an open question", () => {
  const result = gateWrite(
    { text: "The deadline moved", citations: [] },
    WORLD,
  );
  assertEquals(result.allowed, false);
  assertEquals(result.blocked, true);
  assert(result.reason?.includes("untraceable"));
  assertEquals(result.openQuestion, "Needs verification: The deadline moved");
});

Deno.test("verifier: a claim citing a missing World fact is blocked", () => {
  const result = gateWrite(
    {
      text: "Something about a missing fact",
      citations: [{
        factId: "twin:commitment/does-not-exist",
        source: "twin:commitment/does-not-exist",
      }],
    },
    WORLD,
  );
  assertEquals(result.allowed, false);
  assertEquals(result.blocked, true);
});

Deno.test("verifier: a fact without provenance is blocked", () => {
  const bad = fact("twin:commitment/x", "");
  const result = gateFactWrite(bad, WORLD);
  assertEquals(result.allowed, false);
  assert(result.reason?.includes("missing provenance"));
  assert(result.openQuestion?.includes("no provenance recorded"));
});

Deno.test("verifier: a fact with a Gmail source passes — the source IS the trace", () => {
  const result = gateFactWrite(
    fact("twin:commitment/x", "gmail:msg-123"),
    WORLD,
  );
  assertEquals(result.allowed, true);
});

Deno.test("verifier: a fact with an Ethan chat source passes", () => {
  const result = gateFactWrite(
    fact("twin:commitment/x", `Ethan, in chat ${AT}`),
    WORLD,
  );
  assertEquals(result.allowed, true);
});

Deno.test("verifier: openQuestionFact is a Task with status open-question", () => {
  const q = openQuestionFact(
    "Needs verification: X?",
    "twin:correction-loop",
    AT,
  );
  assertEquals(q.type, "Task");
  assertEquals(q.properties["status"], "open-question");
  assertEquals(q.properties["question"], "Needs verification: X?");
  assertEquals(q.provenance.source, "twin:correction-loop");
});
