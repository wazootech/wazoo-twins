/**
 * Gmail connector (plan §2.3, §3.1) — READ + draft-shape only in Phase 1.
 *
 * Least-privilege scopes: read-only for triage, compose for drafts.
 * The send scope (`gmail.send`) is deliberately NOT requested in Phase 1.
 *
 * Every read method throws `GmailNotConfiguredError`
 * ("Google OAuth not set up — see docs/runbook.md") when
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are absent.
 * No OAuth flow is attempted here: the connector only exchanges an existing
 * refresh token for an access token. OAuth setup itself is a manual,
 * user-side step (see docs/runbook.md).
 *
 * `createDraft` and `send` exist only as stubs that throw
 * "requires approved tier (Phase 2)". In Phase 1 the inbox agent builds
 * drafts in memory and presents them to Ethan; nothing is created or sent
 * through Google.
 */

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
] as const;

export class GmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Google OAuth not set up — see docs/runbook.md " +
        "(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)",
    );
    this.name = "GmailNotConfiguredError";
  }
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailMessage extends GmailMessageSummary {
  body: string;
}

type FetchFn = typeof fetch;

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

function header(headers: Record<string, unknown>[], name: string): string {
  const found = headers.find((h) =>
    String(h["name"] ?? "").toLowerCase() === name
  );
  return found ? String(found["value"] ?? "") : "";
}

export class GmailConnector {
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
    if (!this.isConfigured()) throw new GmailNotConfiguredError();
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
    const response = await this.fetchFn(`https://gmail.googleapis.com${path}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Gmail API ${response.status} for ${path}: ${await response.text()}`,
      );
    }
    return await response.json() as unknown;
  }

  /** List recent messages matching a Gmail search query (default: inbox). */
  async listMessages(
    query = "",
    maxResults = 10,
  ): Promise<GmailMessageSummary[]> {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (query.trim()) params.set("q", query.trim());
    const list = await this.api(`/gmail/v1/users/me/messages?${params}`) as {
      messages?: { id: string; threadId: string }[];
    };
    const summaries: GmailMessageSummary[] = [];
    for (const m of list.messages ?? []) {
      const full = await this.api(
        `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      ) as {
        snippet?: string;
        payload?: { headers?: Record<string, unknown>[] };
      };
      const headers = full.payload?.headers ?? [];
      summaries.push({
        id: m.id,
        threadId: m.threadId,
        subject: header(headers, "subject"),
        from: header(headers, "from"),
        date: header(headers, "date"),
        snippet: full.snippet ?? "",
      });
    }
    return summaries;
  }

  /** Fetch one message with its plain-text body (best effort). */
  async getMessage(id: string): Promise<GmailMessage> {
    const full = await this.api(
      `/gmail/v1/users/me/messages/${id}?format=full`,
    ) as {
      id?: string;
      threadId?: string;
      snippet?: string;
      payload?: Record<string, unknown>;
    };
    const payload = full.payload ?? {};
    const headers =
      (payload["headers"] as Record<string, unknown>[] | undefined) ?? [];
    return {
      id: full.id ?? id,
      threadId: full.threadId ?? "",
      subject: header(headers, "subject"),
      from: header(headers, "from"),
      date: header(headers, "date"),
      snippet: full.snippet ?? "",
      body: extractText(payload),
    };
  }

  /** Phase 2 only: creating a Gmail draft requires the approved tier. */
  createDraft(
    _to: string,
    _subject: string,
    _body: string,
  ): Promise<never> {
    return Promise.reject(
      new Error(
        "creating a Gmail draft requires approved tier (Phase 2) — " +
          "Phase 1 drafts are built in memory by the inbox agent and presented to Ethan",
      ),
    );
  }

  /** Phase 2 only: sending requires the approved tier. */
  send(_to: string, _subject: string, _body: string): Promise<never> {
    return Promise.reject(
      new Error(
        "sending email requires approved tier (Phase 2) — " +
          "no email is sent in Phase 1",
      ),
    );
  }
}

function decodeBody(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return atob(normalized);
  } catch {
    return "";
  }
}

function extractText(payload: Record<string, unknown>): string {
  const mime = String(payload["mimeType"] ?? "");
  if (
    mime === "text/plain" && typeof payload["body"] === "object" &&
    payload["body"] !== null
  ) {
    const data = (payload["body"] as Record<string, unknown>)["data"];
    if (typeof data === "string") return decodeBody(data);
  }
  const parts = payload["parts"] as Record<string, unknown>[] | undefined;
  if (parts) {
    for (const part of parts) {
      const text = extractText(part);
      if (text) return text;
    }
  }
  return "";
}
