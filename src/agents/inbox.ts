/**
 * Inbox agent (plan §3.4) — Gmail triage + draft replies. DRAFTS ONLY.
 *
 * Triage from World Thread facts (needsReply / FYI / ignore); the Gmail
 * connector is consulted opportunistically and its absence is reported as a
 * note, never as a failure. Draft replies are written in Ethan's plain
 * voice via the model client with a deterministic template fallback — the
 * template quotes the thread's last message rather than inventing content.
 *
 * There is no send path in this file. `sendReply` throws: sending requires
 * the approved tier (Phase 2). The orchestrator enforces the same rule via
 * `permissions.ts`.
 */
import { GmailConnector } from "../connectors/gmail.ts";
import { createModelClient, type ModelClient } from "../service/model.ts";
import type { Fact } from "../world/types.ts";
import type { AgentContext, AgentResult, SubAgent } from "./types.ts";
import { claimFor, findFactsByClass, truncate } from "./common.ts";

export interface DraftReply {
  threadId: string;
  to: string;
  body: string;
}

export type Triage = "needs-reply" | "fyi" | "ignore";

export function triageThread(thread: Fact): Triage {
  if ((thread.properties.needsReply ?? "").toLowerCase() === "true") {
    return "needs-reply";
  }
  if ((thread.properties.status ?? "").toLowerCase() === "ignore") {
    return "ignore";
  }
  return "fyi";
}

/** Sending is not possible in Phase 1 — this always throws. */
export function sendReply(): never {
  throw new Error(
    "sending email requires approved tier (Phase 2) — drafts only in Phase 1",
  );
}

/** Draft a reply to one thread. Template fallback quotes the last message; nothing is invented. */
export async function draftReplyForThread(
  thread: Fact,
  model: ModelClient = createModelClient(),
): Promise<DraftReply> {
  const participants = thread.properties.participants ?? thread.label;
  const firstName = participants.split(/[,\s]+/).filter(Boolean)[0] ?? "there";
  const last = thread.properties.lastMessage ?? "";
  const template = last
    ? `Hi ${firstName},\n\nThanks for your message. You wrote: "${
      truncate(last, 120)
    }"\n\nI'll follow up shortly.\n\nBest,\nEthan`
    : `Hi ${firstName},\n\nThanks for your message. I'll follow up shortly.\n\nBest,\nEthan`;
  try {
    const drafted = await model.complete(
      `Draft a short reply in Ethan Davidson's plain voice — a few short sentences, no hedging, no invented facts. ` +
        `Thread participants: ${participants}. Last message: "${
          truncate(last, 400)
        }". ` +
        `Sign off as Ethan.`,
    );
    if (drafted && drafted.trim()) {
      return { threadId: thread.id, to: participants, body: drafted.trim() };
    }
  } catch {
    // Model failure degrades to the template draft.
  }
  return { threadId: thread.id, to: participants, body: template };
}

export interface InboxAgentDeps {
  gmail?: GmailConnector;
  model?: ModelClient;
}

export function createInboxAgent(deps: InboxAgentDeps = {}): SubAgent {
  return {
    name: "inbox",
    async run(_input: unknown, ctx: AgentContext): Promise<AgentResult> {
      const notes: string[] = [];
      const model = deps.model ?? createModelClient();

      try {
        const gmail = deps.gmail ?? new GmailConnector();
        const unread = await gmail.listMessages("is:unread", 5);
        notes.push(
          `Gmail connector returned ${unread.length} unread message(s); triage below is from World Thread facts.`,
        );
      } catch (err) {
        notes.push(
          `Gmail connector unavailable (${
            err instanceof Error ? err.message : String(err)
          }) — triage from World facts only.`,
        );
      }

      const threads = await findFactsByClass(ctx.world, "Thread");
      if (threads.length === 0) {
        notes.push("No Thread facts in the World — nothing to triage.");
        return { agent: "inbox", claims: [], summary: [], notes };
      }

      const byTriage = new Map<Triage, Fact[]>();
      for (const t of threads) {
        const triage = triageThread(t);
        const list = byTriage.get(triage) ?? [];
        list.push(t);
        byTriage.set(triage, list);
      }
      const needsReply = byTriage.get("needs-reply") ?? [];
      const fyi = byTriage.get("fyi") ?? [];
      const ignored = byTriage.get("ignore") ?? [];

      const claims = threads.map((t) => {
        const triage = triageThread(t);
        const last = t.properties.lastMessage
          ? `: "${truncate(t.properties.lastMessage, 120)}"`
          : "";
        return claimFor(
          t,
          `${triage}: ${t.properties.participants ?? t.label}${last}`,
        );
      });

      const summary = [
        `Triage: ${needsReply.length} need a reply, ${fyi.length} FYI, ${ignored.length} ignore.`,
      ];
      for (const t of needsReply) {
        const draft = await draftReplyForThread(t, model);
        summary.push(`Draft ready for ${draft.to} (thread ${draft.threadId}).`);
        notes.push(`Draft for ${draft.to}:\n${draft.body}`);
      }
      return { agent: "inbox", claims, summary, notes };
    },
  };
}

export const inboxAgent: SubAgent = createInboxAgent();
