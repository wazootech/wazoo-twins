/**
 * Planner (plan §3.3, step 1) — intent -> sub-agent calls.
 *
 * Deterministic keyword/intent routing only: no model call, no guessing.
 * Each intent classifies into one kind and maps to a fixed set of sub-agent
 * calls. Anything that matches nothing is a `question`, answered from World
 * facts by the briefing agent; the orchestrator asks Ethan when even that
 * finds nothing.
 */
export type IntentKind =
  | "brief"
  | "question"
  | "draft-reply"
  | "schedule"
  | "research"
  | "github-watch"
  | "jobs-status";

export interface PlannedCall {
  agent: string;
  input: unknown;
}

export interface Plan {
  kind: IntentKind;
  calls: PlannedCall[];
}

const REPO_RE = /[\w.-]+\/[\w.-]+/g;

/** Extract "owner/name" repo mentions from an intent. */
export function extractRepos(intent: string): string[] {
  return [...intent.matchAll(REPO_RE)].map((m) => m[0]);
}

/** Extract an ISO date ("YYYY-MM-DD") from an intent, if present. */
export function extractDate(intent: string): string | undefined {
  const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(intent);
  return m ? m[1] : undefined;
}

/** Extract the research subject: strip the leading command words. */
export function extractResearchQuery(intent: string): string {
  const stripped = intent
    .replace(
      /^(please\s+)?(research|look (up|into)|tell me about|who is|what is|prep( me)? for)\s+/i,
      "",
    )
    .trim();
  return stripped || intent.trim();
}

export function classifyIntent(intent: string): IntentKind {
  const text = intent.toLowerCase();

  if (
    /\b(draft|reply|respond|write back|answer)\b/.test(text) &&
    /\b(to|for|travis|purav|ananay|email|message|thread)\b/.test(text)
  ) {
    return "draft-reply";
  }
  if (/\b(draft (a )?reply|draft (a )?response)\b/.test(text)) {
    return "draft-reply";
  }
  if (/\bsend\b/.test(text) && /\b(email|message|reply)\b/.test(text)) {
    return "draft-reply";
  }
  if (
    /\b(schedule|book a|free|available|conflict|when am i free|what'?s on|what is on|calendar)\b/
      .test(text)
  ) {
    return "schedule";
  }
  if (/\bprep( me)? for\b/.test(text)) return "research";
  if (/\b(research|look (up|into)|tell me about|who is)\b/.test(text)) {
    return "research";
  }
  if (/\b(github|pull request|\bprs?\b|issue|repo|blog)\b/.test(text)) {
    return "github-watch";
  }
  if (
    /\b(job|opportunity|rtx|general translation|lm studio|benchmark|eclerx|intuit|application|offer|interview)\b/
      .test(text)
  ) {
    return "jobs-status";
  }
  if (/\b(brief|morning|evening|summary|today)\b/.test(text)) return "brief";
  return "question";
}

export function planIntent(intent: string): Plan {
  const kind = classifyIntent(intent);
  switch (kind) {
    case "brief": {
      const evening = /\bevening\b/i.test(intent);
      return {
        kind,
        calls: [{
          agent: "briefing",
          input: { kind: evening ? "evening" : "morning" },
        }],
      };
    }
    case "question":
      return {
        kind,
        calls: [{
          agent: "briefing",
          input: { kind: "question", query: intent },
        }],
      };
    case "draft-reply":
      return { kind, calls: [{ agent: "inbox", input: { query: intent } }] };
    case "schedule": {
      const date = extractDate(intent);
      return {
        kind,
        calls: [{ agent: "calendar", input: date ? { date } : {} }],
      };
    }
    case "research": {
      const calls: PlannedCall[] = [
        { agent: "research", input: { query: extractResearchQuery(intent) } },
      ];
      if (/\bprep( me)? for\b/i.test(intent)) {
        calls.push({ agent: "calendar", input: {} });
      }
      return { kind, calls };
    }
    case "github-watch":
      return {
        kind,
        calls: [{ agent: "github", input: { repos: extractRepos(intent) } }],
      };
    case "jobs-status":
      return { kind, calls: [{ agent: "jobs", input: {} }] };
  }
}
