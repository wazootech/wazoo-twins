/**
 * Server entrypoint — wires the orchestrator + agents + World client.
 *
 * - `deno task server` — reads intents from stdin in a loop (see `chat.ts`).
 * - `deno task server --once "<intent>"` — runs a single intent and exits.
 *
 * Phase 1 runs at the "draft" tier at most: briefs, answers, and drafts are
 * presented; nothing external is performed. The World backend comes from
 * `createWorldClient()` (implemented by the World/seed builder in
 * `src/world/client.ts`); if it is not ready yet, this exits non-zero with
 * a clear message.
 */
import { runIntent } from "../orchestrator/loop.ts";
import { createWorldClient, type WorldClient } from "../world/client.ts";
import { buildContext, formatResult, runChatLoop } from "./chat.ts";

export function parseServerArgs(args: string[]): { once?: string } {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--once" && args[i + 1]) return { once: args[i + 1] };
    const m = /^--once=(.+)$/.exec(args[i]);
    if (m) return { once: m[1] };
  }
  return {};
}

async function main(): Promise<void> {
  const { once } = parseServerArgs(Deno.args);
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
  const ctx = buildContext(world);
  try {
    if (once) {
      console.log(formatResult(await runIntent(once, ctx)));
    } else {
      await runChatLoop(ctx);
    }
  } finally {
    await world.close();
  }
}

if (import.meta.main) await main();
