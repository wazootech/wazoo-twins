import { assertEquals, assertRejects } from "@std/assert";
import { GitHubConnector, GitHubNotConfiguredError } from "./github.ts";

Deno.test("github: reads throw an explicit error when no token is set", async () => {
  const conn = new GitHubConnector({ token: "" });
  assertEquals(conn.isConfigured(), false);
  await assertRejects(
    () => conn.listIssues("wazootech/wazoo-twins"),
    GitHubNotConfiguredError,
    "GITHUB_TOKEN not set",
  );
  await assertRejects(
    () => conn.listPullRequests("wazootech/wazoo-twins"),
    GitHubNotConfiguredError,
  );
});

Deno.test("github: invalid repo names are rejected before any fetch", async () => {
  const conn = new GitHubConnector({ token: "t" });
  await assertRejects(
    () => conn.listIssues("not-a-repo"),
    Error,
    'expected "owner/name"',
  );
});

Deno.test("github: listIssues excludes PRs, listPullRequests returns PRs (injected fetch)", async () => {
  const fetchFn = (async (input: string | URL | Request): Promise<Response> => {
    await Promise.resolve();
    const url = String(input);
    const body = url.includes("/pulls")
      ? [{
        number: 1,
        title: "A PR",
        state: "open",
        html_url: "https://github.com/o/r/pull/1",
        created_at: "2026-11-06T00:00:00Z",
        user: { login: "u" },
      }]
      : [
        {
          number: 2,
          title: "An issue",
          state: "open",
          html_url: "https://github.com/o/r/issues/2",
          created_at: "2026-11-06T00:00:00Z",
          user: { login: "u" },
          labels: [{ name: "bug" }],
        },
        {
          number: 3,
          title: "A PR listed as issue",
          state: "open",
          html_url: "https://github.com/o/r/pull/3",
          created_at: "2026-11-06T00:00:00Z",
          user: { login: "u" },
          labels: [],
          pull_request: {},
        },
      ];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  const conn = new GitHubConnector({ token: "t", fetchFn });
  const issues = await conn.listIssues("o/r");
  assertEquals(issues.map((i) => i.number), [2]);
  assertEquals(issues[0].labels, ["bug"]);
  const pulls = await conn.listPullRequests("o/r");
  assertEquals(pulls.map((p) => p.number), [1]);
});
