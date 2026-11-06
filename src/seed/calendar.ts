/**
 * Google Calendar -> Facts (plan §4.3).
 *
 * Window: last 90 days + next 90 days (plan §2.2, decision 14).
 * Least-privilege scope: `https://www.googleapis.com/auth/calendar.readonly`
 * (read-only; event creation is a Phase 2 capability, not used here).
 *
 * Google OAuth is NOT set up yet: when GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are absent, this importer
 * throws `GOOGLE_OAUTH_NOT_SETUP` ("Google OAuth not set up — see
 * docs/runbook.md") and the seed runner warns and skips it. No OAuth flow
 * is attempted here — setup is a human step (see docs/runbook.md).
 *
 * With credentials present, the importer exchanges the refresh token for
 * an access token and reads the primary calendar over plain REST (no
 * googleapis SDK dependency).
 */
import {
  dedupFacts,
  emptyResult,
  factId,
  truncate,
  validateAndSplit,
} from "./common.ts";
import type { SeedResult } from "./common.ts";
import type { Fact } from "../world/types.ts";

export const GOOGLE_OAUTH_NOT_SETUP =
  "Google OAuth not set up — see docs/runbook.md";
export const CALENDAR_WINDOW_DAYS = 90;

export function googleOAuthConfigured(): boolean {
  return Boolean(
    Deno.env.get("GOOGLE_CLIENT_ID") &&
      Deno.env.get("GOOGLE_CLIENT_SECRET") &&
      Deno.env.get("GOOGLE_REFRESH_TOKEN"),
  );
}

export function requireGoogleOAuth(): void {
  if (!googleOAuthConfigured()) throw new Error(GOOGLE_OAUTH_NOT_SETUP);
}

/** Exchange the stored refresh token for a short-lived access token. */
export async function googleAccessToken(): Promise<string> {
  requireGoogleOAuth();
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Google token exchange failed (${response.status}): ${await response
        .text()}`,
    );
  }
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }
  return data.access_token;
}

export interface CalendarEventLike {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string }>;
}

/** Map Calendar API events to Event facts. Pure (no I/O) for tests. */
export function calendarEventsToFacts(
  events: CalendarEventLike[],
  retrievedAt: string,
): Fact[] {
  const facts: Fact[] = [];
  for (const event of events) {
    const start = event.start?.dateTime ?? event.start?.date;
    if (!start) continue;
    const summary = (event.summary ?? "(no title)").trim();
    if (summary.length < 2) continue;
    const attendees = (event.attendees ?? [])
      .map((a) => a.displayName ?? a.email ?? "")
      .filter(Boolean)
      .join(", ");
    facts.push({
      id: factId("Event", `calendar-${event.id}`),
      type: "Event",
      label: truncate(summary, 120),
      properties: {
        start,
        kind: "calendar",
        description: truncate(summary, 500),
        ...(event.end?.dateTime ?? event.end?.date
          ? { end: event.end!.dateTime ?? event.end!.date! }
          : {}),
        ...(attendees ? { attendees } : {}),
      },
      provenance: { source: `google-calendar:${event.id}`, retrievedAt },
    });
  }
  return facts;
}

export async function importCalendar(
  retrievedAt = new Date().toISOString(),
): Promise<SeedResult> {
  const result = emptyResult("calendar");
  requireGoogleOAuth();
  const accessToken = await googleAccessToken();
  const now = new Date();
  const timeMin = new Date(now.getTime() - CALENDAR_WINDOW_DAYS * 86400_000)
    .toISOString();
  const timeMax = new Date(now.getTime() + CALENDAR_WINDOW_DAYS * 86400_000)
    .toISOString();
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `Google Calendar list failed (${response.status}): ${await response
        .text()}`,
    );
  }
  const data = await response.json() as { items?: CalendarEventLike[] };
  const parsed = calendarEventsToFacts(data.items ?? [], retrievedAt);
  const deduped = dedupFacts(parsed);
  validateAndSplit(result, deduped.facts);
  result.counts["events"] = (data.items ?? []).length;
  result.counts["duplicates"] = deduped.duplicates;
  result.counts["facts"] = result.facts.length;
  result.counts["quarantined"] = result.quarantined.length;
  return result;
}
