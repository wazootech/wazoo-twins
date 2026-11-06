import { assertEquals } from "@std/assert";
import {
  deadlineDate,
  dedupFacts,
  parseDateLoose,
  slugify,
  validateAndSplit,
} from "./common.ts";
import type { SeedResult } from "./common.ts";
import { emptyResult } from "./common.ts";

Deno.test("parseDateLoose handles ISO and long-form dates", () => {
  assertEquals(parseDateLoose("due 2026-11-08"), "2026-11-08");
  assertEquals(parseDateLoose("Fri Nov 6, 2026, 11:00am PT"), "2026-11-06");
  assertEquals(parseDateLoose("Dec 11, 2026"), "2026-12-11");
  assertEquals(parseDateLoose("6 November 2026"), "2026-11-06");
  assertEquals(parseDateLoose("no date here"), undefined);
});

Deno.test("parseDateLoose reads a bare month+day as 2026 (seed corpus year)", () => {
  assertEquals(parseDateLoose("deadline Nov 20"), "2026-11-20");
});

Deno.test("deadlineDate picks the date the deadline language points at", () => {
  const ccpa =
    "CCPA request SENT Fri Nov 6, 2026. Confirmation due Fri Nov 20, 2026; full response due Mon Dec 21, 2026.";
  assertEquals(deadlineDate(ccpa), "2026-11-20");
  const nbis =
    "Original request Oct 28, 2026, reminder Nov 4, due within four days, about Nov 8.";
  assertEquals(deadlineDate(nbis), "2026-11-08");
  assertEquals(
    deadlineDate("Kiroween credits request Dec 1, 2026"),
    "2026-12-01",
  );
  // Date before the keyword when nothing follows it.
  assertEquals(
    deadlineDate("Mozilla proposal: Nov 20 confirmation deadline."),
    "2026-11-20",
  );
  assertEquals(deadlineDate("no deadline language here"), undefined);
  assertEquals(deadlineDate("due with no date at all"), undefined);
  // A "~" date is the author's computed approximate deadline.
  assertEquals(
    deadlineDate(
      'NBIS eApp outstanding — original request Oct 28, 2026, 1st reminder arrived Wed Nov 4, again "within four (4) days" (so ~Nov 8).',
    ),
    "2026-11-08",
  );
});

Deno.test("slugify lowercases and joins words", () => {
  assertEquals(
    slugify("NBIS eApp Due About Nov 8!"),
    "nbis-eapp-due-about-nov-8",
  );
  assertEquals(slugify(""), "untitled");
});

Deno.test("validateAndSplit quarantines invalid facts, keeps valid ones", () => {
  const result: SeedResult = emptyResult("test");
  validateAndSplit(result, [
    {
      id: "twin:commitment/ok",
      type: "Commitment",
      label: "ok",
      properties: { description: "fine", status: "open" },
      provenance: { source: "test", retrievedAt: "2026-11-06T00:00:00.000Z" },
    },
    {
      id: "twin:commitment/bad",
      type: "Commitment",
      label: "bad",
      properties: { status: "open" },
      provenance: { source: "test", retrievedAt: "2026-11-06T00:00:00.000Z" },
    },
    {
      id: "twin:nope/x",
      type: "Nope",
      label: "nope",
      properties: {},
      provenance: { source: "test", retrievedAt: "2026-11-06T00:00:00.000Z" },
    },
  ]);
  assertEquals(result.facts.length, 1);
  assertEquals(result.quarantined.length, 2);
  assertEquals(result.quarantined[0].errors[0].includes("description"), true);
  assertEquals(result.quarantined[1].errors[0], "unknown class: Nope");
});

Deno.test("dedupFacts keeps the first occurrence", () => {
  const fact = {
    id: "twin:commitment/a",
    type: "Commitment",
    label: "a",
    properties: { description: "a", status: "open" },
    provenance: { source: "test", retrievedAt: "2026-11-06T00:00:00.000Z" },
  };
  const { facts, duplicates } = dedupFacts([fact, { ...fact }, {
    ...fact,
    id: "twin:commitment/b",
  }]);
  assertEquals(facts.length, 2);
  assertEquals(duplicates, 1);
});
