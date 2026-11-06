/**
 * Briefing agent (plan §3.4) — morning brief + evening summary.
 *
 * Rendered DETERMINISTICALLY from World facts: today's Events, Deadlines
 * due in 7 days, Commitments with status open, Threads with needsReply, and
 * Opportunities with nextAction. Every line cites its source fact.
 *
 * No free-form model prose is used for facts. The model (via
 * `createModelClient`) may only polish the one-sentence greeting, and with
 * no API key configured it falls back to the template greeting — the brief
 * is correct either way. A section with no facts says so explicitly rather
 * than inventing content.
 */
import { createModelClient, type ModelClient } from "../service/model.ts";
import type { WorldClient } from "../world/client.ts";
import type { CitedClaim, Fact } from "../world/types.ts";
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";
import {
  addDays,
  byProvenanceDesc,
  claimFor,
  datePart,
  datePartPT,
  findFactsByClass,
  formatTimePT,
  truncate,
  weekdayPT,
} from "./common.ts";

export interface BriefResult {
  markdown: string;
  claims: CitedClaim[];
  notes: string[];
}

export interface BriefingInput {
  kind?: "morning" | "evening" | "question";
  query?: string;
  date?: string;
}

function asBriefingInput(input: unknown): BriefingInput {
  if (input === null || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const kind = o["kind"];
  return {
    kind: kind === "evening" || kind === "question" ? kind : "morning",
    query: typeof o["query"] === "string" ? o["query"] : undefined,
    date: typeof o["date"] === "string" ? o["date"] : undefined,
  };
}

/** Polish only the greeting sentence; facts are never passed to the model. */
async function polishIntro(
  model: ModelClient,
  template: string,
): Promise<string> {
  try {
    const polished = await model.complete(
      `Rewrite this greeting in one sentence, same meaning, no new facts: ${template}`,
    );
    if (
      polished && !polished.includes("\n") && polished.trim().length > 0 &&
      polished.length < 300
    ) {
      return polished.trim();
    }
  } catch {
    // Model failure degrades to the template greeting.
  }
  return template;
}

/** True when a start value carries a clock time, not just a date. */
function hasTimeComponent(value: string): boolean {
  return /T\d{2}:\d{2}/.test(value) || /\d{1,2}:\d{2}\s*(am|pm)?/i.test(value);
}

function eventLine(e: Fact): string {
  const start = e.properties.start ?? "";
  // Date-only starts must not render a phantom time: new Date("2026-11-06")
  // is midnight UTC, which formats as 4:00pm PT — a time the source never
  // stated (morning-brief dry run, Nov 6, 2026).
  const time = hasTimeComponent(start) ? formatTimePT(start) : "";
  const attendees = e.properties.attendees
    ? ` with ${e.properties.attendees}`
    : "";
  const kind = e.properties.kind ? ` (${e.properties.kind})` : "";
  return `${time ? `${time} ` : ""}${e.label}${kind}${attendees}`;
}

/**
 * A commitment is open unless explicitly resolved. The seed importer writes
 * status "noted" for durable facts with no resolution — those are open
 * items, not closed ones. Filtering on status === "open" made the brief
 * claim "No open commitments" while the World held 100+ unresolved items
 * (morning-brief dry run, Nov 6, 2026).
 */
function isOpenStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return !["done", "closed", "resolved", "complete", "completed"].includes(s);
}

/** The date in a provenance source ("memory/2026-11-06.md"), else "". */
function sourceDate(f: Fact): string {
  return f.provenance.source.match(/20\d\d-\d\d-\d\d/)?.[0] ?? "";
}

/**
 * Open commitments, newest source first. A morning brief is not a dump:
 * the World holds 100+ open items, so the section shows the 15 most
 * recent and counts the rest (same pattern as opportunities).
 */
const MAX_COMMITMENTS_SHOWN = 15;

function openCommitments(
  commitments: Fact[],
): { shown: Fact[]; hidden: number } {
  const open = commitments
    .filter((f) => isOpenStatus(f.properties.status))
    .sort((a, b) =>
      sourceDate(b).localeCompare(sourceDate(a)) ||
      byProvenanceDesc(a, b)
    );
  return {
    shown: open.slice(0, MAX_COMMITMENTS_SHOWN),
    hidden: Math.max(0, open.length - MAX_COMMITMENTS_SHOWN),
  };
}

function section(
  lines: string[],
  claims: CitedClaim[],
  heading: string,
  facts: Fact[],
  render: (f: Fact) => string,
  emptyText: string,
  notes: string[],
  emptyNote?: string,
): void {
  lines.push(`## ${heading}`);
  if (facts.length === 0) {
    lines.push(`- ${emptyText}`);
    if (emptyNote) notes.push(emptyNote);
    return;
  }
  for (const f of facts) {
    const text = render(f);
    claims.push(claimFor(f, text));
    lines.push(`- ${text} [${f.provenance.source}]`);
  }
}

/** Morning brief for `today` ("YYYY-MM-DD"). */
export async function buildMorningBrief(
  world: WorldClient,
  today: string,
  model: ModelClient = createModelClient(),
): Promise<BriefResult> {
  const claims: CitedClaim[] = [];
  const notes: string[] = [];
  const lines: string[] = [];
  const intro = await polishIntro(
    model,
    `Good morning, Ethan. Here is your brief for ${today} (${
      weekdayPT(today)
    }).`,
  );
  lines.push(`# Morning brief — ${today}`, "", intro, "");

  const events = (await findFactsByClass(world, "Event"))
    .filter((f) =>
      (datePart(f.properties.start ?? "") ??
        datePartPT(f.properties.start ?? "")) === today
    )
    .sort((a, b) =>
      (a.properties.start ?? "").localeCompare(b.properties.start ?? "")
    );
  section(
    lines,
    claims,
    "Today",
    events,
    eventLine,
    "No events recorded in the World for today.",
    notes,
    `No Event facts for ${today} in the World.`,
  );

  const weekEnd = addDays(today, 7);
  const deadlines = (await findFactsByClass(world, "Deadline"))
    .filter((f) => {
      const due = datePart(f.properties.due ?? "");
      return due !== undefined && due >= today && due <= weekEnd;
    })
    .sort((a, b) =>
      (a.properties.due ?? "").localeCompare(b.properties.due ?? "")
    );
  section(
    lines,
    claims,
    "Due in the next 7 days",
    deadlines,
    (f) => `${f.label} — due ${f.properties.due ?? "unknown date"}`,
    "No deadlines due in the next 7 days.",
    notes,
  );

  const { shown: shownCommitments, hidden: hiddenCommitments } =
    openCommitments(await findFactsByClass(world, "Commitment"));
  section(
    lines,
    claims,
    "Open commitments",
    shownCommitments,
    (f) => {
      const next = f.properties.nextAction
        ? ` — next: ${f.properties.nextAction}`
        : "";
      const due = f.properties.due ? ` (due ${f.properties.due})` : "";
      return `${f.label}${due}${next}`;
    },
    "No open commitments.",
    notes,
  );
  if (hiddenCommitments > 0) {
    lines.push(`- …and ${hiddenCommitments} more open commitments.`);
  }

  const allThreads = await findFactsByClass(world, "Thread");
  const threads = allThreads
    .filter((f) => (f.properties.needsReply ?? "").toLowerCase() === "true")
    .sort(byProvenanceDesc);
  section(
    lines,
    claims,
    "Needs a reply",
    threads,
    (f) => {
      const last = f.properties.lastMessage
        ? `: "${truncate(f.properties.lastMessage, 120)}"`
        : "";
      return `${f.properties.participants ?? f.label}${last}`;
    },
    "Nothing waiting on a reply.",
    notes,
  );
  if (allThreads.length === 0) {
    // No Thread facts at all means the inbox source is absent (Gmail is not
    // connected in v1), not that the inbox is empty — say so explicitly.
    lines.push(
      "- Gmail is not connected yet, so inbox status is unknown (no Thread facts in the World).",
    );
  }

  const opportunities = (await findFactsByClass(world, "Opportunity"))
    .sort((a, b) =>
      (a.properties.due ?? "9999").localeCompare(b.properties.due ?? "9999")
    );
  const shownOpportunities = opportunities.slice(0, 10);
  section(
    lines,
    claims,
    "Opportunities — one next action each",
    shownOpportunities,
    (f) => {
      const next = f.properties.nextAction
        ? ` — next: ${f.properties.nextAction}`
        : " — no next action recorded";
      const due = f.properties.due ? ` (due ${f.properties.due})` : "";
      return `${f.label} (${
        f.properties.stage ?? "unknown stage"
      })${due}${next}`;
    },
    "No opportunities tracked.",
    notes,
  );
  if (opportunities.length > shownOpportunities.length) {
    lines.push(
      `- …and ${
        opportunities.length - shownOpportunities.length
      } more tracked opportunities.`,
    );
  }

  return { markdown: lines.join("\n"), claims, notes };
}

/** Evening summary for `today` ("YYYY-MM-DD"). */
export async function buildEveningSummary(
  world: WorldClient,
  today: string,
  model: ModelClient = createModelClient(),
): Promise<BriefResult> {
  const claims: CitedClaim[] = [];
  const notes: string[] = [];
  const lines: string[] = [];
  const intro = await polishIntro(
    model,
    `Good evening, Ethan. Here is what moved today, ${today} (${
      weekdayPT(today)
    }).`,
  );
  lines.push(`# Evening summary — ${today}`, "", intro, "");

  const runs = (await findFactsByClass(world, "Run"))
    .filter((f) =>
      (datePart(f.properties.started ?? "") ??
        datePartPT(f.properties.started ?? "")) === today
    )
    .sort(byProvenanceDesc);
  section(
    lines,
    claims,
    "What moved today",
    runs,
    (f) => `${f.label} — ${f.properties.outcome ?? ""}`,
    "No Twin runs recorded today.",
    notes,
    `No Run facts for ${today} in the World.`,
  );

  const { shown: shownCommitments, hidden: hiddenCommitments } =
    openCommitments(await findFactsByClass(world, "Commitment"));
  section(
    lines,
    claims,
    "Still open — commitments",
    shownCommitments,
    (f) => {
      const next = f.properties.nextAction
        ? ` — next: ${f.properties.nextAction}`
        : "";
      return `${f.label}${next}`;
    },
    "No open commitments.",
    notes,
  );
  if (hiddenCommitments > 0) {
    lines.push(`- …and ${hiddenCommitments} more open commitments.`);
  }

  const allThreads = await findFactsByClass(world, "Thread");
  const threads = allThreads
    .filter((f) => (f.properties.needsReply ?? "").toLowerCase() === "true")
    .sort(byProvenanceDesc);
  section(
    lines,
    claims,
    "Still open — needs a reply",
    threads,
    (f) => `${f.properties.participants ?? f.label}`,
    "Nothing waiting on a reply.",
    notes,
  );
  if (allThreads.length === 0) {
    lines.push(
      "- Gmail is not connected yet, so inbox status is unknown (no Thread facts in the World).",
    );
  }

  return { markdown: lines.join("\n"), claims, notes };
}

/** Answer a question from World facts via keyword search (no invention). */
async function answerQuestion(
  world: WorldClient,
  query: string,
): Promise<AgentResult> {
  const q = query.trim();
  if (!q) {
    return {
      agent: "briefing",
      claims: [],
      summary: [],
      notes: ["No question given."],
    };
  }
  let facts = await world.search(q, 5);
  if (facts.length === 0) {
    // Fallback: the full question string rarely matches a literal, so search
    // its content words individually and union the results.
    const stopwords = new Set([
      "what",
      "when",
      "where",
      "who",
      "why",
      "how",
      "which",
      "is",
      "are",
      "was",
      "were",
      "do",
      "does",
      "did",
      "i",
      "me",
      "my",
      "the",
      "a",
      "an",
      "to",
      "of",
      "for",
      "on",
      "in",
      "it",
    ]);
    const words = [
      ...new Set(
        q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
          .filter((w) => w.length > 2 && !stopwords.has(w)),
      ),
    ];
    const seen = new Set<string>();
    for (const word of words) {
      for (const f of await world.search(word, 5)) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          facts.push(f);
        }
      }
      if (facts.length >= 5) break;
    }
    facts = facts.slice(0, 5);
  }
  if (facts.length === 0) {
    return {
      agent: "briefing",
      claims: [],
      summary: [],
      notes: [`No matching facts in the World for "${q}".`],
    };
  }
  const claims = facts.map((f) => {
    const detail = f.properties.description ?? f.properties.nextAction ?? "";
    return claimFor(f, detail ? `${f.label}: ${detail}` : f.label);
  });
  return {
    agent: "briefing",
    claims,
    summary: claims.map((c) => c.text),
    notes: [],
  };
}

export function createBriefingAgent(
  model: ModelClient = createModelClient(),
): SubAgent {
  return {
    name: "briefing",
    async run(input: unknown, ctx: AgentContext): Promise<AgentResult> {
      const req = asBriefingInput(input);
      const today = req.date ?? ctx.today;
      if (req.kind === "question") {
        return await answerQuestion(ctx.world, req.query ?? "");
      }
      const brief = req.kind === "evening"
        ? await buildEveningSummary(ctx.world, today, model)
        : await buildMorningBrief(ctx.world, today, model);
      return {
        agent: "briefing",
        claims: brief.claims,
        summary: brief.markdown.split("\n").filter((l) => l.startsWith("- ")),
        notes: brief.notes,
      };
    },
  };
}

export const briefingAgent: SubAgent = createBriefingAgent();
