import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { GitHubConnector } from "../connectors/github.ts";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import { createGitHubAgent } from "./github.ts";

const TODAY = "2026-11-06";
const ctx = () => ({
  world: createFakeWorldClient(ethanFixtureFacts()),
  tier: "draft" as const,
  today: TODAY,
});
const noToken = new GitHubConnector({ token: "" });

function fakeGitHubFetch(): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    await Promise.resolve();
    const url = String(input);
    const body = url.includes("/pulls")
      ? [{
        number: 7,
        title: "Add briefing agent",
        state: "open",
        html_url: "https://github.com/wazootech/wazoo-twins/pull/7",
        created_at: "2026-11-06T00:00:00Z",
        user: { login: "EthanThatOneKid" },
      }]
      : [
        {
          number: 3,
          title: "Morning brief misses deadlines",
          state: "open",
          html_url: "https://github.com/wazootech/wazoo-twins/issues/3",
          created_at: "2026-11-05T00:00:00Z",
          user: { login: "EthanThatOneKid" },
          labels: [],
        },
        {
          number: 5,
          title: "Draft reply tone",
          state: "open",
          html_url: "https://github.com/wazootech/wazoo-twins/issues/5",
          created_at: "2026-11-05T00:00:00Z",
          user: { login: "EthanThatOneKid" },
          labels: [{ name: "twin" }],
        },
      ];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

Deno.test("github agent: live read lists issues and PRs with URL citations", async () => {
  const agent = createGitHubAgent(
    new GitHubConnector({ token: "fake-token", fetchFn: fakeGitHubFetch() }),
  );
  const result = await agent.run({ repos: ["wazootech/wazoo-twins"] }, ctx());
  assertStringIncludes(
    result.summary.join(" "),
    "2 open issue(s), 1 open PR(s)",
  );
  assertEquals(result.claims.length, 3);
  assert(
    result.claims.every((c) =>
      c.citations[0].factId.startsWith("https://github.com/")
    ),
  );
});

Deno.test("github agent: no token falls back to World facts and says so", async () => {
  const agent = createGitHubAgent(noToken);
  const result = await agent.run({ repos: ["wazootech/wazoo-twins"] }, ctx());
  assert(result.notes.some((n) => n.includes("GITHUB_TOKEN not set")));
  assert(result.notes.some((n) => n.includes("falling back to World facts")));
  assertStringIncludes(result.summary.join(" "), "live read unavailable");
});

Deno.test("github agent: no repos specified reports the gap", async () => {
  const agent = createGitHubAgent(noToken);
  const result = await agent.run({}, ctx());
  assertEquals(result.claims, []);
  assertStringIncludes(result.notes.join(" "), "No repos specified");
});
