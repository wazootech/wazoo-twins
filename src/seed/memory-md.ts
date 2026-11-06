/**
 * MEMORY.md + daily notes + USER.md + people files -> Facts (plan §4.3).
 *
 * Sources (all read from the home directory, never the repo):
 * - `~/MEMORY.md` (whole file, sectioned)
 * - `~/memory/*.md` daily notes (whole files)
 * - `~/USER.md`
 * - `~/memory/people/*.md` (one Person fact per file)
 *
 * Parsing rules: only top-level bullet lines (`- ...` at column 0) become
 * facts; a line that cannot be parsed cleanly is skipped and counted, never
 * guessed at. Classification (ontology classes are fixed — there is no
 * generic "Note" class, so a durable fact with no date and no decision
 * lands as a Commitment with status "noted"; a Note class is a follow-up
 * for the ontology owner, not invented here):
 * - `[event|...]` tag (daily notes) -> Event (start = date in the line, else
 *   the file/section date; kind "event")
 * - "decided / chose / rejected / approved / agreed" + a date -> Decision
 * - a real deadline (see hasDeadline) -> Deadline
 * - anything else -> Commitment, status "noted"
 *
 * Every fact carries provenance { source: "<file>#L<line>", retrievedAt }.
 */
import {
  deadlineDate,
  dedupFacts,
  emptyResult,
  factId,
  firstDate,
  homePath,
  parseDateLoose,
  readIfExists,
  slugify,
  truncate,
  validateAndSplit,
} from "./common.ts";
import type { SeedResult } from "./common.ts";
import type { Fact } from "../world/types.ts";

interface Bullet {
  text: string;
  line: number;
  section: string;
}

function parseBullets(text: string): Bullet[] {
  const bullets: Bullet[] = [];
  let section = "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^##\s+(.*)/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    // Top-level bullets only: nested bullets (e.g. `  - claim:` in daily
    // notes) are sub-items of the bullet above, not facts of their own.
    if (!line.startsWith("- ")) continue;
    const text = line.slice(2).trim();
    if (text.length < 10) continue;
    bullets.push({ text, line: i + 1, section });
  }
  return bullets;
}

/**
 * True when the bullet states a real deadline.
 *
 * Strong deadline words ("due", "deadline") always count — a bullet
 * containing "due" states a deadline somewhere, and deadlineDate picks
 * the date the strong keyword points at.
 *
 * Weak words ("submit", "request", "deliver") count only when a date is
 * stated in the same clause as the keyword: before any parenthetical
 * log-date or sentence boundary, within 80 characters. Otherwise the
 * keyword is incidental — "at Ethan's request", "CCPA request drafted
 * ... (Nov 6, 2026)" — and the bullet is a Commitment, not a Deadline
 * "due" on its log date. Without this, the morning brief's 7-day list
 * fills with log entries due on the log date (morning-brief dry run,
 * Nov 6, 2026: eight items "due 2026-11-06" that are not due at all),
 * while real deadlines stated as "Request ... by Tue Dec 1, 2026" still
 * classify, because the date follows the keyword in the same clause.
 */
function hasDeadline(text: string): boolean {
  if (/\b(due|deadline)\b/i.test(text)) return true;
  const weak = /\b(submit|request|deliver)\b/i.exec(text);
  if (!weak) return false;
  // A completion verb right after the keyword ("request SENT Nov 6")
  // means the action already happened on that date — a log entry, not a
  // deadline. (A strong keyword elsewhere in the bullet still counts;
  // this check only runs when there is no "due"/"deadline".)
  const rightAfter = text.slice(
    weak.index + weak[0].length,
    weak.index + weak[0].length + 12,
  );
  if (
    /^\s*(sent|drafted|completed|done|merged|filed|submitted|closed|signed|delivered|published|posted)\b/i
      .test(rightAfter)
  ) return false;
  const after = text.slice(
    weak.index + weak[0].length,
    weak.index + weak[0].length + 80,
  );
  const boundary = after.search(/\(|\.\s|;\s| — /);
  const clause = boundary === -1 ? after : after.slice(0, boundary);
  return firstDate(clause) !== undefined;
}

function classifyBullet(
  bullet: Bullet,
  contextDate: string | undefined,
  sourceTag: string,
  sourceLabel: string,
  retrievedAt: string,
): Fact | undefined {
  const text = bullet.text;
  const date = firstDate(text) ?? contextDate;
  const clean = truncate(
    text.replace(/^\[(event|fact|update|preference)\|[a-z]+\]\s*/i, ""),
  );
  const slug = slugify(clean);
  const provenance = { source: sourceLabel, retrievedAt };

  if (/^\[event\|/i.test(text)) {
    if (!date) return undefined;
    return {
      id: factId("Event", `${date}-${slug}`),
      type: "Event",
      label: clean.slice(0, 120),
      properties: { start: date, kind: "event", description: clean },
      provenance,
    };
  }
  if (
    date &&
    /\b(decided|decision|chose|chosen|rejected|approved|agreed)\b/i.test(text)
  ) {
    return {
      id: factId("Decision", slug),
      type: "Decision",
      label: clean.slice(0, 120),
      properties: { description: clean, decidedAt: date },
      provenance,
    };
  }
  if (date && hasDeadline(text)) {
    // The due date is the date the deadline language points at
    // (deadlineDate), not the first date in the bullet (usually the log
    // date). Falls back to the first date when no keyword-anchored date
    // exists.
    const dueDate = deadlineDate(text) ?? date;
    return {
      id: factId("Deadline", `${dueDate}-${slug}`),
      type: "Deadline",
      label: clean.slice(0, 120),
      properties: { description: clean, due: dueDate },
      provenance,
    };
  }
  return {
    id: factId("Commitment", `${sourceTag}-${slug}`),
    type: "Commitment",
    label: clean.slice(0, 120),
    properties: { description: clean, status: "noted" },
    provenance,
  };
}

/**
 * Parse one markdown document's bullets into candidate facts.
 * `contextDate` is the file/section date used when a bullet has no date
 * of its own (daily-note filename date, or a dated section heading).
 */
export function parseMemoryMarkdown(
  text: string,
  sourceLabel: string,
  sourceTag: string,
  contextDate: string | undefined,
  retrievedAt: string,
): { facts: Fact[]; skipped: number; parsed: number } {
  const bullets = parseBullets(text);
  const facts: Fact[] = [];
  let skipped = 0;
  for (const bullet of bullets) {
    // A dated section heading (e.g. "Flush — Fri Nov 6, 2026") supplies
    // the context date for bullets under it.
    const sectionDate = parseDateLoose(bullet.section) ?? contextDate;
    const fact = classifyBullet(
      bullet,
      sectionDate,
      sourceTag,
      sourceLabel,
      retrievedAt,
    );
    if (fact) facts.push(fact);
    else skipped++;
  }
  return { facts, skipped, parsed: bullets.length };
}

function personNameFromFilename(path: string): string {
  const base = path.split("/").pop() ?? "";
  const stem = base.replace(/\.md$/, "");
  return stem.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** One Person fact per people file, from its first bullet (role/relationship). */
export function parsePersonFile(
  text: string,
  name: string,
  sourceLabel: string,
  retrievedAt: string,
): Fact | undefined {
  const bullets = parseBullets(text);
  const first = bullets[0]?.text ?? "";
  const email = first.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    ?.[0];
  const relationship = truncate(first.split(/[—–]/)[0], 300) || "contact";
  return {
    id: factId("Person", slugify(name)),
    type: "Person",
    label: name,
    properties: {
      name,
      relationship,
      ...(email ? { contact: email } : {}),
    },
    provenance: { source: sourceLabel, retrievedAt },
  };
}

export async function importMemoryMd(
  retrievedAt = new Date().toISOString(),
): Promise<SeedResult> {
  const result = emptyResult("memory-md");
  const candidates: Fact[] = [];
  let files = 0;
  let skipped = 0;

  const memoryMd = await readIfExists(homePath("MEMORY.md"));
  if (memoryMd !== undefined) {
    files++;
    const parsed = parseMemoryMarkdown(
      memoryMd,
      "MEMORY.md",
      "memory",
      undefined,
      retrievedAt,
    );
    candidates.push(...parsed.facts);
    skipped += parsed.skipped;
    result.counts["memoryBullets"] = parsed.parsed;
  }

  const userMd = await readIfExists(homePath("USER.md"));
  if (userMd !== undefined) {
    files++;
    const phone = userMd.match(/\(\d{3}\)\s*\d{3}-\d{4}/)?.[0];
    candidates.push({
      id: factId("Person", "ethan-davidson"),
      type: "Person",
      label: "Ethan Davidson",
      properties: {
        name: "Ethan Davidson",
        relationship: "self — the Twin's owner",
        ...(phone ? { contact: phone } : {}),
      },
      provenance: { source: "USER.md", retrievedAt },
    });
    if (/Wazoo/i.test(userMd)) {
      candidates.push({
        id: factId("Organization", "wazoo"),
        type: "Organization",
        label: "Wazoo",
        properties: { name: "Wazoo", orgType: "company" },
        provenance: { source: "USER.md", retrievedAt },
      });
    }
  }

  // Daily notes: ~/memory/*.md (not people/, not INDEX.md).
  const dailyDir = homePath("memory");
  try {
    for await (const entry of Deno.readDir(dailyDir)) {
      if (!entry.isFile || !/^20\d\d-\d\d-\d\d\.md$/.test(entry.name)) continue;
      files++;
      const text = await Deno.readTextFile(`${dailyDir}/${entry.name}`);
      const contextDate = entry.name.replace(/\.md$/, "");
      const parsed = parseMemoryMarkdown(
        text,
        `memory/${entry.name}`,
        `daily-${contextDate}`,
        contextDate,
        retrievedAt,
      );
      candidates.push(...parsed.facts);
      skipped += parsed.skipped;
      result.counts[`daily:${entry.name}`] = parsed.parsed;
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  // People files: ~/memory/people/*.md (not INDEX.md).
  const peopleDir = homePath("memory/people");
  try {
    for await (const entry of Deno.readDir(peopleDir)) {
      if (
        !entry.isFile || !entry.name.endsWith(".md") ||
        entry.name === "INDEX.md"
      ) continue;
      files++;
      const text = await Deno.readTextFile(`${peopleDir}/${entry.name}`);
      const name = personNameFromFilename(entry.name);
      const fact = parsePersonFile(
        text,
        name,
        `memory/people/${entry.name}`,
        retrievedAt,
      );
      if (fact) candidates.push(fact);
      result.counts[`people:${entry.name}`] = 1;
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  const deduped = dedupFacts(candidates);
  validateAndSplit(result, deduped.facts);
  result.counts["files"] = files;
  result.counts["skipped"] = skipped;
  result.counts["duplicates"] = deduped.duplicates;
  result.counts["facts"] = result.facts.length;
  result.counts["quarantined"] = result.quarantined.length;
  return result;
}
