/**
 * Tests for the World client (memory + libsql backends, hosted guard).
 * Run: `deno task test src/world/client.test.ts`
 */
import { assert, assertEquals, assertRejects } from "@std/assert";
import { createWorldClient } from "./client.ts";
import type { Fact } from "./types.ts";

const NOW = "2026-11-06T12:00:00.000Z";

function commitment(
  id: string,
  description: string,
  extra: Record<string, string> = {},
): Fact {
  return {
    id,
    type: "Commitment",
    label: description.slice(0, 60),
    properties: { description, status: "open", ...extra },
    provenance: { source: "test", retrievedAt: NOW },
  };
}

Deno.test("memory: addFacts round-trips through getFact", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    await world.addFacts([
      commitment("twin:commitment/nbis-eapp", "NBIS eApp due about Nov 8"),
    ]);
    const fact = await world.getFact("twin:commitment/nbis-eapp");
    assert(fact !== undefined);
    assertEquals(fact.type, "Commitment");
    assertEquals(fact.properties["description"], "NBIS eApp due about Nov 8");
    assertEquals(fact.properties["status"], "open");
    assertEquals(fact.provenance.source, "test");
    assertEquals(await world.count(), 1);
  } finally {
    await world.close();
  }
});

Deno.test("memory: addFacts is idempotent (fact-ID dedup, no duplicates)", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    const fact = commitment("twin:commitment/x", "do the thing");
    await world.addFacts([fact]);
    await world.addFacts([{
      ...fact,
      properties: { ...fact.properties, status: "done" },
    }]);
    assertEquals(await world.count(), 1);
    const reloaded = await world.getFact("twin:commitment/x");
    assertEquals(reloaded?.properties["status"], "done");
  } finally {
    await world.close();
  }
});

Deno.test("memory: invalid facts never half-land", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    const good = commitment("twin:commitment/good", "good fact");
    const bad: Fact = {
      id: "twin:commitment/bad",
      type: "Commitment",
      label: "bad fact",
      // Missing required "description".
      properties: { status: "open" },
      provenance: { source: "test", retrievedAt: NOW },
    };
    await assertRejects(
      () => world.addFacts([good, bad]),
      Error,
      "validation failed",
    );
    assertEquals(await world.count(), 0);
    assertEquals(await world.getFact("twin:commitment/good"), undefined);
  } finally {
    await world.close();
  }
});

Deno.test("memory: query (SPARQL SELECT) returns variable->value rows", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    await world.addFacts([
      commitment("twin:commitment/a", "alpha task"),
      commitment("twin:commitment/b", "beta task"),
    ]);
    const rows = await world.query(
      `SELECT ?s ?desc WHERE { ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://wazoo.dev/twins#Commitment> . ?s <https://wazoo.dev/twins#description> ?desc }`,
    );
    assertEquals(rows.length, 2);
    assert(
      rows.every((r) =>
        typeof r["s"] === "string" && typeof r["desc"] === "string"
      ),
    );
  } finally {
    await world.close();
  }
});

Deno.test("memory: findFacts filters by type and property value", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    await world.addFacts([
      commitment("twin:commitment/a", "alpha", { status: "open" }),
      commitment("twin:commitment/b", "beta", { status: "done" }),
      {
        id: "twin:task/c",
        type: "Task",
        label: "gamma",
        properties: { description: "gamma", status: "open" },
        provenance: { source: "test", retrievedAt: NOW },
      },
    ]);
    const byType = await world.findFacts({ type: "Commitment" });
    assertEquals(byType.length, 2);
    const byStatus = await world.findFacts({
      type: "Commitment",
      property: "status",
      value: "done",
    });
    assertEquals(byStatus.length, 1);
    assertEquals(byStatus[0].id, "twin:commitment/b");
  } finally {
    await world.close();
  }
});

Deno.test("memory: search finds facts by keyword", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    await world.addFacts([
      commitment("twin:commitment/mozilla", "Mozilla proposal deadline Nov 20"),
      commitment("twin:commitment/yc", "YC decisions Dec 11"),
    ]);
    const hits = await world.search("Mozilla");
    assertEquals(hits.length, 1);
    assertEquals(hits[0].id, "twin:commitment/mozilla");
    assertEquals(await world.search("nonexistent-keyword-xyz"), []);
  } finally {
    await world.close();
  }
});

Deno.test("memory: supersede keeps the old fact and records the marker", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    const oldFact = commitment("twin:commitment/old", "old wording", {
      status: "open",
    });
    await world.addFacts([oldFact]);
    const replacement = commitment("twin:commitment/new", "new wording", {
      status: "open",
    });
    await world.supersede("twin:commitment/old", replacement);
    assertEquals(
      (await world.getFact("twin:commitment/new"))?.properties["description"],
      "new wording",
    );
    // Correction-loop spec §2.1: the old fact stays in the World, marked
    // superseded, with its original content queryable in history. An
    // earlier version of this test asserted the old fact was deleted;
    // that was a silent overwrite, and the spec forbids it.
    const old = await world.getFact("twin:commitment/old");
    assertEquals(old?.properties["description"], "old wording");
    assertEquals(await world.count(), 2);
    // The supersession marker lives on the old id's quads: query it raw.
    const rows = await world.query(
      `SELECT ?o WHERE { <https://wazoo.dev/twins/fact/commitment/old> <https://wazoo.dev/twins#supersededBy> ?o }`,
    );
    assertEquals(rows.length, 1);
    assert(rows[0]["o"].includes("commitment/new"));
  } finally {
    await world.close();
  }
});

Deno.test("memory: update runs a SPARQL UPDATE", async () => {
  const world = await createWorldClient({ backend: "memory" });
  try {
    await world.addFacts([commitment("twin:commitment/a", "alpha")]);
    await world.update(
      `DELETE DATA { <https://wazoo.dev/twins/fact/commitment/a> <https://wazoo.dev/twins#description> "alpha" }`,
    );
    assertEquals(
      (await world.getFact("twin:commitment/a"))?.properties["description"],
      undefined,
    );
  } finally {
    await world.close();
  }
});

Deno.test("hosted: throws a clear NOT-IMPLEMENTED error, never fakes a connection", async () => {
  await assertRejects(
    () =>
      createWorldClient({
        backend: "hosted",
        worldId: "w1",
        apiKey: "wzw_test",
      }),
    Error,
    "NOT-IMPLEMENTED",
  );
  await assertRejects(
    () => createWorldClient({ backend: "hosted" }),
    Error,
    "missing (TWIN_WORLD_ID)",
  );
});

Deno.test("libsql: file backend round-trips and persists across clients", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/world.db`;
  try {
    const world = await createWorldClient({
      backend: "libsql",
      libsqlPath: path,
    });
    await world.addFacts([
      commitment("twin:commitment/persist", "persisted fact"),
    ]);
    assertEquals((await world.search("persisted")).length, 1);
    assertEquals(await world.count(), 1);
    await world.close();

    const reopened = await createWorldClient({
      backend: "libsql",
      libsqlPath: path,
    });
    try {
      assertEquals(
        (await reopened.getFact("twin:commitment/persist"))
          ?.properties["description"],
        "persisted fact",
      );
      assertEquals(await reopened.count(), 1);
    } finally {
      await reopened.close();
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
