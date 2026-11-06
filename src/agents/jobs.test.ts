import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import { jobsAgent } from "./jobs.ts";

const TODAY = "2026-11-06";
const ctx = () => ({
  world: createFakeWorldClient(ethanFixtureFacts()),
  tier: "draft" as const,
  today: TODAY,
});

Deno.test("jobs: one next action + deadline per opportunity", async () => {
  const result = await jobsAgent.run({}, ctx());
  assertEquals(result.claims.length, 6);
  assert(result.claims.every((c) => c.verified));
  assertStringIncludes(
    result.summary.join("\n"),
    "RTX Effectors (offer-decided): next action — Complete NBIS eApp, due 2026-11-08",
  );
  assertStringIncludes(
    result.summary.join("\n"),
    "General Translation (interview): next action — Prep for Ernest call, due 2026-11-06",
  );
  assertStringIncludes(
    result.summary.join("\n"),
    "LM Studio (apply): next action — Email resume to apply@lmstudio.ai",
  );
});

Deno.test("jobs: opportunities without a deadline are noted, not invented", async () => {
  const result = await jobsAgent.run({}, ctx());
  assert(
    result.notes.some((n) => n.includes("No deadline recorded for LM Studio")),
  );
  assert(
    result.notes.some((n) => n.includes("No deadline recorded for eClerx")),
  );
});

Deno.test("jobs: empty World reports the gap", async () => {
  const empty = {
    world: createFakeWorldClient([]),
    tier: "draft" as const,
    today: TODAY,
  };
  const result = await jobsAgent.run({}, empty);
  assertEquals(result.claims, []);
  assertStringIncludes(result.notes.join(" "), "No Opportunity facts");
});
