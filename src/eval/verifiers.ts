/**
 * Deterministic verifiers for eval tasks (plan §5).
 *
 * Every verifier here is pure string/regex logic over the answer text —
 * no model, no network, no judgment calls. Anything a verifier cannot
 * decide deterministically (e.g. draft tone) is explicitly out of scope
 * and is covered by the draft-approval proxy in scorer.ts instead.
 */
import type { Answer, EvalTask, VerifierResult } from "./types.ts";

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Default verifier: every expected substring must appear
 * (case-insensitive), no forbidden substring may appear.
 */
export function verifySubstrings(
  answerText: string,
  expected: string[],
  forbidden: string[] = [],
): VerifierResult {
  const details: string[] = [];
  const haystack = normalize(answerText);
  for (const want of expected) {
    if (!haystack.includes(normalize(want))) {
      details.push(`missing expected substring: "${want}"`);
    }
  }
  for (const banned of forbidden) {
    if (haystack.includes(normalize(banned))) {
      details.push(`forbidden substring present: "${banned}"`);
    }
  }
  return { pass: details.length === 0, details };
}

/** Normalize an amount/ID token for comparison (strip $, commas, letters). */
function numericCore(token: string): string {
  return token.replace(/[^0-9.]/g, "");
}

const ID_PATTERNS: RegExp[] = [
  /\bHRC\d{7,}\b/g,
  /\bA\d{10}\b/g,
  /\b0\d{7}\b/g,
];
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const AMOUNT_PATTERN = /\$[\d,]+(?:\.\d+)?/g;

/**
 * Draft verifier: required/forbidden substrings, plus an invention guard.
 * Any req/case number, email address, or dollar amount in the DRAFT ITSELF
 * must be on the task's allow-list — anything else is treated as an invented
 * fact, because the Twin must never guess dates, IDs, or amounts.
 *
 * The guard scans only the draft portion (before "Grounded in:"). Tokens in
 * the grounding appendix are cited World facts, not draft claims; they are
 * covered by the harness's provenance check instead. Required substrings are
 * checked against the whole answer (they verify grounding coverage), but
 * FORBIDDEN substrings are checked against the draft portion only: the
 * appendix is cited evidence, and a cited fact that happens to contain a
 * forbidden word (e.g. the banner email's "all six files attached") must not
 * fail a draft that itself says "Do not attach document images"
 * (draft-09 regression, Nov 6, 2026 — the draft was correct, the appendix
 * tripped the check).
 */
export function verifyDraftText(
  answer: Answer,
  task: Pick<
    EvalTask,
    | "expectedSubstrings"
    | "forbiddenSubstrings"
    | "allowedIds"
    | "allowedEmails"
    | "allowedAmounts"
  >,
): VerifierResult {
  const draftPart = answer.text.split("Grounded in:")[0];
  const result = verifySubstrings(
    answer.text,
    task.expectedSubstrings,
    [],
  );
  const forbiddenResult = verifySubstrings(
    draftPart,
    [],
    task.forbiddenSubstrings ?? [],
  );
  const details = [...result.details, ...forbiddenResult.details];
  const allowedIds = new Set(
    (task.allowedIds ?? []).map((s) => s.toUpperCase()),
  );
  const allowedEmails = new Set(
    (task.allowedEmails ?? []).map((s) => s.toLowerCase()),
  );
  const allowedAmounts = new Set((task.allowedAmounts ?? []).map(numericCore));
  for (const pattern of ID_PATTERNS) {
    for (const match of draftPart.matchAll(new RegExp(pattern.source, "g"))) {
      if (!allowedIds.has(match[0].toUpperCase())) {
        details.push(`invented or unlisted ID present: "${match[0]}"`);
      }
    }
  }
  for (const match of draftPart.matchAll(EMAIL_PATTERN)) {
    if (!allowedEmails.has(match[0].toLowerCase())) {
      details.push(`invented or unlisted email present: "${match[0]}"`);
    }
  }
  for (const match of draftPart.matchAll(AMOUNT_PATTERN)) {
    if (!allowedAmounts.has(numericCore(match[0]))) {
      details.push(`invented or unlisted amount present: "${match[0]}"`);
    }
  }
  return { pass: details.length === 0, details };
}

/** Parsed start of a proposed slot: weekday + minutes since midnight (PT). */
export interface ParsedSlot {
  weekday: string;
  startMinutes: number;
}

const WEEKDAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/i;
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

/** Parse "Tue Nov 10, 2026, 2:00pm PT" into weekday + start minutes. */
export function parseSlot(slot: string): ParsedSlot | null {
  const weekday = slot.match(WEEKDAY_RE);
  const time = slot.match(TIME_RE);
  if (!weekday || !time) return null;
  let hours = Number(time[1]);
  const minutes = time[2] ? Number(time[2]) : 0;
  const meridiem = time[3].toLowerCase();
  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return {
    weekday: weekday[1].toLowerCase(),
    startMinutes: hours * 60 + minutes,
  };
}

/** Teaching block: Tue/Thu 1:30–4:30pm PT (MEMORY.md — Tue/Thu work block). */
export const TEACHING_BLOCK = {
  weekdays: new Set(["tue", "thu"]),
  startMinutes: 13 * 60 + 30,
  endMinutes: 16 * 60 + 30,
} as const;

/** True when the slot overlaps the Tue/Thu 1:30–4:30pm PT teaching block. */
export function overlapsTeachingBlock(
  slot: string,
  durationMinutes = 60,
): boolean {
  const parsed = parseSlot(slot);
  if (!parsed) return false;
  if (!TEACHING_BLOCK.weekdays.has(parsed.weekday)) return false;
  const end = parsed.startMinutes + durationMinutes;
  return parsed.startMinutes < TEACHING_BLOCK.endMinutes &&
    end > TEACHING_BLOCK.startMinutes;
}

/**
 * Scheduling verifier: the answer must name a "Proposed:" slot that is one
 * of the task's candidates and does not overlap the teaching block, and the
 * teaching block must be named as the reason any candidate was rejected.
 */
export function verifySchedulingAnswer(
  answer: Answer,
  task: EvalTask,
): VerifierResult {
  const details: string[] = [];
  const proposedMatch = answer.text.match(/Proposed:\s*(.+)/);
  if (!proposedMatch) {
    details.push('no "Proposed:" line in the answer');
    return { pass: false, details };
  }
  const proposedLine = proposedMatch[1].split("[")[0].trim();
  const candidates = task.candidates ?? [];
  const named = candidates.find((c) =>
    normalize(proposedLine).includes(normalize(c))
  );
  if (!named) {
    details.push(
      `proposed slot is not one of the candidates: "${proposedLine}"`,
    );
  } else if (overlapsTeachingBlock(named)) {
    details.push(`proposed slot violates the teaching block: "${named}"`);
  }
  for (const want of task.expectedSubstrings) {
    if (!normalize(answer.text).includes(normalize(want))) {
      details.push(`missing expected substring: "${want}"`);
    }
  }
  return { pass: details.length === 0, details };
}
