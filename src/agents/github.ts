/**
 * GitHub agent (plan §3.4) — read-only watch: new activity, PR/issue status.
 *
 * Reads live state from the GitHub connector; when no `GITHUB_TOKEN` is set
 * the connector throws `GitHubNotConfiguredError` and the agent falls back
 * to World facts mentioning the repo, reporting the fallback in its notes.
 * No write methods are called — none exist on the connector in Phase 1.
 */
import { GitHubConnector } from "../connectors/github.ts";
import type { CitedClaim } from "../world/types.ts";
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";
import { claimFor } from "./common.ts";

export interface GitHubInput {
  repos?: string[];
}

function asGitHubInput(input: unknown): GitHubInput {
  if (typeof input === "string") return { repos: [input] };
  if (input === null || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const repos = o["repos"];
  if (Array.isArray(repos)) {
    return { repos: repos.filter((r): r is string => typeof r === "string") };
  }
  return {};
}

export function createGitHubAgent(github?: GitHubConnector): SubAgent {
  return {
    name: "github",
    async run(input: unknown, ctx: AgentContext): Promise<AgentResult> {
      const repos = asGitHubInput(input).repos ?? [];
      const notes: string[] = [];
      if (repos.length === 0) {
        return {
          agent: "github",
          claims: [],
          summary: [],
          notes: [
            'No repos specified — nothing to watch. Pass { repos: ["owner/name"] }.',
          ],
        };
      }
      const claims: CitedClaim[] = [];
      const summary: string[] = [];
      const conn = github ?? new GitHubConnector();
      for (const repo of repos) {
        try {
          const issues = await conn.listIssues(repo);
          const pulls = await conn.listPullRequests(repo);
          summary.push(
            `${repo}: ${issues.length} open issue(s), ${pulls.length} open PR(s).`,
          );
          for (const issue of issues) {
            claims.push({
              text: `${repo} issue #${issue.number}: ${issue.title}`,
              citations: [{ factId: issue.url, source: issue.url }],
              verified: true,
            });
          }
          for (const pr of pulls) {
            claims.push({
              text: `${repo} PR #${pr.number}: ${pr.title}`,
              citations: [{ factId: pr.url, source: pr.url }],
              verified: true,
            });
          }
        } catch (err) {
          notes.push(
            `Live GitHub read failed for ${repo} (${
              err instanceof Error ? err.message : String(err)
            }) — falling back to World facts.`,
          );
          const facts = await ctx.world.search(repo, 10);
          if (facts.length === 0) {
            notes.push(`No World facts mention ${repo}.`);
          }
          for (const f of facts) {
            claims.push(claimFor(f, `${repo}: ${f.label}`));
          }
          summary.push(
            `${repo}: live read unavailable; ${facts.length} World fact(s) mention it.`,
          );
        }
      }
      return { agent: "github", claims, summary, notes };
    },
  };
}

export const githubAgent: SubAgent = createGitHubAgent();
