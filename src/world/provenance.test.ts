/**
 * Provenance + supersession tests (correction-loop spec §2).
 *
 * A supersession adds a link; it never deletes. The old fact stays
 * queryable in history, and "current" queries read only live heads.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  chainContaining,
  currentFacts,
  currentHead,
  history,
  isSuperseded,
  normalizeIri,
  provenanceErrors,
  supersede,
  supersessionQuads,
} from "./provenance.ts";
import type { Fact } from "./types.ts";

function fact(
  id: string,
  props: Record<string, string>,
  source = "MEMORY.md — test",
): Fact {
  return {
    id,
    type: "Commitment",
    label: id,
    properties: { description: id, status: "open", ...props },
    provenance: { source, retrievedAt: "2026-11-08T10:00:00.000Z" },
  };
}

const v1 = fact("twin:commitment/x", {});
const v2 = {
  ...fact("twin:commitment/x-v2", { status: "done" }),
  properties: {
    description: "twin:commitment/x",
    status: "done",
    supersedesStatement: "twin:commitment/x",
  },
};
const v1Superseded: Fact = {
  ...v1,
  properties: { ...v1.properties, supersededBy: "twin:commitment/x-v2" },
};

Deno.test("provenance: missing source or retrievedAt blocks a write", () => {
  assertEquals(
    provenanceErrors({ ...v1, provenance: { source: "", retrievedAt: "" } })
      .length,
    2,
  );
  assertEquals(
    provenanceErrors({
      ...v1,
      provenance: { source: "x", retrievedAt: "" },
    }).length,
    1,
  );
  assertEquals(provenanceErrors(v1).length, 0);
});

Deno.test("provenance: supersede validates provenance and distinct id", () => {
  const quads = supersede("twin:commitment/x", v2);
  assertEquals(quads.length, 1);
  assertEquals(quads[0].subject, "twin:commitment/x");
  assertEquals(quads[0].object, "twin:commitment/x-v2");
  assertThrows(
    () => supersede("twin:commitment/x", { ...v2, id: "twin:commitment/x" }),
    Error,
    "distinct replacement id",
  );
  assertThrows(
    () =>
      supersede("twin:commitment/x", {
        ...v2,
        provenance: { source: "", retrievedAt: "" },
      }),
    Error,
    "without provenance",
  );
  // The legacy helper still emits the same marker shape.
  assertEquals(
    supersessionQuads(v1, v2)[0].predicate.endsWith("#supersededBy"),
    true,
  );
});

Deno.test("provenance: currentHead walks the chain, history lists it oldest-first", () => {
  const v3: Fact = {
    ...fact("twin:commitment/x-v3", { status: "done" }),
    properties: {
      description: "twin:commitment/x",
      status: "done",
      supersededBy: "",
    },
  };
  const v2Superseded: Fact = {
    ...v2,
    properties: { ...v2.properties, supersededBy: "twin:commitment/x-v3" },
  };
  const facts = [v1Superseded, v2Superseded, v3];
  assertEquals(
    currentHead(facts, "twin:commitment/x")?.id,
    "twin:commitment/x-v3",
  );
  assertEquals(
    history(facts, "twin:commitment/x").map((f) => f.id),
    ["twin:commitment/x", "twin:commitment/x-v2", "twin:commitment/x-v3"],
  );
  assertEquals(
    currentHead(facts, "twin:commitment/x-v2")?.id,
    "twin:commitment/x-v3",
  );
  assertEquals(currentHead(facts, "twin:commitment/missing"), undefined);
  assertEquals(history(facts, "twin:commitment/x-v3").length, 1);
});

Deno.test("provenance: chainContaining finds the full chain from any link", () => {
  const v3: Fact = {
    ...fact("twin:commitment/x-v3", { status: "done" }),
    properties: {
      description: "twin:commitment/x",
      status: "done",
      supersededBy: "",
    },
  };
  const v2Superseded: Fact = {
    ...v2,
    properties: { ...v2.properties, supersededBy: "twin:commitment/x-v3" },
  };
  const facts = [v1Superseded, v2Superseded, v3];
  const ids = [
    "twin:commitment/x",
    "twin:commitment/x-v2",
    "twin:commitment/x-v3",
  ];
  for (const id of ids) {
    assertEquals(chainContaining(facts, id).map((f) => f.id), ids);
  }
  assertEquals(chainContaining(facts, "twin:commitment/missing"), []);
});

Deno.test("provenance: isSuperseded and currentFacts filter history out", () => {
  assert(isSuperseded(v1Superseded));
  assert(!isSuperseded(v1));
  assertEquals(currentFacts([v1Superseded, v2]).map((f) => f.id), [
    "twin:commitment/x-v2",
  ]);
});

Deno.test("provenance: normalizeIri unifies twin: and expanded forms", () => {
  assertEquals(
    normalizeIri("https://wazoo.dev/twins/fact/commitment/x"),
    "twin:commitment/x",
  );
  assertEquals(normalizeIri("twin:commitment/x"), "twin:commitment/x");
  // The expanded form still resolves a chain head.
  const expanded: Fact = {
    ...v1Superseded,
    properties: {
      ...v1Superseded.properties,
      supersededBy: "https://wazoo.dev/twins/fact/commitment/x-v2",
    },
  };
  assertEquals(
    currentHead([expanded, v2], "twin:commitment/x")?.id,
    "twin:commitment/x-v2",
  );
});
