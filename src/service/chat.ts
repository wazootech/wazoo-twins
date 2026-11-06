/**
 * Chat transport for v1 — stdin/stdout.
 *
 * Reads one intent per line from stdin, runs the orchestrator, prints the
 * formatted result to stdout. No external chat integration in v1; the
 * transport is deliberately the terminal so the Twin is testable with zero
 * accounts. `server.ts` reuses this loop as its long-running entrypoint.
 */
import { type OrchestratorResult, runIntent } from "../orchestrator/loop.ts";
import { renderClaim } from "../orchestrator/verifier.ts";
import { todayPT } from "../agents/common.ts";
import type { AgentContext } from "../agents/types.ts";
import { createWorldClient, type WorldClient } from "../world/client.ts";

/** Render an orchestrator result as plain text (UNVERIFIED claims labelled). */
export function formatResult(result: OrchestratorResult): string {
  const lines: string[] = [];
  const heading = result.action === "needs-approval"
    ? "Needs approval"
    : result.action === "ask"
    ? "A question"
    : "Answer";
  lines.push(`## ${heading} — ${result.kind}`);
  for (const claim of result.claims) lines.push(`- ${renderClaim(claim)}`);
  if (result.summary.length > 0) {
    lines.push("", "### Summary");
    for (const s of result.summary) lines.push(`- ${s}`);
  }
  if (result.question) lines.push("", `Question: ${result.question}`);
  if (result.approvalCard) lines.push("", result.approvalCard);
  if (result.notes.length > 0) {
    lines.push("", "### Notes");
    for (const n of result.notes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}

/** Run one intent line through the orchestrator and format the result. */
export async function handleIntentLine(
  intent: string,
  ctx: AgentContext,
): Promise<string> {
  return formatResult(await runIntent(intent, ctx));
}

/** Split a byte stream into lines (handles a final line without newline). */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
    }
  }
  if (buf.length > 0) yield buf.replace(/\r$/, "");
}

/** Phase 1 agent context: read/draft tier at most, today in America/Los_Angeles. */
export function buildContext(
  world: WorldClient,
  today: string = todayPT(),
): AgentContext {
  return { world, tier: "draft", today };
}

/** Read intent lines from stdin until EOF, answering each in turn. */
export async function runChatLoop(ctx: AgentContext): Promise<void> {
  for await (const line of readLines(Deno.stdin.readable)) {
    const intent = line.trim();
    if (!intent) continue;
    console.log(await handleIntentLine(intent, ctx));
  }
}

async function main(): Promise<void> {
  let world: WorldClient | undefined;
  try {
    world = await createWorldClient();
  } catch (err) {
    console.error(
      `World client unavailable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error(
      "The World backend is implemented by the World/seed builder (src/world/client.ts).",
    );
    Deno.exit(1);
  }
  if (!world) Deno.exit(1);
  try {
    await runChatLoop(buildContext(world));
  } finally {
    await world.close();
  }
}

if (import.meta.main) await main();
