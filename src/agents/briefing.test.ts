import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import {
  briefingAgent,
  buildEveningSummary,
  buildMorningBrief,
} from "./briefing.ts";

const TODAY = "2026-11-06";

Deno.test("briefing: morning brief lists today's events, 7-day deadlines, open items", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const brief = await buildMorningBrief(world, TODAY);
  assertStringIncludes(brief.markdown, "Call with Ernest McCarter");
  assertStringIncludes(brief.markdown, "11:00am");
  assertStringIncludes(brief.markdown, "KGC abstract draft — due 2026-11-12");
  assert(
    !brief.markdown.includes("Mozilla Human-Scale"),
    "Mozilla due Nov 20 is outside 7 days",
  );
  assert(
    !brief.markdown.includes("YC W27 decisions"),
    "YC due Dec 11 is outside 7 days",
  );
  assertStringIncludes(brief.markdown, "NBIS eApp (SF-86)");
  assertStringIncludes(brief.markdown, "Travis Long");
  assertStringIncludes(brief.markdown, "RTX Effectors");
  assertStringIncludes(brief.markdown, "General Translation");
  assert(brief.claims.length > 0);
  assert(brief.claims.every((c) => c.verified));
});

Deno.test("briefing: every brief line cites its source fact", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const brief = await buildMorningBrief(world, TODAY);
  const factLines = brief.markdown.split("\n").filter((l) =>
    l.startsWith("- ")
  );
  assert(factLines.length > 0);
  for (const line of factLines) {
    assert(line.includes("[test-fixture]"), `line missing citation: ${line}`);
  }
});

Deno.test("briefing: brief is correct with no model key (template fallback)", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const brief = await buildMorningBrief(world, TODAY);
  assertStringIncludes(brief.markdown, "Good morning, Ethan.");
  assertStringIncludes(brief.markdown, "Call with Ernest McCarter");
});

Deno.test("briefing: date-only events render no phantom time", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  await world.addFacts([{
    id: "twin:event/log-entry",
    type: "Event",
    label: "Blog ideas filed as GitHub issues",
    properties: { start: "2026-11-06", kind: "event" },
    provenance: { source: "test-fixture", retrievedAt: "2026-11-06T00:00:00Z" },
  }]);
  const brief = await buildMorningBrief(world, TODAY);
  assertStringIncludes(brief.markdown, "Blog ideas filed as GitHub issues");
  assert(
    !brief.markdown.includes("4:00pm Blog ideas"),
    "date-only event must not render a fabricated 4:00pm time",
  );
});

Deno.test("briefing: 'noted' commitments count as open", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  await world.addFacts([{
    id: "twin:commitment/noted-item",
    type: "Commitment",
    label: "Send Pioneer W-9",
    properties: { description: "Send Pioneer W-9", status: "noted" },
    provenance: { source: "test-fixture", retrievedAt: "2026-11-06T00:00:00Z" },
  }]);
  const brief = await buildMorningBrief(world, TODAY);
  assertStringIncludes(brief.markdown, "Send Pioneer W-9");
  assert(
    !brief.markdown.includes("No open commitments."),
    "a 'noted' commitment is an unresolved item, not 'no open commitments'",
  );
});

Deno.test("briefing: open commitments cap at 15 with a count line", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const extra = Array.from({ length: 20 }, (_, i) => ({
    id: `twin:commitment/extra-${i}`,
    type: "Commitment",
    label: `Extra open item ${i}`,
    properties: { description: `Extra open item ${i}`, status: "noted" },
    provenance: {
      source: "test-fixture",
      retrievedAt: "2026-11-06T00:00:00Z",
    },
  }));
  await world.addFacts(extra);
  const brief = await buildMorningBrief(world, TODAY);
  // 2 open fixture commitments + 20 extra = 22 open, 15 shown, 7 hidden.
  assertStringIncludes(brief.markdown, "…and 7 more open commitments.");
  const sectionLines = brief.markdown
    .split("## Open commitments")[1]
    .split("## ")[0]
    .split("\n")
    .filter((l) => l.startsWith("- "));
  assertEquals(sectionLines.length, 16);
});

Deno.test("briefing: evening summary reports still-open items", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const summary = await buildEveningSummary(world, TODAY);
  assertStringIncludes(summary.markdown, "No Twin runs recorded today.");
  assertStringIncludes(summary.markdown, "NBIS eApp (SF-86)");
  assertStringIncludes(summary.markdown, "Travis Long");
});

Deno.test("briefing: question mode answers from World facts, reports misses", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const ctx = { world, tier: "draft" as const, today: TODAY };
  const hit = await briefingAgent.run(
    { kind: "question", query: "NBIS eApp" },
    ctx,
  );
  assert(hit.claims.length > 0);
  assert(hit.claims.every((c) => c.verified));
  const miss = await briefingAgent.run({
    kind: "question",
    query: "Zorg Blorp",
  }, ctx);
  assertEquals(miss.claims, []);
  assert(miss.notes.some((n) => n.includes("No matching facts")));
});
