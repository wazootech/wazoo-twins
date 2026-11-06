/**
 * Shared helpers for the Twin's agents (orchestrator + sub-agents).
 *
 * Covers the two things every agent needs: citing World facts, and reading
 * the ISO dates the World stores. Nothing here calls a model or the network.
 */
import { Classes } from "../world/schema.ts";
import type { WorldClient } from "../world/client.ts";
import type { Citation, CitedClaim, Fact } from "../world/types.ts";

/** A citation pointing at one World fact. */
export function citationFor(fact: Fact): Citation {
  return { factId: fact.id, source: fact.provenance.source };
}

/** A verified claim backed by one World fact. */
export function claimFor(fact: Fact, text: string): CitedClaim {
  return { text, citations: [citationFor(fact)], verified: true };
}

/**
 * Find facts of a class, tolerating either storage convention for `type`:
 * the short class name ("Event") or the full ontology IRI
 * ("https://wazoo.dev/twins#Event").
 *
 * Contract friction (Nov 6, 2026): `src/world/audit.ts` stores the full IRI
 * (`type: Classes.Run`) while `src/world/schema.ts` `validateFact` keys
 * `RequiredProps` by short name, so it is not settled which form the World
 * backend stores. This helper tries the short name, then the full IRI, then
 * filters all facts by type suffix, so agents work under either convention.
 */
export async function findFactsByClass(
  world: WorldClient,
  className: keyof typeof Classes,
): Promise<Fact[]> {
  const byShort = await world.findFacts({ type: className });
  if (byShort.length > 0) return byShort;
  const byIri = await world.findFacts({ type: Classes[className] });
  if (byIri.length > 0) return byIri;
  const all = await world.findFacts({});
  return all.filter((f) =>
    f.type === className ||
    f.type.endsWith(`#${className}`) ||
    f.type.endsWith(`/${className}`)
  );
}

/** Leading "YYYY-MM-DD" of an ISO date/datetime string, if present. */
export function datePart(value: string): string | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : undefined;
}

/** Parse an ISO date/datetime; undefined when unparseable (never throws). */
export function parseDate(value: string): Date | undefined {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "YYYY-MM-DD" `days` after `dateStr` ("YYYY-MM-DD"). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date ("YYYY-MM-DD") in America/Los_Angeles. */
export function todayPT(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Weekday name ("Friday") for a "YYYY-MM-DD" date, in America/Los_Angeles. */
export function weekdayPT(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
  }).format(new Date(`${dateStr}T12:00:00Z`));
}

/** Calendar date ("YYYY-MM-DD") of an ISO datetime, in America/Los_Angeles. */
export function datePartPT(iso: string): string | undefined {
  const d = parseDate(iso);
  if (!d) return undefined;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Minutes since midnight of an ISO datetime, in America/Los_Angeles. */
export function timeMinutesPT(iso: string): number | undefined {
  const d = parseDate(iso);
  if (!d) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

/** "11:00am" style rendering of an ISO datetime, in America/Los_Angeles. */
export function formatTimePT(iso: string): string {
  const mins = timeMinutesPT(iso);
  if (mins === undefined) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

/** Newest provenance first (for merge conflict resolution by recency). */
export function byProvenanceDesc(a: Fact, b: Fact): number {
  return b.provenance.retrievedAt.localeCompare(a.provenance.retrievedAt);
}

/** Shorten text to `max` chars with an ellipsis; leaves short text alone. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
