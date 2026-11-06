/**
 * Jobs agent (plan §3.4) — job-pipeline tracking, read-only.
 *
 * One next action + deadline per Opportunity fact (RTX, General Translation,
 * LM Studio, Benchmark Motion, eClerx, Intuit, …). Opportunities missing a
 * next action are reported in notes, never filled in with an invented one.
 */
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";
import { claimFor, findFactsByClass } from "./common.ts";

export const jobsAgent: SubAgent = {
  name: "jobs",
  async run(_input: unknown, ctx: AgentContext): Promise<AgentResult> {
    const opportunities = (await findFactsByClass(ctx.world, "Opportunity"))
      .sort((a, b) =>
        (a.properties.due ?? "9999").localeCompare(b.properties.due ?? "9999")
      );
    const notes: string[] = [];
    if (opportunities.length === 0) {
      return {
        agent: "jobs",
        claims: [],
        summary: [],
        notes: ["No Opportunity facts in the World — nothing to track."],
      };
    }
    const claims = opportunities.map((o) => {
      const next = o.properties.nextAction ?? "no next action recorded";
      const due = o.properties.due ? `, due ${o.properties.due}` : "";
      return claimFor(
        o,
        `${o.label} (${
          o.properties.stage ?? "unknown stage"
        }): next action — ${next}${due}`,
      );
    });
    const summary = claims.map((c) => c.text);
    for (const o of opportunities) {
      if (!o.properties.nextAction) {
        notes.push(
          `No next action recorded for ${o.label} — needs one before the next check-in.`,
        );
      }
      if (!o.properties.due) {
        notes.push(`No deadline recorded for ${o.label}.`);
      }
    }
    return { agent: "jobs", claims, summary, notes };
  },
};
