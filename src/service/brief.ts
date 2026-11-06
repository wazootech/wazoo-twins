/**
 * Brief CLI — `deno task brief --kind morning|evening`.
 *
 * Builds the brief from the World and prints it to STDOUT ONLY. It never
 * delivers the brief anywhere: no chat send, no email, no other transport.
 * Delivery is the scheduler's job (see `src/service/cron.ts`).
 *
 * The World backend comes from `createWorldClient()` (implemented by the
 * World/seed builder in `src/world/client.ts`). If the backend is not ready
 * yet, this exits non-zero with a clear message instead of a stack trace.
 */
import {
  type BriefResult,
  buildEveningSummary,
  buildMorningBrief,
} from "../agents/briefing.ts";
import { todayPT } from "../agents/common.ts";
import { createWorldClient, type WorldClient } from "../world/client.ts";

export type BriefKind = "morning" | "evening";

export function parseBriefArgs(args: string[]): { kind: BriefKind } {
  let kind: BriefKind = "morning";
  for (const arg of args) {
    if (arg === "--kind=morning" || arg === "--kind" || arg === "morning") {
      if (arg !== "--kind") kind = "morning";
    } else if (arg === "--kind=evening" || arg === "evening") {
      kind = "evening";
    }
  }
  // Handle the `--kind <value>` two-arg form.
  for (let i = 0; i < args.length - 1; i++) {
    if (
      args[i] === "--kind" &&
      (args[i + 1] === "morning" || args[i + 1] === "evening")
    ) {
      kind = args[i + 1] as BriefKind;
    }
  }
  return { kind };
}

export async function buildBrief(
  world: WorldClient,
  kind: BriefKind,
  today: string,
): Promise<BriefResult> {
  return kind === "evening"
    ? await buildEveningSummary(world, today)
    : await buildMorningBrief(world, today);
}

async function main(): Promise<void> {
  const { kind } = parseBriefArgs(Deno.args);
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
    const brief = await buildBrief(world, kind, todayPT());
    console.log(brief.markdown);
  } finally {
    await world.close();
  }
}

if (import.meta.main) await main();
