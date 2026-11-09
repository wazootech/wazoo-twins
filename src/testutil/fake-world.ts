/**
 * In-memory fake WorldClient for tests.
 *
 * Implements the `WorldClient` interface over a Map. `findFacts` matches
 * `type` by exact value or by ontology-IRI suffix, so tests exercise both
 * storage conventions. Raw SPARQL is unsupported by design (agents in this
 * slice use `findFacts`/`search`/`getFact` only).
 */
import type { SparqlRow, WorldClient } from "../world/client.ts";
import type { Fact, Iri } from "../world/types.ts";

export function createFakeWorldClient(
  seed: Fact[] = [],
): WorldClient & { facts: Map<Iri, Fact> } {
  const facts = new Map<Iri, Fact>(seed.map((f) => [f.id, structuredClone(f)]));
  const client: WorldClient = {
    addFacts(newFacts: Fact[]): Promise<void> {
      for (const f of newFacts) facts.set(f.id, structuredClone(f));
      return Promise.resolve(undefined);
    },
    query(_sparql: string): Promise<SparqlRow[]> {
      return Promise.reject(
        new Error("fake WorldClient does not support raw SPARQL"),
      );
    },
    update(_sparql: string): Promise<void> {
      return Promise.resolve(undefined);
    },
    search(keywords: string, limit = 10): Promise<Fact[]> {
      const q = keywords.toLowerCase();
      const hits = [...facts.values()].filter((f) => {
        const hay = `${f.label} ${f.type} ${
          Object.values(f.properties).join(" ")
        }`.toLowerCase();
        return q.split(/\s+/).every((w) => w === "" || hay.includes(w));
      });
      return Promise.resolve(hits.slice(0, limit));
    },
    getFact(id: Iri): Promise<Fact | undefined> {
      const f = facts.get(id);
      return Promise.resolve(f ? structuredClone(f) : undefined);
    },
    findFacts(
      filter: { type?: string; property?: string; value?: string },
    ): Promise<Fact[]> {
      return Promise.resolve([...facts.values()].filter((f) => {
        if (filter.type) {
          const t = filter.type;
          if (
            !(f.type === t || f.type.endsWith(`#${t}`) ||
              f.type.endsWith(`/${t}`))
          ) return false;
        }
        if (filter.property) {
          const v = f.properties[filter.property];
          if (v === undefined) return false;
          if (filter.value !== undefined && v !== filter.value) return false;
        } else if (filter.value !== undefined) {
          const needle = filter.value;
          if (!Object.values(f.properties).some((v) => v.includes(needle))) {
            return false;
          }
        }
        return true;
      }));
    },
    supersede(oldId: Iri, replacement: Fact): Promise<void> {
      const old = facts.get(oldId);
      if (!old) {
        return Promise.reject(
          new Error(`cannot supersede missing fact ${oldId}`),
        );
      }
      if (replacement.id === oldId) {
        return Promise.reject(
          new Error(
            `cannot supersede ${oldId} with a fact of the same id — a supersession needs a distinct replacement id`,
          ),
        );
      }
      // Preserve the old fact and stamp the `supersededBy` link, the same
      // shape the real client writes (correction-loop spec §2.1).
      facts.set(oldId, {
        ...structuredClone(old),
        properties: { ...old.properties, supersededBy: replacement.id },
      });
      facts.set(replacement.id, structuredClone(replacement));
      return Promise.resolve(undefined);
    },
    count(): Promise<number> {
      return Promise.resolve(facts.size);
    },
    close(): Promise<void> {
      return Promise.resolve(undefined);
    },
  };
  return Object.assign(client, { facts });
}
