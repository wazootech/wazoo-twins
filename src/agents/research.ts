/**
 * Research agent (plan §3.4) — person/company prep brief.
 *
 * Public sources first, World facts alongside: World Person/Organization
 * facts are cited to their quads; web results are cited to their URLs
 * (public-source citations — the orchestrator's verify step treats a claim
 * citing only fresh public URLs as traced to a public source, per plan
 * §3.3; see the contract note in `src/orchestrator/loop.ts`).
 *
 * Zero invented claims: when neither the World nor the web has anything,
 * the result is empty claims plus notes listing the open questions.
 */
import { type SearchResult, searchWeb } from "../connectors/search.ts";
import type { CitedClaim, Fact } from "../world/types.ts";
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";
import { claimFor } from "./common.ts";

export interface ResearchInput {
  query?: string;
  person?: string;
  company?: string;
}

export type SearchFn = (
  query: string,
  limit?: number,
) => Promise<SearchResult[]>;

function asResearchInput(input: unknown): ResearchInput {
  if (typeof input === "string") return { query: input };
  if (input === null || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  return {
    query: typeof o["query"] === "string" ? o["query"] : undefined,
    person: typeof o["person"] === "string" ? o["person"] : undefined,
    company: typeof o["company"] === "string" ? o["company"] : undefined,
  };
}

function describeFact(f: Fact): string {
  const role = f.properties.role ? ` (${f.properties.role})` : "";
  const org = f.properties.org ? ` at ${f.properties.org}` : "";
  const detail = f.properties.description ?? "";
  return `${f.label}${role}${org}${detail ? `: ${detail}` : ""}`;
}

export function createResearchAgent(searchFn: SearchFn = searchWeb): SubAgent {
  return {
    name: "research",
    async run(input: unknown, ctx: AgentContext): Promise<AgentResult> {
      const req = asResearchInput(input);
      const query = (req.person ?? req.company ?? req.query ?? "").trim();
      if (!query) {
        return {
          agent: "research",
          claims: [],
          summary: [],
          notes: ["No person, company, or query given — nothing to research."],
        };
      }
      const claims: CitedClaim[] = [];
      const notes: string[] = [];

      const worldFacts = await ctx.world.search(query, 10);
      const relevant = worldFacts.filter((f) =>
        f.type === "Person" || f.type === "Organization" ||
        f.type.endsWith("#Person") || f.type.endsWith("#Organization")
      );
      const worldClaims = (relevant.length > 0 ? relevant : worldFacts).slice(
        0,
        5,
      );
      for (const f of worldClaims) claims.push(claimFor(f, describeFact(f)));
      if (worldFacts.length === 0) {
        notes.push(`No World record for "${query}".`);
      }

      let web: SearchResult[] = [];
      try {
        web = await searchFn(query, 5);
      } catch (err) {
        notes.push(
          `Web search failed for "${query}" (${
            err instanceof Error ? err.message : String(err)
          }) — World facts only.`,
        );
      }
      for (const r of web) {
        claims.push({
          text: `${r.title} — ${r.snippet}`,
          citations: [{ factId: r.url, source: r.url }],
          verified: true,
        });
      }
      if (web.length === 0) notes.push(`No public web results for "${query}".`);
      if (relevant.length === 0) {
        if (req.person || req.company) {
          notes.push(
            `Open question: confirm ${query}'s current role and org from a primary source.`,
          );
        } else {
          notes.push(
            `Open question: no World record or public result answers "${query}" yet.`,
          );
        }
      }

      return {
        agent: "research",
        claims,
        summary: claims.map((c) => c.text),
        notes,
      };
    },
  };
}

export const researchAgent: SubAgent = createResearchAgent();
