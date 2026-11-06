import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createResearchAgent } from "../agents/research.ts";
import type { AgentResult } from "../agents/types.ts";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import { runIntent } from "./loop.ts";

const TODAY = "2026-11-06";

function ctx() {
  return {
    world: createFakeWorldClient(ethanFixtureFacts()),
    tier: "draft" as const,
    today: TODAY,
  };
}

Deno.test("loop: 'what's open?' returns verified claims and writes audit quads", async () => {
  const c = ctx();
  const before = await c.world.count();
  const result = await runIntent("what's open?", c);
  assert(result.claims.length > 0, "expected claims");
  assert(
    result.claims.every((cl) => cl.verified),
    "all claims should verify against World facts",
  );
  assertEquals(result.action, "present");
  assert(result.runId.length > 0);
  assertEquals(result.actionIds.length, 2);
  assertEquals(await c.world.count(), before + 2);
  const run = await c.world.getFact(result.actionIds[0]);
  assert(
    run !== undefined && (run.type === "Run" || run.type.endsWith("#Run")),
  );
});

Deno.test("loop: external send intent needs approval and performs nothing", async () => {
  const c = ctx();
  const result = await runIntent("send an email to Travis", c);
  assertEquals(result.action, "needs-approval");
  assert(result.approvalCard !== undefined);
  assert(result.notes.some((n) => n.includes("Permission denied")));
  assertEquals(
    result.claims.filter((cl) => cl.text.includes("sent")).length,
    0,
  );
});

Deno.test("loop: tier above draft is clamped to the Phase 1 maximum", async () => {
  const c = ctx();
  const result = await runIntent("what's open?", { ...c, tier: "auto" });
  assert(
    result.notes.some((n) => n.includes('clamped to Phase 1 maximum "draft"')),
  );
  assertEquals(result.action, "present");
});

Deno.test("loop: unknown intent with no World facts asks one question", async () => {
  const c = ctx();
  const result = await runIntent("flibberty gibbet zzz", c);
  assertEquals(result.action, "ask");
  assert(result.question !== undefined);
  assertStringIncludes(result.question, "flibberty gibbet zzz");
});

Deno.test("loop: missing context triggers one follow-up research round, bounded", async () => {
  const c = ctx();
  const research = createResearchAgent(() => Promise.resolve([]));
  const result = await runIntent("when is the Zorg Blorp thingamajig?", c, {
    agents: { research },
  });
  assertEquals(result.rounds, 2);
  assert(result.toolCalls <= 10);
  assert(result.notes.some((n) => n.includes("No public web results")));
});

Deno.test("loop: duplicate claims merge, keeping the most recent provenance", async () => {
  const c = ctx();
  const oldClaim = {
    text: "Shared claim",
    citations: [{
      factId: "twin:commitment/nbis-eapp",
      source: "test-fixture",
    }],
    verified: true,
  };
  const newerFact = {
    id: "twin:commitment/nbis-eapp-2",
    type: "Commitment",
    label: "NBIS eApp (SF-86)",
    properties: { description: "Complete NBIS eApp", status: "open" },
    provenance: { source: "test-fixture", retrievedAt: "2026-11-06T12:00:00Z" },
  };
  await c.world.addFacts([newerFact]);
  const agentA = {
    name: "a",
    run: (): Promise<AgentResult> =>
      Promise.resolve({
        agent: "a",
        claims: [oldClaim],
        summary: [],
        notes: ['No matching facts in the World for "deadline".'],
      }),
  };
  const agentB = {
    name: "b",
    run: (): Promise<AgentResult> =>
      Promise.resolve({
        agent: "b",
        claims: [{
          text: "Shared claim",
          citations: [{ factId: newerFact.id, source: "test-fixture" }],
          verified: true,
        }],
        summary: [],
        notes: [],
      }),
  };
  // agentA (briefing) reports missing context, so the loop dispatches agentB
  // (research) for one follow-up round; the merge then keeps one copy of the
  // duplicated text — the one with the most recent provenance.
  const result = await runIntent("when is the Mozilla deadline?", c, {
    agents: {
      briefing: agentA,
      research: agentB,
    },
  });
  // The merge keeps one copy of the duplicated text.
  const shared = result.claims.filter((cl) => cl.text === "Shared claim");
  assertEquals(shared.length, 1);
  assertEquals(shared[0].citations[0].factId, newerFact.id);
  assert(result.notes.some((n) => n.includes("Merged duplicate claim")));
});

Deno.test("loop: unverified claims are kept and labelled, never dropped", async () => {
  const c = ctx();
  const lyingAgent = {
    name: "briefing",
    run: (): Promise<AgentResult> =>
      Promise.resolve({
        agent: "briefing",
        claims: [{
          text: "Ethan owes $1M to Zorg",
          citations: [],
          verified: false,
        }],
        summary: [],
        notes: [],
      }),
  };
  const result = await runIntent("what do I owe?", c, {
    agents: { briefing: lyingAgent },
  });
  assertEquals(result.claims.length, 1);
  assertEquals(result.claims[0].verified, false);
  assertEquals(result.action, "present");
});
