/**
 * Calendar connector (plan §2.3, §3.1) — READ only in Phase 1.
 *
 * Least-privilege scope: read-only. The events scope needed to create holds
 * (`calendar.events`) is deliberately NOT requested in Phase 1.
 *
 * Every read method throws `CalendarNotConfiguredError`
 * ("Google OAuth not set up — see docs/runbook.md") when
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are absent.
 * No OAuth flow is attempted here: the connector only exchanges an existing
 * refresh token for an access token. OAuth setup itself is a manual,
 * user-side step (see docs/runbook.md).
 *
 * `createEvent` exists only as a stub that throws
 * "requires approved tier (Phase 2)". In Phase 1 the calendar agent proposes
 * slots from World facts; nothing is created through Google.
 */

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super(
      "Google OAuth not set up — see docs/runbook.md " +
        "(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)",
    );
    this.name = "CalendarNotConfiguredError";
  }
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: string[];
  description: string;
  htmlLink: string;
}

type FetchFn = typeof fetch;

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export class CalendarConnector {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly refreshToken: string | undefined;
  private readonly fetchFn: FetchFn;
  private accessToken: string | undefined;

  constructor(options: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    fetchFn?: FetchFn;
  } = {}) {
    this.clientId = options.clientId ?? env("GOOGLE_CLIENT_ID");
    this.clientSecret = options.clientSecret ?? env("GOOGLE_CLIENT_SECRET");
    this.refreshToken = options.refreshToken ?? env("GOOGLE_REFRESH_TOKEN");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isConfigured(): boolean {
    return [this.clientId, this.clientSecret, this.refreshToken]
      .every((v) => v !== undefined && v !== "");
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) throw new CalendarNotConfiguredError();
  }

  /** Exchange the stored refresh token for an access token (cached). */
  private async getAccessToken(): Promise<string> {
    this.requireConfigured();
    if (this.accessToken) return this.accessToken;
    const response = await this.fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: this.refreshToken!,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Google token exchange failed (${response.status}): ${await response
          .text()}`,
      );
    }
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) {
      throw new Error("Google token exchange returned no access token");
    }
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  private async api(path: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const response = await this.fetchFn(`https://www.googleapis.com${path}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Calendar API ${response.status} for ${path}: ${await response.text()}`,
      );
    }
    return await response.json() as unknown;
  }

  /** List events in a time window (ISO datetimes) on the primary calendar. */
  async listEvents(
    timeMin: string,
    timeMax: string,
  ): Promise<CalendarEventItem[]> {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    });
    const data = await this.api(
      `/calendar/v3/calendars/primary/events?${params}`,
    ) as {
      items?: Record<string, unknown>[];
    };
    return (data.items ?? []).map((e) => ({
      id: String(e["id"] ?? ""),
      summary: String(e["summary"] ?? ""),
      start: String(
        (e["start"] as Record<string, unknown> | undefined)?.["dateTime"] ??
          (e["start"] as Record<string, unknown> | undefined)?.["date"] ?? "",
      ),
      end: String(
        (e["end"] as Record<string, unknown> | undefined)?.["dateTime"] ??
          (e["end"] as Record<string, unknown> | undefined)?.["date"] ?? "",
      ),
      attendees:
        ((e["attendees"] as Record<string, unknown>[] | undefined) ?? [])
          .map((a) => String(a["email"] ?? "")),
      description: String(e["description"] ?? ""),
      htmlLink: String(e["htmlLink"] ?? ""),
    }));
  }

  /** Fetch one event by id. */
  async getEvent(id: string): Promise<CalendarEventItem> {
    const e = await this.api(
      `/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
    ) as Record<
      string,
      unknown
    >;
    return {
      id: String(e["id"] ?? id),
      summary: String(e["summary"] ?? ""),
      start: String(
        (e["start"] as Record<string, unknown> | undefined)?.["dateTime"] ??
          (e["start"] as Record<string, unknown> | undefined)?.["date"] ?? "",
      ),
      end: String(
        (e["end"] as Record<string, unknown> | undefined)?.["dateTime"] ??
          (e["end"] as Record<string, unknown> | undefined)?.["date"] ?? "",
      ),
      attendees:
        ((e["attendees"] as Record<string, unknown>[] | undefined) ?? [])
          .map((a) => String(a["email"] ?? "")),
      description: String(e["description"] ?? ""),
      htmlLink: String(e["htmlLink"] ?? ""),
    };
  }

  /** Phase 2 only: creating a calendar event requires the approved tier. */
  createEvent(
    _event: { summary: string; start: string; end: string },
  ): Promise<never> {
    return Promise.reject(
      new Error(
        "creating a calendar event requires approved tier (Phase 2) — " +
          "Phase 1 only proposes slots from World facts",
      ),
    );
  }
}
