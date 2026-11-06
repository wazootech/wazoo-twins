/**
 * Seed runner: `deno task seed` (full) / `deno task seed --incremental`.
 *
 * Runs every Phase 0.4 importer in order, validates every fact, writes
 * quarantined facts to `~/workspace/wazoo-twins-data/quarantine/<source>.json`,
 * and inserts the valid facts into the World (default backend: libsql,
 * `~/workspace/wazoo-twins-data/world.db`; override with
 * TWIN_WORLD_BACKEND=memory|libsql|hosted).
 *
 * Incremental mode: for v1, `--incremental` re-runs the same importers
 * and relies on fact-ID dedup — `WorldClient.addFacts` upserts by fact id
 * (existing quads for an id are deleted before the replacement is
 * inserted), so a re-run replaces facts instead of duplicating them. True
 * delta fetching (per-source watermarks) is a later improvement, not v1.
 *
 * Exit code is non-zero if any source hard-fails. Gmail/Calendar OAuth
 * absence is NOT a hard failure: those importers warn and are skipped
 * until Google OAuth is set up (see docs/runbook.md).
 */
import { createWorldClient } from "../world/client.ts";
import { GOOGLE_OAUTH_NOT_SETUP } from "./calendar.ts";
import { dedupFacts, writeQuarantine } from "./common.ts";
import type { SeedResult } from "./common.ts";
import { importCalendar } from "./calendar.ts";
import { importGithub } from "./github.ts";
import { importGmail } from "./gmail.ts";
import { importMemoryMd } from "./memory-md.ts";
import { importTrackers } from "./trackers.ts";

const IMPORTERS: Array<
  { name: string; run: (retrievedAt: string) => Promise<SeedResult> }
> = [
  { name: "memory-md", run: importMemoryMd },
  { name: "trackers", run: importTrackers },
  { name: "github", run: importGithub },
  { name: "calendar", run: importCalendar },
  { name: "gmail", run: importGmail },
];

async function main(): Promise<number> {
  const incremental = Deno.args.includes("--incremental");
  const retrievedAt = new Date().toISOString();
  const backend = Deno.env.get("TWIN_WORLD_BACKEND") ?? "libsql";
  console.log(
    `Twin seed ${
      incremental ? "(incremental)" : "(full)"
    } — backend: ${backend}`,
  );
  if (incremental) {
    console.log(
      "Note: incremental re-runs the same importers and relies on fact-ID dedup (upsert by id); no per-source watermark yet.",
    );
  }

  const client = await createWorldClient({
    backend: backend as "memory" | "libsql" | "hosted",
  });
  const hardFailures: Array<{ source: string; error: string }> = [];
  const skipped: string[] = [];
  const allFacts: SeedResult["facts"] = [];
  let totalQuarantined = 0;

  try {
    for (const importer of IMPORTERS) {
      try {
        const result = await importer.run(retrievedAt);
        if (result.quarantined.length > 0) {
          const path = await writeQuarantine(result.source, result.quarantined);
          console.log(
            `  [${result.source}] quarantined ${result.quarantined.length} fact(s) -> ${path}`,
          );
        }
        totalQuarantined += result.quarantined.length;
        allFacts.push(...result.facts);
        const extra = Object.entries(result.counts)
          .filter(([k]) => k !== "facts" && k !== "quarantined")
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        console.log(
          `  [${result.source}] facts=${result.facts.length} quarantined=${result.quarantined.length}${
            extra ? ` ${extra}` : ""
          }`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(GOOGLE_OAUTH_NOT_SETUP)) {
          console.log(
            `  [${importer.name}] skipped: ${GOOGLE_OAUTH_NOT_SETUP}`,
          );
          skipped.push(importer.name);
        } else {
          console.error(`  [${importer.name}] HARD FAILURE: ${message}`);
          hardFailures.push({ source: importer.name, error: message });
        }
      }
    }

    const deduped = dedupFacts(allFacts);
    if (deduped.duplicates > 0) {
      console.log(
        `  dedup: ${deduped.duplicates} duplicate fact id(s) across sources (first kept)`,
      );
    }
    console.log(`Inserting ${deduped.facts.length} fact(s) into the World...`);
    await client.addFacts(deduped.facts);
    const total = await client.count();
    console.log(
      `Done: inserted=${deduped.facts.length} quarantined=${totalQuarantined} worldFacts=${total}`,
    );
    if (skipped.length > 0) {
      console.log(`Skipped (OAuth not set up): ${skipped.join(", ")}`);
    }
    if (hardFailures.length > 0) {
      console.error(
        `Seed FAILED: ${hardFailures.length} source(s) hard-failed:`,
      );
      for (const failure of hardFailures) {
        console.error(`  - ${failure.source}: ${failure.error}`);
      }
      return 1;
    }
    return 0;
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  Deno.exit(await main());
}
