/**
 * Backfill tests (correction-loop issue #6): the one-off author migration
 * stamps only unambiguous pre-author facts and reports what it touched.
 */
import { assertEquals } from "@std/assert";
import { backfillAuthors } from "./backfill-authors.ts";
import type { Fact } from "../world/types.ts";

function fact(id: string, source: string, author?: string): Fact {
  return {
    id,
    type: "Commitment",
    label: id,
    properties: { description: id, status: "open" },
    provenance: {
      source,
      retrievedAt: "2026-11-08T12:00:00.000Z",
      ...(author === undefined ? {} : { author }),
    },
  };
}

Deno.test("backfill: stamps Ethan and twin facts, leaves ambiguous ones alone", () => {
  const { facts: stamped, result } = backfillAuthors([
    fact("twin:commitment/a", "Ethan, in chat"),
    fact("twin:commitment/b", "twin:correction-loop"),
    fact("twin:commitment/c", "MEMORY.md#L41"),
    fact("twin:commitment/d", "Ethan, in chat", "twin"),
  ]);
  assertEquals(stamped.map((f) => f.id), [
    "twin:commitment/a",
    "twin:commitment/b",
  ]);
  assertEquals(stamped[0].provenance.author, "Ethan");
  assertEquals(stamped[1].provenance.author, "twin");
  assertEquals(result, { total: 4, backfilled: 2, skipped: 2 });
});
