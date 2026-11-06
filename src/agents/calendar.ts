/**
 * Calendar agent (plan §3.4) — read-only: conflicts, free slots, prep notes.
 *
 * Hard constraint: NEVER propose Tue/Thu 1:30–4:30pm PT (teaching block —
 * driving to/from codeCampus Villa in Santa Ana plus teaching 2:15–4pm PT).
 * The teaching block is treated as busy when computing free slots, so it
 * can never appear as a proposed time.
 *
 * Reasons over Event facts in the World; the Calendar connector read path
 * degrades gracefully when OAuth is absent (World facts + a note).
 */
import { CalendarConnector } from "../connectors/calendar.ts";
import type { Fact } from "../world/types.ts";
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";
import {
  claimFor,
  datePart,
  datePartPT,
  findFactsByClass,
  formatTimePT,
  timeMinutesPT,
} from "./common.ts";

/** Tue/Thu 1:30–4:30pm PT teaching block. Days use JS getUTCDay (Tue=2, Thu=4). */
export const TEACHING_BLOCK: {
  days: number[];
  startMinutes: number;
  endMinutes: number;
  label: string;
} = {
  days: [2, 4],
  startMinutes: 13 * 60 + 30,
  endMinutes: 16 * 60 + 30,
  label: "Tue/Thu 1:30–4:30pm PT teaching block",
};

/** True when `minutes` (since midnight PT) on `dateStr` falls in the teaching block. */
export function isTeachingBlock(dateStr: string, minutes: number): boolean {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return TEACHING_BLOCK.days.includes(day) &&
    minutes >= TEACHING_BLOCK.startMinutes &&
    minutes < TEACHING_BLOCK.endMinutes;
}

export interface FreeSlot {
  start: string;
  end: string;
}

interface BusyInterval {
  start: number;
  end: number;
}

function formatSlot(startMin: number, endMin: number): FreeSlot {
  const fmt = (m: number): string => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(min).padStart(2, "0")}${ampm}`;
  };
  return { start: fmt(startMin), end: fmt(endMin) };
}

/**
 * Free slots on `dateStr` between 9am–5pm PT: gaps of >= 30 minutes between
 * events, with the teaching block treated as busy. Never returns a slot
 * overlapping the teaching block.
 */
export function findFreeSlots(events: Fact[], dateStr: string): FreeSlot[] {
  const busy: BusyInterval[] = [];
  for (const e of events) {
    const start = timeMinutesPT(e.properties.start ?? "");
    const end = timeMinutesPT(e.properties.end ?? "");
    if (start !== undefined && end !== undefined && end > start) {
      busy.push({ start, end });
    }
  }
  if (isTeachingBlock(dateStr, TEACHING_BLOCK.startMinutes)) {
    busy.push({
      start: TEACHING_BLOCK.startMinutes,
      end: TEACHING_BLOCK.endMinutes,
    });
  }
  busy.sort((a, b) => a.start - b.start);
  const merged: BusyInterval[] = [];
  for (const interval of busy) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  const slots: FreeSlot[] = [];
  let cursor = 9 * 60;
  for (const interval of merged) {
    const start = Math.max(cursor, 9 * 60);
    const end = Math.min(interval.start, 17 * 60);
    if (end - start >= 30) slots.push(formatSlot(start, end));
    cursor = Math.max(cursor, interval.end);
  }
  if (17 * 60 - cursor >= 30) slots.push(formatSlot(cursor, 17 * 60));
  return slots;
}

/** Overlapping event pairs on the same day. */
export function findConflicts(events: Fact[]): [Fact, Fact][] {
  const sorted = [...events].sort((a, b) =>
    (a.properties.start ?? "").localeCompare(b.properties.start ?? "")
  );
  const conflicts: [Fact, Fact][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const aEnd = timeMinutesPT(sorted[i].properties.end ?? "");
      const bStart = timeMinutesPT(sorted[j].properties.start ?? "");
      if (aEnd === undefined || bStart === undefined) continue;
      if (bStart < aEnd) conflicts.push([sorted[i], sorted[j]]);
    }
  }
  return conflicts;
}

export interface CalendarInput {
  date?: string;
}

function asCalendarInput(input: unknown): CalendarInput {
  if (input === null || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  return { date: typeof o["date"] === "string" ? o["date"] : undefined };
}

export function createCalendarAgent(calendar?: CalendarConnector): SubAgent {
  return {
    name: "calendar",
    async run(input: unknown, ctx: AgentContext): Promise<AgentResult> {
      const notes: string[] = [];
      const date = asCalendarInput(input).date ?? ctx.today;

      try {
        const conn = calendar ?? new CalendarConnector();
        const live = await conn.listEvents(
          `${date}T00:00:00-08:00`,
          `${date}T23:59:59-08:00`,
        );
        notes.push(
          `Calendar connector returned ${live.length} event(s) for ${date}; schedule below is from World Event facts.`,
        );
      } catch (err) {
        notes.push(
          `Calendar connector unavailable (${
            err instanceof Error ? err.message : String(err)
          }) — using World facts only.`,
        );
      }

      const events = (await findFactsByClass(ctx.world, "Event"))
        .filter((f) =>
          (datePart(f.properties.start ?? "") ??
            datePartPT(f.properties.start ?? "")) === date
        )
        .sort((a, b) =>
          (a.properties.start ?? "").localeCompare(b.properties.start ?? "")
        );

      const claims = events.map((e) => {
        const time = formatTimePT(e.properties.start ?? "");
        const attendees = e.properties.attendees
          ? ` with ${e.properties.attendees}`
          : "";
        const kind = e.properties.kind ? ` (${e.properties.kind})` : "";
        return claimFor(
          e,
          `${time ? `${time} ` : ""}${e.label}${kind}${attendees}`,
        );
      });

      const summary: string[] = events.length === 0
        ? [`No events recorded in the World for ${date}.`]
        : events.map((e) => {
          const time = formatTimePT(e.properties.start ?? "");
          return `${time ? `${time} ` : ""}${e.label}`;
        });

      for (const [a, b] of findConflicts(events)) {
        claims.push(
          claimFor(
            b,
            `Conflict: "${a.label}" overlaps "${b.label}" on ${date}`,
          ),
        );
        summary.push(`Conflict: "${a.label}" overlaps "${b.label}".`);
      }

      const slots = findFreeSlots(events, date);
      if (slots.length > 0) {
        summary.push(
          `Free slots ${date}: ${
            slots.map((s) => `${s.start}–${s.end}`).join(", ")
          }.`,
        );
      } else {
        summary.push(`No free 30-minute slots 9am–5pm PT on ${date}.`);
      }
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (TEACHING_BLOCK.days.includes(day)) {
        notes.push(
          `${TEACHING_BLOCK.label} applies on ${date} — no slot is proposed inside it.`,
        );
      }
      return { agent: "calendar", claims, summary, notes };
    },
  };
}

export const calendarAgent: SubAgent = createCalendarAgent();
