/**
 * GitHub connector (plan §3.1) — READ-ONLY.
 *
 * Fetch-based client for api.github.com using a `GITHUB_TOKEN` env token.
 * No write methods exist in this file by design: Phase 1 is read-only, and
 * any GitHub write in Phase 2 goes through the approval path, not this
 * connector. When no token is set, every call throws `GitHubNotConfiguredError`
 * and callers fall back to World facts.
 */

export class GitHubNotConfiguredError extends Error {
  constructor() {
    super(
      "GITHUB_TOKEN not set — GitHub reads unavailable; callers fall back to World facts. " +
        "Set GITHUB_TOKEN (or authenticate the gh CLI) to enable live reads.",
    );
    this.name = "GitHubNotConfiguredError";
  }
}

export interface GitHubIssueItem {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  author: string;
  labels: string[];
}

export interface GitHubPullItem {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  author: string;
}

type FetchFn = typeof fetch;

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export class GitHubConnector {
  private readonly token: string | undefined;
  private readonly fetchFn: FetchFn;

  constructor(options: { token?: string; fetchFn?: FetchFn } = {}) {
    this.token = options.token ?? env("GITHUB_TOKEN");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isConfigured(): boolean {
    return this.token !== undefined && this.token !== "";
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) throw new GitHubNotConfiguredError();
  }

  private async api(path: string): Promise<unknown> {
    this.requireConfigured();
    const response = await this.fetchFn(`https://api.github.com${path}`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${this.token}`,
        "User-Agent": "WazooTwins/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(
        `GitHub API ${response.status} for ${path}: ${await response.text()}`,
      );
    }
    return await response.json() as unknown;
  }

  private static requireRepo(repo: string): void {
    if (!REPO_RE.test(repo)) {
      throw new Error(`invalid repo "${repo}" — expected "owner/name"`);
    }
  }

  /** Open (or `state`) issues for a repo, excluding pull requests. */
  async listIssues(repo: string, state = "open"): Promise<GitHubIssueItem[]> {
    GitHubConnector.requireRepo(repo);
    const data = await this.api(
      `/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=30`,
    ) as Record<string, unknown>[];
    return data
      .filter((i) => i["pull_request"] === undefined)
      .map((i) => ({
        number: i["number"] as number,
        title: String(i["title"] ?? ""),
        state: String(i["state"] ?? ""),
        url: String(i["html_url"] ?? ""),
        createdAt: String(i["created_at"] ?? ""),
        author: String(
          (i["user"] as Record<string, unknown> | undefined)?.["login"] ?? "",
        ),
        labels: ((i["labels"] as Record<string, unknown>[] | undefined) ?? [])
          .map((l) => String(l["name"] ?? "")),
      }));
  }

  /** Open (or `state`) pull requests for a repo. */
  async listPullRequests(
    repo: string,
    state = "open",
  ): Promise<GitHubPullItem[]> {
    GitHubConnector.requireRepo(repo);
    const data = await this.api(
      `/repos/${repo}/pulls?state=${encodeURIComponent(state)}&per_page=30`,
    ) as Record<string, unknown>[];
    return data.map((p) => ({
      number: p["number"] as number,
      title: String(p["title"] ?? ""),
      state: String(p["state"] ?? ""),
      url: String(p["html_url"] ?? ""),
      createdAt: String(p["created_at"] ?? ""),
      author: String(
        (p["user"] as Record<string, unknown> | undefined)?.["login"] ?? "",
      ),
    }));
  }
}
