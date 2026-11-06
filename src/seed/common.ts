/**
 * Shared helpers for the seed importers (plan §4.3 / Appendix A).
 *
 * Every importer returns a `SeedResult`: valid facts, quarantined facts
 * (validation failures, never inserted), and counts. Validation is done
 * here, centrally, with `validateFact()` from the ontology — an invalid
 * fact is quarantined, never half-landed.
 */
import { validateFact } from "../world/schema.ts";
import type { Fact, Provenance } from "../world/types.ts";

export interface QuarantinedFact {
  /** The fact as the importer built it (may be partial/invalid). */
  fact: unknown;
  errors: string[];
}

export interface SeedResult {
  /** Importer name, e.g. "memory-md". Used for quarantine filenames. */
  source: string;
  /** Valid facts, ready to insert. */
  facts: Fact[];
  /** Invalid facts, with their validation errors. Never inserted. */
  quarantined: QuarantinedFact[];
  counts: Record<string, number>;
}

export function emptyResult(source: string): SeedResult {
  return { source, facts: [], quarantined: [], counts: {} };
}

/** The Twin's data dir (outside the repo — seed data is never committed). */
export function dataDir(): string {
  const home = Deno.env.get("HOME") ?? "";
  return `${home}/workspace/wazoo-twins-data`;
}

export function quarantineDir(): string {
  return `${dataDir()}/quarantine`;
}

/** Write one source's quarantined facts to the data dir (never the repo). */
export async function writeQuarantine(
  source: string,
  quarantined: QuarantinedFact[],
): Promise<string> {
  const dir = quarantineDir();
  await Deno.mkdir(dir, { recursive: true });
  const path = `${dir}/${source}.json`;
  await Deno.writeTextFile(
    path,
    JSON.stringify(
      { source, quarantinedAt: new Date().toISOString(), quarantined },
      null,
      2,
    ),
  );
  return path;
}

/** Split built facts into valid / quarantined by the ontology gate. */
export function validateAndSplit(
  result: SeedResult,
  candidates: Array<Omit<Fact, "provenance"> & { provenance: Provenance }>,
): void {
  for (const fact of candidates) {
    const errors = validateFact(fact);
    if (!fact.label.trim()) errors.push("missing label");
    if (!fact.provenance.source || !fact.provenance.retrievedAt) {
      errors.push("missing provenance (source + retrievedAt required)");
    }
    if (errors.length > 0) {
      result.quarantined.push({ fact, errors });
    } else {
      result.facts.push(fact);
    }
  }
}

/** Deduplicate facts by id, keeping the first occurrence. */
export function dedupFacts(
  facts: Fact[],
): { facts: Fact[]; duplicates: number } {
  const seen = new Set<string>();
  const kept: Fact[] = [];
  let duplicates = 0;
  for (const fact of facts) {
    if (seen.has(fact.id)) {
      duplicates++;
      continue;
    }
    seen.add(fact.id);
    kept.push(fact);
  }
  return { facts: kept, duplicates };
}

/** Slugify a label for a stable fact id: lowercase, words joined by "-". */
export function slugify(text: string, maxWords = 8): string {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
  return words.join("-").slice(0, 80) || "untitled";
}

/** Stable fact id: `twin:<type-lower>/<slug>`. */
export function factId(type: string, slug: string): string {
  return `twin:${type.toLowerCase()}/${slug}`;
}

/** Truncate long text for a property value (keeps quads sane). */
/**
 * Collapse whitespace and cap length. Default cap is 4000 chars: the
 * longest top-level bullet in MEMORY.md is ~3,545 chars, and truncating
 * shorter loses facts mid-bullet — e.g. the Purav Patel bullet is 1,484
 * chars with the meetup venue ("Airoma Cafe") at char 1,319, which a
 * 1000-char cap silently dropped from the World (smoke-14, Nov 6, 2026).
 * Labels are sliced separately by callers; descriptions keep full text.
 */
export function truncate(text: string, max = 4000): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  sept: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Parse a date out of free text. Accepts ISO (`2026-11-06`, `2026-11-06T...`)
 * and long form (`Nov 6, 2026`, `Fri Nov 6, 2026`, `6 November 2026`).
 * A bare month + day with no year is read as 2026: the whole seed corpus
 * is the 2026 record, and a year is never invented for any other year.
 * Returns an ISO date (`YYYY-MM-DD`) or undefined when nothing parses.
 */
export function parseDateLoose(text: string): string | undefined {
  const iso = text.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const monthNames = Object.keys(MONTHS).join("|");
  const longForm = new RegExp(
    `\\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\s+)?(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?\\b`,
    "i",
  );
  const m = text.match(longForm);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : 2026;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${
        String(day).padStart(2, "0")
      }`;
    }
  }
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?\\s+(20\\d\\d)\\b`,
    "i",
  );
  const d = text.match(dayFirst);
  if (d) {
    const month = MONTHS[d[2].toLowerCase()];
    if (month) {
      return `${d[3]}-${String(month).padStart(2, "0")}-${
        String(Number(d[1])).padStart(2, "0")
      }`;
    }
  }
  return undefined;
}

/** First date in the text, or undefined. */
export function firstDate(text: string): string | undefined {
  return parseDateLoose(text);
}

export interface DatedMatch {
  date: string;
  /** Character offset of the match in the source text. */
  index: number;
}

/**
 * All dates in the text, with their character offsets. Same patterns as
 * parseDateLoose (ISO, long form, day-first). A span matching two patterns
 * is reported once.
 */
export function findDates(text: string): DatedMatch[] {
  const found: DatedMatch[] = [];
  const monthNames = Object.keys(MONTHS).join("|");
  const isoRe = /\b(20\d\d)-(\d\d)-(\d\d)\b/g;
  for (const m of text.matchAll(isoRe)) {
    found.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      index: m.index ?? 0,
    });
  }
  const longRe = new RegExp(
    `\\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\s+)?(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?\\b`,
    "gi",
  );
  for (const m of text.matchAll(longRe)) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : 2026;
    if (month && day >= 1 && day <= 31) {
      found.push({
        date: `${year}-${String(month).padStart(2, "0")}-${
          String(day).padStart(2, "0")
        }`,
        index: m.index ?? 0,
      });
    }
  }
  const dayFirstRe = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?\\s+(20\\d\\d)\\b`,
    "gi",
  );
  for (const m of text.matchAll(dayFirstRe)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) {
      found.push({
        date: `${m[3]}-${String(month).padStart(2, "0")}-${
          String(Number(m[1])).padStart(2, "0")
        }`,
        index: m.index ?? 0,
      });
    }
  }
  const byIndex = new Map(found.map((f) => [f.index, f]));
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * The due date for a Deadline bullet: the first date at or after the
 * deadline keyword, falling back to the nearest date before it.
 *
 * The anchor is the first strong deadline word ("due", "deadline"); if
 * there is none, the first weak one ("submit", "request", "deliver").
 * The first date in the bullet is usually the log date, not the deadline
 * (e.g. "CCPA request SENT Fri Nov 6, 2026 ... Confirmation due Fri
 * Nov 20, 2026" is due Nov 20, not Nov 6), and bare character distance
 * misfires when dates cluster on both sides of the keyword (e.g. "...
 * reminder Nov 4, due within four days, about Nov 8" — Nov 4 is nearer
 * to "due" than Nov 8, but Nov 8 is the due date). Deadline language
 * points forward, so "first date after the keyword" is the right rule.
 * Returns undefined when the text has no deadline keyword or no date.
 */
export function deadlineDate(text: string): string | undefined {
  // A "~"-prefixed date ("(so ~Nov 8)") is the author stating an
  // approximate computed deadline — it wins over the keyword-adjacent
  // date, which for a relative deadline ("within four days") is the log
  // date, not the due date. In the corpus the "~" date is always the
  // NBIS ~Nov 8 deadline.
  const approx = findDates(text).find((d) =>
    text.slice(Math.max(0, d.index - 2), d.index).includes("~")
  );
  if (approx) return approx.date;
  const strong = /\b(due|deadline)\b/i.exec(text);
  const weak = /\b(submit|request|deliver)\b/i.exec(text);
  const anchor = strong ?? weak;
  if (!anchor) return undefined;
  const dates = findDates(text);
  const after = dates.find((d) => d.index >= anchor.index);
  if (after) return after.date;
  const before = dates.filter((d) => d.index < anchor.index);
  return before.length > 0 ? before[before.length - 1].date : undefined;
}

/** Read a file as text; returns undefined when it does not exist. */
export async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

export function homePath(relative: string): string {
  const home = Deno.env.get("HOME") ?? "";
  return `${home}/${relative}`;
}
