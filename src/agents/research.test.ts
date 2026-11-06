import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import { createResearchAgent } from "./research.ts";

const TODAY = "2026-11-06";
const ctx = () => ({
  world: createFakeWorldClient(ethanFixtureFacts()),
  tier: "draft" as const,
  today: TODAY,
});

Deno.test("research: World facts cited, web results cited to URLs, nothing invented", async () => {
  const agent = createResearchAgent(() =>
    Promise.resolve([
      {
        title: "Ernest McCarter — General Translation",
        url: "https://example.com/ernest",
        snippet: "VP of Engineering",
      },
    ])
  );
  const result = await agent.run({ person: "Ernest McCarter" }, ctx());
  assert(result.claims.length >= 2);
  assert(
    result.claims.some((c) =>
      c.citations.some((x) => x.factId === "twin:person/ernest-mccarter")
    ),
  );
  assert(
    result.claims.some((c) =>
      c.citations.some((x) => x.factId === "https://example.com/ernest")
    ),
  );
  assert(result.claims.every((c) => c.verified));
});

Deno.test("research: no World record and no web results yields empty claims + open questions", async () => {
  const agent = createResearchAgent(() => Promise.resolve([]));
  const result = await agent.run({ person: "Zorg Blorp" }, ctx());
  assertEquals(result.claims, []);
  assert(
    result.notes.some((n) => n.includes('No World record for "Zorg Blorp"')),
  );
  assert(result.notes.some((n) => n.includes("No public web results")));
  assert(result.notes.some((n) => n.includes("Open question")));
});

Deno.test("research: empty input reports the gap instead of inventing", async () => {
  const agent = createResearchAgent(() => Promise.resolve([]));
  const result = await agent.run({}, ctx());
  assertEquals(result.claims, []);
  assertStringIncludes(
    result.notes.join(" "),
    "No person, company, or query given",
  );
});
