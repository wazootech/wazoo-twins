import { assertEquals } from "@std/assert";
import { issuesToFacts } from "./github.ts";

const NOW = "2026-11-06T12:00:00.000Z";

Deno.test("issuesToFacts maps issues and PRs to Task facts with GitHub provenance", () => {
  const facts = issuesToFacts(
    [
      {
        number: 251,
        title: "Promotion/retention policy",
        state: "open",
        kind: "issue",
        url: "https://github.com/wazootech/worlds-sdk-ts/issues/251",
        createdAt: "2026-10-31T00:00:00Z",
      },
      { number: 42, title: "Pin all venues", state: "open", kind: "pr" },
    ],
    "wazootech",
    "worlds-sdk-ts",
    NOW,
  );
  assertEquals(facts.length, 2);
  assertEquals(facts[0].id, "twin:task/github-wazootech-worlds-sdk-ts-251");
  assertEquals(facts[0].properties["status"], "open");
  assertEquals(facts[0].properties["owner"], "wazootech/worlds-sdk-ts");
  assertEquals(
    facts[0].provenance.source,
    "github:wazootech/worlds-sdk-ts#251",
  );
  assertEquals(facts[0].label, "#251 Promotion/retention policy");
  assertEquals(facts[1].label, "#42 Pin all venues");
});
