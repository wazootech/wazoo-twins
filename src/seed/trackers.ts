/**
 * Opportunity tracker -> Facts (plan §4.3).
 *
 * Source: `~/workspace/your_files/wazoo-opportunity-tracker.md` (whole file).
 *
 * Parsing rules: lines of the form `- **Name** — description...` become
 * Opportunity facts; a date in the line becomes a Deadline fact as well
 * (description + due). Checklist lines under "This week's next actions"
 * become Task facts (status "done" for `[x]`, "open" for `[ ]`). A line
 * that cannot be parsed cleanly is skipped and counted, never guessed at.
 *
 * Stage is taken from the line itself: SUBMITTED, P0/P1/P2, Watch, or
 * "tracked" when the line states none of those.
 */
import {
  dedupFacts,
  emptyResult,
  factId,
  firstDate,
  homePath,
  readIfExists,
  slugify,
  truncate,
  validateAndSplit,
} from "./common.ts";
import type { SeedResult } from "./common.ts";
import type { Fact } from "../world/types.ts";

export const TRACKER_PATH = "workspace/your_files/wazoo-opportunity-tracker.md";

function stageFromLine(line: string): string {
  if (/SUBMITTED/i.test(line)) return "submitted";
  const p = line.match(/\b(P0|P1|P2)\b/);
  if (p) return p[1].toLowerCase();
  if (/\bWatch\b/.test(line)) return "watch";
  if (/Rejected/i.test(line)) return "rejected";
  if (/Withdrawn/i.test(line)) return "withdrawn";
  if (/Missed/i.test(line)) return "missed";
  return "tracked";
}

/**
 * Parse tracker markdown into candidate facts. Pure (no I/O) for tests.
 * Returns facts plus a skipped count.
 */
export function parseTracker(
  text: string,
  retrievedAt: string,
): { facts: Fact[]; skipped: number; parsed: number } {
  const facts: Fact[] = [];
  let skipped = 0;
  let parsed = 0;
  let inNextActions = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (/^##\s+/.test(line)) {
      inNextActions = /next actions/i.test(line);
      continue;
    }
    if (!line.startsWith("- ")) continue;
    parsed++;

    if (inNextActions) {
      const check = line.match(/^-\s+\[(x| )\]\s+(.*)$/i);
      if (!check) {
        skipped++;
        continue;
      }
      const description = truncate(check[2].replace(/\*\*/g, ""));
      if (description.length < 10) {
        skipped++;
        continue;
      }
      const due = firstDate(check[2]);
      facts.push({
        id: factId("Task", slugify(description)),
        type: "Task",
        label: description.slice(0, 120),
        properties: {
          description,
          status: check[1].toLowerCase() === "x" ? "done" : "open",
          owner: "Ethan Davidson",
          ...(due ? { due } : {}),
        },
        provenance: { source: "wazoo-opportunity-tracker.md", retrievedAt },
      });
      continue;
    }

    const named = line.match(/^-\s+\*\*([^*]+)\*\*\s*[—–-]\s*(.*)$/);
    if (!named) {
      skipped++;
      continue;
    }
    const name = named[1].trim();
    const rest = named[2].trim();
    if (name.length < 2 || rest.length < 10) {
      skipped++;
      continue;
    }
    const stage = stageFromLine(line);
    const due = firstDate(rest);
    const nextStep = rest.match(/Next step:\s*([^.;]+)/i)?.[1]?.trim();
    const description = truncate(`${name} — ${rest}`, 1000);
    facts.push({
      id: factId("Opportunity", slugify(name)),
      type: "Opportunity",
      label: name,
      properties: {
        name,
        stage,
        description,
        ...(due ? { due } : {}),
        ...(nextStep ? { nextAction: truncate(nextStep, 300) } : {}),
      },
      provenance: { source: "wazoo-opportunity-tracker.md", retrievedAt },
    });
    if (due) {
      facts.push({
        id: factId("Deadline", `${due}-${slugify(name)}`),
        type: "Deadline",
        label: `${name} deadline`,
        properties: { description: truncate(`${name}: ${rest}`, 500), due },
        provenance: { source: "wazoo-opportunity-tracker.md", retrievedAt },
      });
    }
  }
  return { facts, skipped, parsed };
}

export async function importTrackers(
  retrievedAt = new Date().toISOString(),
): Promise<SeedResult> {
  const result = emptyResult("trackers");
  const text = await readIfExists(homePath(TRACKER_PATH));
  if (text === undefined) {
    throw new Error(`opportunity tracker not found at ~/${TRACKER_PATH}`);
  }
  const parsed = parseTracker(text, retrievedAt);
  const deduped = dedupFacts(parsed.facts);
  validateAndSplit(result, deduped.facts);
  result.counts["parsed"] = parsed.parsed;
  result.counts["skipped"] = parsed.skipped;
  result.counts["duplicates"] = deduped.duplicates;
  result.counts["facts"] = result.facts.length;
  result.counts["quarantined"] = result.quarantined.length;
  return result;
}
