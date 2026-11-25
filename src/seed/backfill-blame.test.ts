/**
 * Backfill tests (correction-loop issue #6): the one-off blame migration
 * stamps only unambiguous pre-blame facts and reports what it touched.
 */
import { assertEquals } from "@std/assert";
import { backfillBlame } from "./backfill-blame.ts";
import type { Fact } from "../world/types.ts";

function fact(id: string, source: string, blame?: string): Fact {
  return {
    id,
    type: "Commitment",
    label: id,
    properties: { description: id, status: "open" },
    provenance: {
      source,
      retrievedAt: "2026-11-08T12:00:00.000Z",
      ...(blame === undefined ? {} : { blame }),
    },
  };
}

Deno.test("backfill: stamps Ethan and twin facts, leaves ambiguous ones alone", () => {
  const { facts: stamped, result } = backfillBlame([
    fact("twin:commitment/a", "Ethan, in chat"),
    fact("twin:commitment/b", "twin:correction-loop"),
    fact("twin:commitment/c", "MEMORY.md#L41"),
    fact("twin:commitment/d", "Ethan, in chat", "twin"),
  ]);
  assertEquals(stamped.map((f) => f.id), [
    "twin:commitment/a",
    "twin:commitment/b",
  ]);
  assertEquals(stamped[0].provenance.blame, "Ethan");
  assertEquals(stamped[1].provenance.blame, "twin");
  assertEquals(result, { total: 4, backfilled: 2, skipped: 2 });
});
