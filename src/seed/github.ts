/**
 * GitHub open state -> Facts (plan §4.3).
 *
 * Reads open issues and PRs across the wazootech org via the read-only
 * GitHub MCP CLI (`/opt/hatch/bin/github call-read-tool`, tools
 * `list_issues` / `list_pull_requests` — read-only, no writes of any kind).
 * Falls back to the `gh` CLI if the MCP call fails. If both fail, the
 * exact blocker is thrown (the seed run reports it and exits non-zero).
 *
 * Cap: ~200 items total (~25 per repo). Each item becomes a Task fact
 * with provenance `github:<owner>/<repo>#<number>`.
 */
import {
  dedupFacts,
  emptyResult,
  factId,
  truncate,
  validateAndSplit,
} from "./common.ts";
import type { SeedResult } from "./common.ts";
import type { Fact } from "../world/types.ts";

/** Repos covered, at minimum (plan Appendix A). */
export const GITHUB_REPOS: Array<{ owner: string; repo: string }> = [
  { owner: "wazootech", repo: "worlds-sdk-ts" },
  { owner: "wazootech", repo: "worlds-api" },
  { owner: "wazootech", repo: "sparql-engine" },
  { owner: "wazootech", repo: "wazoobench" },
  { owner: "wazootech", repo: "wazoo.dev" },
  { owner: "wazootech", repo: "blog.wazoo.dev" },
  { owner: "wazootech", repo: "computer-agent" },
  { owner: "wazootech", repo: "reasoner" },
  { owner: "wazootech", repo: "docs.wazoo.dev" },
];

export const GITHUB_TOTAL_CAP = 200;
export const GITHUB_PER_REPO_CAP = 25;

export interface GithubItem {
  number: number;
  title: string;
  state: string;
  kind: "issue" | "pr";
  url?: string;
  createdAt?: string;
  author?: string;
}

const MCP_CLI = "/opt/hatch/bin/github";

async function runCommand(
  cmd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/** Parse the MCP `call-read-tool` envelope; the tool result is JSON text. */
function parseMcpResult(stdout: string): unknown {
  const envelope = JSON.parse(stdout) as {
    ok?: boolean;
    result?: { content?: Array<{ text?: string }> };
    error?: unknown;
  };
  if (envelope.ok === false) {
    throw new Error(
      `MCP call failed: ${JSON.stringify(envelope.error ?? envelope)}`,
    );
  }
  const text = envelope.result?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`MCP result had no text content: ${stdout.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function listViaMcp(
  owner: string,
  repo: string,
  kind: "issue" | "pr",
): Promise<GithubItem[]> {
  const tool = kind === "issue" ? "list_issues" : "list_pull_requests";
  const args = JSON.stringify({ owner, repo, state: "open" });
  const { code, stdout, stderr } = await runCommand(MCP_CLI, [
    "call-read-tool",
    "--name",
    tool,
    "--arguments-json",
    args,
  ]);
  if (code !== 0) {
    throw new Error(
      `MCP CLI ${tool} exited ${code}: ${stderr.trim() || stdout.trim()}`,
    );
  }
  const data = parseMcpResult(stdout);
  const raw: unknown[] = Array.isArray(data)
    ? data
    : (data as { issues?: unknown[] }).issues ??
      (data as { pull_requests?: unknown[] }).pull_requests ?? [];
  return raw.map((item) => {
    const it = item as Record<string, unknown>;
    return {
      number: Number(it["number"]),
      title: String(it["title"] ?? ""),
      state: String(it["state"] ?? "open").toLowerCase(),
      kind,
      url: typeof it["html_url"] === "string"
        ? it["html_url"]
        : `https://github.com/${owner}/${repo}/${
          kind === "pr" ? "pull" : "issues"
        }/${it["number"]}`,
      createdAt: typeof it["created_at"] === "string"
        ? it["created_at"]
        : undefined,
      author: typeof it["user"] === "object" && it["user"] !== null
        ? String((it["user"] as Record<string, unknown>)["login"] ?? "")
        : undefined,
    };
  });
}

async function listViaGh(
  owner: string,
  repo: string,
  kind: "issue" | "pr",
): Promise<GithubItem[]> {
  const sub = kind === "issue" ? "issue" : "pr";
  const { code, stdout, stderr } = await runCommand("gh", [
    sub,
    "list",
    "--repo",
    `${owner}/${repo}`,
    "--state",
    "open",
    "--limit",
    String(GITHUB_PER_REPO_CAP),
    "--json",
    "number,title,url,createdAt,author",
  ]);
  if (code !== 0) {
    throw new Error(
      `gh ${sub} list exited ${code}: ${stderr.trim() || stdout.trim()}`,
    );
  }
  const raw = JSON.parse(stdout) as Array<Record<string, unknown>>;
  return raw.map((it) => ({
    number: Number(it["number"]),
    title: String(it["title"] ?? ""),
    state: "open",
    kind,
    url: typeof it["url"] === "string" ? it["url"] : undefined,
    createdAt: typeof it["createdAt"] === "string"
      ? it["createdAt"]
      : undefined,
    author: typeof it["author"] === "object" && it["author"] !== null
      ? String((it["author"] as Record<string, unknown>)["login"] ?? "")
      : undefined,
  }));
}

/** Map GitHub items to Task facts. Pure (no I/O) for tests. */
export function issuesToFacts(
  items: GithubItem[],
  owner: string,
  repo: string,
  retrievedAt: string,
): Fact[] {
  return items.map((item) => {
    const kindLabel = item.kind === "pr" ? "PR" : "Issue";
    const label = `#${item.number} ${item.title}`.slice(0, 120);
    return {
      id: factId("Task", `github-${owner}-${repo}-${item.number}`),
      type: "Task",
      label,
      properties: {
        description: truncate(
          `${kindLabel} ${owner}/${repo}#${item.number}: ${item.title}` +
            (item.createdAt
              ? ` (open since ${item.createdAt.slice(0, 10)})`
              : ""),
          500,
        ),
        status: "open",
        owner: `${owner}/${repo}`,
        ...(item.url ? { nextAction: item.url } : {}),
      },
      provenance: {
        source: `github:${owner}/${repo}#${item.number}`,
        retrievedAt,
      },
    };
  });
}

export async function importGithub(
  retrievedAt = new Date().toISOString(),
): Promise<SeedResult> {
  const result = emptyResult("github");
  const candidates: Fact[] = [];
  const blockers: string[] = [];
  let reposOk = 0;
  let reposFailed = 0;

  for (const { owner, repo } of GITHUB_REPOS) {
    if (candidates.length >= GITHUB_TOTAL_CAP) break;
    let items: GithubItem[] = [];
    try {
      const issues = await listViaMcp(owner, repo, "issue");
      const prs = await listViaMcp(owner, repo, "pr");
      items = [...issues, ...prs];
    } catch (mcpError) {
      const mcpMessage = mcpError instanceof Error
        ? mcpError.message
        : String(mcpError);
      try {
        const issues = await listViaGh(owner, repo, "issue");
        const prs = await listViaGh(owner, repo, "pr");
        items = [...issues, ...prs];
      } catch (ghError) {
        const ghMessage = ghError instanceof Error
          ? ghError.message
          : String(ghError);
        reposFailed++;
        blockers.push(
          `${owner}/${repo}: MCP failed (${mcpMessage}); gh fallback failed (${ghMessage})`,
        );
        continue;
      }
    }
    reposOk++;
    const capped = items.slice(0, GITHUB_PER_REPO_CAP);
    result.counts[`repos:${owner}/${repo}`] = capped.length;
    candidates.push(...issuesToFacts(capped, owner, repo, retrievedAt));
  }

  if (reposOk === 0) {
    throw new Error(
      `GitHub import failed for every repo — no items fetched. Blockers:\n${
        blockers.join("\n")
      }`,
    );
  }
  const deduped = dedupFacts(candidates);
  validateAndSplit(result, deduped.facts);
  result.counts["reposOk"] = reposOk;
  result.counts["reposFailed"] = reposFailed;
  result.counts["duplicates"] = deduped.duplicates;
  result.counts["facts"] = result.facts.length;
  result.counts["quarantined"] = result.quarantined.length;
  if (blockers.length > 0) result.counts["repoBlockers"] = blockers.length;
  return result;
}
