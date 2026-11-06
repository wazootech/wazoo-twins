import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import { buildBrief, parseBriefArgs } from "./brief.ts";

const TODAY = "2026-11-06";

Deno.test("brief: parseBriefArgs handles --kind forms, defaults to morning", () => {
  assertEquals(parseBriefArgs([]), { kind: "morning" });
  assertEquals(parseBriefArgs(["--kind", "evening"]), { kind: "evening" });
  assertEquals(parseBriefArgs(["--kind=evening"]), { kind: "evening" });
  assertEquals(parseBriefArgs(["--kind", "morning"]), { kind: "morning" });
  assertEquals(parseBriefArgs(["--kind=bogus"]), { kind: "morning" });
});

Deno.test("brief: buildBrief morning renders the morning brief from the World", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const brief = await buildBrief(world, "morning", TODAY);
  assertStringIncludes(brief.markdown, "# Morning brief — 2026-11-06");
  assertStringIncludes(brief.markdown, "Call with Ernest McCarter");
  assert(brief.claims.every((c) => c.verified));
});

Deno.test("brief: buildBrief evening renders the evening summary", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const brief = await buildBrief(world, "evening", TODAY);
  assertStringIncludes(brief.markdown, "# Evening summary — 2026-11-06");
  assertStringIncludes(brief.markdown, "NBIS eApp (SF-86)");
});
