/**
 * Gmail -> Facts (plan §4.3).
 *
 * Window: last 90 days, threads with Ethan as a participant (plan §2.2,
 * decision 14). Least-privilege scope:
 * `https://www.googleapis.com/auth/gmail.readonly` (read-only; send/draft
 * are Phase 2 capabilities, not used here).
 *
 * Google OAuth is NOT set up yet: when GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are absent, this importer
 * throws `GOOGLE_OAUTH_NOT_SETUP` ("Google OAuth not set up — see
 * docs/runbook.md") and the seed runner warns and skips it. No OAuth flow
 * is attempted here — setup is a human step (see docs/runbook.md).
 *
 * With credentials present, the importer exchanges the refresh token for
 * an access token and reads Gmail over plain REST (no googleapis SDK
 * dependency). One Thread fact per thread; `needsReply` is "yes" when the
 * latest message in the thread is from someone other than Ethan (his
 * address is ethan.r.davidson@gmail.com, per the record), "no" otherwise.
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
import {
  GOOGLE_OAUTH_NOT_SETUP,
  googleAccessToken,
  requireGoogleOAuth,
} from "./calendar.ts";

export { GOOGLE_OAUTH_NOT_SETUP };
export const GMAIL_WINDOW_DAYS = 90;
export const GMAIL_MAX_MESSAGES = 100;
const ETHAN_EMAIL = "ethan.r.davidson@gmail.com";

export interface GmailMessageLike {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet?: string;
}

interface GmailThreadGroup {
  threadId: string;
  messages: GmailMessageLike[];
}

/** Group messages into threads (newest message last). Pure for tests. */
export function groupGmailThreads(
  messages: GmailMessageLike[],
): GmailThreadGroup[] {
  const groups = new Map<string, GmailMessageLike[]>();
  for (const message of messages) {
    const list = groups.get(message.threadId) ?? [];
    list.push(message);
    groups.set(message.threadId, list);
  }
  return [...groups.entries()].map(([threadId, list]) => ({
    threadId,
    messages: list.sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

/** Map Gmail threads to Thread facts. Pure (no I/O) for tests. */
export function gmailThreadsToFacts(
  threads: GmailThreadGroup[],
  retrievedAt: string,
): Fact[] {
  const facts: Fact[] = [];
  for (const thread of threads) {
    if (thread.messages.length === 0) continue;
    const latest = thread.messages[thread.messages.length - 1];
    const participants = [
      ...new Set(
        thread.messages.flatMap((m) => [m.from, m.to]).filter(Boolean),
      ),
    ].join(", ");
    if (!participants) continue;
    const needsReply = latest.from.toLowerCase().includes(ETHAN_EMAIL)
      ? "no"
      : "yes";
    facts.push({
      id: factId("Thread", `gmail-${thread.threadId}`),
      type: "Thread",
      label: truncate(latest.subject || "(no subject)", 120),
      properties: {
        channel: "gmail",
        participants: truncate(participants, 500),
        lastMessage: truncate(
          `${latest.date} ${latest.from}: ${latest.subject}${
            latest.snippet ? ` — ${latest.snippet}` : ""
          }`,
          500,
        ),
        needsReply,
      },
      provenance: { source: `gmail:thread/${thread.threadId}`, retrievedAt },
    });
  }
  return facts;
}

function header(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value ?? "";
}

export async function importGmail(
  retrievedAt = new Date().toISOString(),
): Promise<SeedResult> {
  const result = emptyResult("gmail");
  requireGoogleOAuth();
  const accessToken = await googleAccessToken();
  const auth = { Authorization: `Bearer ${accessToken}` };

  const listUrl = new URL(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  );
  listUrl.searchParams.set("q", `newer:${GMAIL_WINDOW_DAYS}d`);
  listUrl.searchParams.set("maxResults", String(GMAIL_MAX_MESSAGES));
  const listResponse = await fetch(listUrl, { headers: auth });
  if (!listResponse.ok) {
    throw new Error(
      `Gmail list failed (${listResponse.status}): ${await listResponse
        .text()}`,
    );
  }
  const listData = await listResponse.json() as {
    messages?: Array<{ id: string; threadId: string }>;
  };
  const listed = listData.messages ?? [];

  const messages: GmailMessageLike[] = [];
  for (const { id, threadId } of listed) {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: auth },
    );
    if (!response.ok) continue;
    const data = await response.json() as {
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const headers = data.payload?.headers ?? [];
    messages.push({
      id,
      threadId,
      from: header(headers, "From"),
      to: header(headers, "To"),
      subject: header(headers, "Subject"),
      date: header(headers, "Date"),
      snippet: data.snippet,
    });
  }

  const threads = groupGmailThreads(messages);
  const parsed = gmailThreadsToFacts(threads, retrievedAt);
  const deduped = dedupFacts(parsed);
  validateAndSplit(result, deduped.facts);
  result.counts["messages"] = listed.length;
  result.counts["threads"] = threads.length;
  result.counts["duplicates"] = deduped.duplicates;
  result.counts["facts"] = result.facts.length;
  result.counts["quarantined"] = result.quarantined.length;
  return result;
}
