/**
 * One-off migration: backfill the typed `Provenance.blame` field onto
 * facts written before the field existed (correction-loop issue #6).
 *
 * The blame is derived from the fact's own source string, and only where
 * that is unambiguous: a source starting with "Ethan" (the old convention
 * for Ethan's chat corrections) becomes `blame: "Ethan"`, a source under
 * the Twin's own namespace ("twin:...") becomes `blame: "twin"`. Importer
 * and public-URL sources stay blameless — the ambiguity is real and
 * guessing would misattribute assertions.
 *
 * `deno task backfill:blame` — idempotent: facts that already carry a
 * blame or derive no blame from their source are left untouched, and
 * re-running only rewrites (upserts) the facts it stamped.
 */
import { stampBlame } from "../world/provenance.ts";
import { createWorldClient } from "../world/client.ts";
import type { Fact } from "../world/types.ts";

export interface BackfillResult {
  total: number;
  backfilled: number;
  skipped: number;
  errors: string[];
}

/** Stamp the typed blame onto every unambiguous fact in `facts`. */
export function backfillBlame(
  facts: Fact[],
): { facts: Fact[]; result: Omit<BackfillResult, "errors"> } {
  const backfilled: Fact[] = [];
  let count = 0;
  for (const fact of facts) {
    const stamped = stampBlame(fact);
    if (stamped !== fact) {
      backfilled.push(stamped);
      count++;
    }
  }
  return {
    facts: backfilled,
    result: {
      total: facts.length,
      backfilled: count,
      skipped: facts.length - count,
    },
  };
}

async function main(): Promise<number> {
  const backend = Deno.env.get("TWIN_WORLD_BACKEND") ?? "libsql";
  const client = await createWorldClient({
    backend: backend as "memory" | "libsql" | "hosted",
  });
  try {
    const all = await client.findFacts({});
    const { facts: toWrite, result } = backfillBlame(all);
    const errors: string[] = [];
    if (toWrite.length > 0) {
      try {
        await client.addFacts(toWrite);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    console.log(
      `blame backfill (${backend}): ${result.backfilled} of ${result.total} facts stamped (${
        result.total - result.backfilled
      } left as-is)`,
    );
    for (const error of errors) console.error(error);
    return errors.length > 0 ? 1 : 0;
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  Deno.exit(await main());
}
