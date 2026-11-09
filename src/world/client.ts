/**
 * World client (plan §3.1, Phase 0 task 0.3).
 *
 * A WorldClient is the Twin's only access to its World. Backends:
 * - "memory": in-memory WorldsSdk via `createMemoryWorldsSdk()` from
 *   `@worlds/sdk/memory` (zero-dependency; dev + tests).
 * - "libsql": durable local backend via `createLibsqlWorldsSdk` from
 *   `@worlds/libsql` (LibSQL file or Turso). Default for dogfooding.
 * - "hosted": worlds-api data plane (`data.wazoo.dev`, `wzw_` key).
 *
 * The client presents an SDK-agnostic interface: Facts in, Facts out, plus
 * raw SPARQL for queries the agents compose. SPARQL is the primary
 * retrieval path; keyword search is secondary; vector search is local-only
 * (hosted search is keyword-only FTS, worlds-api#1).
 *
 * NOTE: the factory is implemented in this file by the World/seed builder.
 * The interface below is the contract the orchestrator and agents code
 * against; do not change it without updating src/agents/types.ts.
 */
import { createMemoryWorldsSdk } from "@worlds/sdk/memory";
import { createLibsqlWorldsSdk } from "@worlds/libsql";
import { createClient } from "@libsql/client";
import { Classes, Props, TWIN_NS, validateFact } from "./schema.ts";
import { factToQuads, supersessionQuads } from "./provenance.ts";
import type { Fact, Iri, Provenance } from "./types.ts";

export type WorldBackend = "memory" | "libsql" | "hosted";

export interface WorldClientOptions {
  backend: WorldBackend;
  /** LibSQL database path (default: ~/workspace/wazoo-twins-data/world.db). */
  libsqlPath?: string;
  /** Turso URL for the libsql backend (alternative to a local path). */
  libsqlUrl?: string;
  /** LibSQL auth token (Turso). Never committed; read from env. */
  libsqlAuthToken?: string;
  /** Hosted backend: world id. */
  worldId?: string;
  /** Hosted backend: `wzw_` world key. Never committed; read from env. */
  apiKey?: string;
}

/** One SPARQL SELECT result row: variable name -> literal value. */
export type SparqlRow = Record<string, string>;

export interface WorldClient {
  /** Add facts (with provenance) to the World. Validates against the ontology first. */
  addFacts(facts: Fact[]): Promise<void>;
  /** Run a SPARQL SELECT query; returns rows as variable -> value maps. */
  query(sparql: string): Promise<SparqlRow[]>;
  /** Run a SPARQL UPDATE (INSERT/DELETE DATA). Used for supersession. */
  update(sparql: string): Promise<void>;
  /** Keyword search over the World's literals. Returns matching facts. */
  search(keywords: string, limit?: number): Promise<Fact[]>;
  /** Fetch one fact by IRI. */
  getFact(id: Iri): Promise<Fact | undefined>;
  /** Find facts by class and optional property/value filters. */
  findFacts(
    filter: { type?: string; property?: string; value?: string },
  ): Promise<Fact[]>;
  /** Supersede an old fact with a replacement (never silently overwritten). */
  supersede(oldId: Iri, replacement: Fact): Promise<void>;
  /** Total fact count (for seed reporting and eval). */
  count(): Promise<number>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// SDK version note (verified Nov 6, 2026, against the cached JSR sources).
//
// `@worlds/libsql@0.6.0` depends on `@worlds/sdk@0.6.1`, while the memory
// factory in this repo uses `@worlds/sdk@0.9.0`. The two SDK versions expose
// structurally identical `WorldsSdk` methods — `import`, `sparql`, `search`,
// `reindex` — with identical `ImportRequest` / `SparqlRequest` /
// `SparqlResponse` shapes (both go through `@wazoo/sparql-engine@0.4.2`;
// the 0.9.0 search response only adds optional `mode` / `scoreType`
// fields). The mismatch is nominal (two distinct module instances of the
// same interface), not functional: both backends were probed end-to-end
// (import + SPARQL SELECT/INSERT/DELETE + keyword search) and behave the
// same. This client therefore never imports either SDK's `WorldsSdk` type
// and instead talks to both through the minimal structural `SdkLike`
// interface below, so a future `@worlds/libsql` upgrade to sdk 0.9.x needs
// no client change. If a future libsql release changes a method shape, the
// cast sites below are where the type error will surface.
// ---------------------------------------------------------------------------

/** Minimal structural view of a WorldsSdk (0.6.1 and 0.9.0 alike). */
interface SdkLike {
  sparql(req: { query: string }): Promise<SparqlResponseLike>;
  search(req: {
    query: string;
    topK?: number;
  }): Promise<{
    results?: Array<
      { subject: string; predicate: string; text: string; score: number }
    >;
  }>;
  reindex(req?: unknown): Promise<unknown>;
}

type SparqlValueLike = { type: string; value: string };

type SparqlResponseLike =
  | {
    kind: "select";
    data: { results: { bindings: Array<Record<string, SparqlValueLike>> } };
  }
  | { kind: "ask"; data: { boolean: boolean } }
  | { kind: "construct"; data: { quads: unknown[] } }
  | { kind: "void" };

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** Fact IRIs live under this base: `twin:commitment/x` <-> `.../fact/commitment/x`. */
const FACT_BASE = "https://wazoo.dev/twins/fact/";

const CLASS_BY_IRI = new Map<string, string>(
  Object.entries(Classes).map(([name, iri]) => [iri, name]),
);

function expandIri(id: string): string {
  if (id.startsWith("http://") || id.startsWith("https://")) return id;
  if (id.startsWith("twin:")) return FACT_BASE + id.slice("twin:".length);
  return FACT_BASE + id;
}

function shrinkIri(iri: string): string {
  return iri.startsWith(FACT_BASE)
    ? `twin:${iri.slice(FACT_BASE.length)}`
    : iri;
}

/** Expand a short property name (or class name) to its ontology IRI. */
function expandPredicate(prop: string): string {
  if (prop.startsWith("http://") || prop.startsWith("https://")) return prop;
  const known = (Props as Record<string, string>)[prop];
  if (known) return known;
  return `${TWIN_NS}${prop}`;
}

function shrinkPredicate(iri: string): string {
  return iri.startsWith(TWIN_NS) ? iri.slice(TWIN_NS.length) : iri;
}

function expandTypeObject(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const byName = (Classes as Record<string, string>)[value];
  if (byName) return byName;
  if (value.startsWith("twin:")) return expandIri(value);
  return value;
}

/** Escape a value for use as a SPARQL double-quoted string literal. */
function sparqlLiteral(value: string): string {
  return `"${
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  }"`;
}

function sparqlIri(iri: string): string {
  return `<${iri}>`;
}

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    const home = env("HOME") ?? "";
    return home + path.slice(1);
  }
  return path;
}

export const DEFAULT_DATA_DIR = "~/workspace/wazoo-twins-data";
export const DEFAULT_LIBSQL_PATH = `${DEFAULT_DATA_DIR}/world.db`;

/**
 * Serialize one Twin Quad to a SPARQL triple. `factToQuads()` emits short
 * names for the rdf:type object and for property predicates (the contract
 * files keep Facts in short-name form); this layer expands them to full
 * ontology IRIs, and expands `twin:` fact IRIs to the FACT_BASE. A `label`
 * quad is added here (factToQuads does not emit one) so getFact() can
 * round-trip a Fact's label.
 */
function quadToTriple(
  quad: {
    subject: string;
    predicate: string;
    object: string;
    objectIsIri: boolean;
  },
): string {
  const s = sparqlIri(expandIri(quad.subject));
  const p = quad.predicate === RDF_TYPE
    ? sparqlIri(RDF_TYPE)
    : sparqlIri(expandPredicate(quad.predicate));
  const o = quad.objectIsIri
    ? sparqlIri(
      quad.predicate === RDF_TYPE
        ? expandTypeObject(quad.object)
        : expandIri(quad.object),
    )
    : sparqlLiteral(quad.object);
  return `${s} ${p} ${o} .`;
}

/** Rebuild a Fact from the (?p, ?o) bindings of one subject. */
function factFromBindings(
  id: Iri,
  bindings: Array<{ p: SparqlValueLike; o: SparqlValueLike }>,
): Fact | undefined {
  let type = "";
  let label = "";
  const properties: Record<string, string> = {};
  let source = "";
  let retrievedAt = "";
  for (const { p, o } of bindings) {
    if (p.value === RDF_TYPE) {
      type = CLASS_BY_IRI.get(o.value) ?? o.value;
    } else if (p.value === Props.source) {
      source = o.value;
    } else if (p.value === Props.retrievedAt) {
      retrievedAt = o.value;
    } else if (p.value === Props.label) {
      label = o.value;
    } else {
      properties[shrinkPredicate(p.value)] = o.value;
    }
  }
  if (!type) return undefined;
  const provenance: Provenance = {
    source: source || "world:unknown",
    retrievedAt: retrievedAt || "1970-01-01T00:00:00.000Z",
  };
  return { id, type, label, properties, provenance };
}

class WorldClientImpl implements WorldClient {
  readonly #sdk: SdkLike;
  readonly #closeFn: () => Promise<void>;

  constructor(sdk: SdkLike, closeFn: () => Promise<void>) {
    this.#sdk = sdk;
    this.#closeFn = closeFn;
  }

  async addFacts(facts: Fact[]): Promise<void> {
    // Validate every fact FIRST: an invalid fact aborts the whole batch
    // before anything lands (never half-land).
    const errors: string[] = [];
    for (const fact of facts) {
      for (const error of validateFact(fact)) {
        errors.push(`${fact.id}: ${error}`);
      }
      if (!fact.provenance?.source || !fact.provenance?.retrievedAt) {
        errors.push(
          `${fact.id}: missing provenance (source + retrievedAt required)`,
        );
      }
    }
    if (errors.length > 0) {
      throw new Error(
        `addFacts validation failed (${errors.length} error(s)):\n${
          errors.join("\n")
        }`,
      );
    }
    // Deduplicate by id within the batch (last occurrence wins).
    const byId = new Map<string, Fact>();
    for (const fact of facts) byId.set(fact.id, fact);
    const unique = [...byId.values()];
    if (unique.length === 0) return;

    // Import path (verified Nov 6, 2026 on both backends): Facts are
    // converted to quads with factToQuads(), then written with a single
    // SPARQL UPDATE (INSERT DATA) per batch. The SDK's import() with
    // { kind: "quads" } also works, but INSERT DATA is the one path that is
    // identical on the 0.6.1 and 0.9.0 SDKs, needs no rdfjs Quad
    // construction, and was verified to update the keyword search index on
    // both backends (imported and SPARQL-inserted quads alike). Upsert
    // semantics: existing quads for each id are deleted first, so a re-run
    // replaces the fact instead of duplicating it (fact-ID dedup).
    const ids = unique.map((f) => f.id);
    const existing = await this.#existingFactIds();
    const toDelete = ids.filter((id) => existing.has(id));
    if (toDelete.length > 0) {
      const filter = toDelete.map((id) => sparqlIri(expandIri(id))).join(", ");
      // Full DELETE/WHERE form: the engine rejects FILTER inside a bare
      // DELETE WHERE {...} pattern, but accepts it in the WHERE clause
      // of DELETE {...} WHERE {...} (verified Nov 6, 2026).
      await this.#sdk.sparql({
        query:
          `DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(?s IN (${filter})) }`,
      });
    }
    const triples: string[] = [];
    for (const fact of unique) {
      for (const quad of factToQuads(fact)) triples.push(quadToTriple(quad));
      triples.push(
        `${sparqlIri(expandIri(fact.id))} ${sparqlIri(Props.label)} ${
          sparqlLiteral(fact.label)
        } .`,
      );
    }
    // Chunk the insert so a large seed does not produce one giant update.
    const BATCH_TRIPLES = 1000;
    for (let i = 0; i < triples.length; i += BATCH_TRIPLES) {
      const chunk = triples.slice(i, i + BATCH_TRIPLES);
      await this.#sdk.sparql({ query: `INSERT DATA { ${chunk.join("\n")} }` });
    }
  }

  async query(sparql: string): Promise<SparqlRow[]> {
    const response = await this.#sdk.sparql({ query: sparql });
    if (response.kind !== "select") {
      throw new Error(
        `query() expects a SPARQL SELECT query, got a "${response.kind}" response`,
      );
    }
    return response.data.results.bindings.map((binding) => {
      const row: SparqlRow = {};
      for (const [name, value] of Object.entries(binding)) {
        row[name] = value.value;
      }
      return row;
    });
  }

  async update(sparql: string): Promise<void> {
    await this.#sdk.sparql({ query: sparql });
  }

  async search(keywords: string, limit = 10): Promise<Fact[]> {
    const trimmed = keywords.trim();
    if (!trimmed) return [];
    // Keyword search only (hosted search is keyword-only FTS,
    // worlds-api#1; vector search is a local-only enhancement and is not
    // used here). Scores are backend-specific and are not filtered on.
    const response = await this.#sdk.search({
      query: trimmed,
      topK: limit * 4,
    });
    const seen = new Set<string>();
    const facts: Fact[] = [];
    for (const hit of response.results ?? []) {
      const id = shrinkIri(hit.subject);
      if (seen.has(id)) continue;
      seen.add(id);
      const fact = await this.getFact(id);
      if (fact) facts.push(fact);
      if (facts.length >= limit) break;
    }
    return facts;
  }

  async getFact(id: Iri): Promise<Fact | undefined> {
    // One raw SPARQL call: query() drops the term type (uri vs literal),
    // which factFromBindings needs to tell the rdf:type object apart.
    const response = await this.#sdk.sparql({
      query: `SELECT ?p ?o WHERE { ${sparqlIri(expandIri(id))} ?p ?o }`,
    });
    if (response.kind !== "select") return undefined;
    if (response.data.results.bindings.length === 0) return undefined;
    const bindings = response.data.results.bindings.map((b) => ({
      p: b["p"],
      o: b["o"],
    }));
    return factFromBindings(id, bindings);
  }

  async findFacts(
    filter: { type?: string; property?: string; value?: string },
  ): Promise<Fact[]> {
    const patterns: string[] = [];
    if (filter.type) {
      const typeIri = (Classes as Record<string, string>)[filter.type] ??
        filter.type;
      patterns.push(
        `?s ${sparqlIri(RDF_TYPE)} ${sparqlIri(expandTypeObject(typeIri))} .`,
      );
    }
    if (filter.property) {
      const pred = sparqlIri(expandPredicate(filter.property));
      if (filter.value !== undefined) {
        patterns.push(
          `?s ${pred} ?fv . FILTER(STR(?fv) = ${sparqlLiteral(filter.value)})`,
        );
      } else {
        patterns.push(`?s ${pred} ?fv .`);
      }
    } else if (filter.value !== undefined) {
      patterns.push(
        `?s ?anyp ?fv . FILTER(STR(?fv) = ${sparqlLiteral(filter.value)})`,
      );
    }
    patterns.push("?s ?p ?o .");
    const response = await this.#sdk.sparql({
      query: `SELECT ?s ?p ?o WHERE { ${patterns.join("\n")} }`,
    });
    if (response.kind !== "select") return [];
    const grouped = new Map<
      string,
      Array<{ p: SparqlValueLike; o: SparqlValueLike }>
    >();
    for (const b of response.data.results.bindings) {
      const subject = shrinkIri(b["s"].value);
      const list = grouped.get(subject) ?? [];
      list.push({ p: b["p"], o: b["o"] });
      grouped.set(subject, list);
    }
    const facts: Fact[] = [];
    for (const [subject, bindings] of grouped) {
      const fact = factFromBindings(subject, bindings);
      if (fact) facts.push(fact);
    }
    return facts;
  }

  async supersede(oldId: Iri, replacement: Fact): Promise<void> {
    const errors = validateFact(replacement);
    if (errors.length > 0) {
      throw new Error(
        `supersede validation failed for ${replacement.id}: ${
          errors.join("; ")
        }`,
      );
    }
    // Correction-loop spec §2.1: the old fact's quads STAY in the World —
    // a supersession adds a marker, it never deletes. (An earlier version
    // DELETEd the old fact's quads here; that was a silent overwrite in
    // all but name, and the Nov 8 spec explicitly forbids it.)
    const oldFact = await this.getFact(oldId);
    if (!oldFact) {
      throw new Error(`cannot supersede missing fact ${oldId}`);
    }
    if (replacement.id === oldId) {
      throw new Error(
        `cannot supersede ${oldId} with a fact of the same id — a supersession needs a distinct replacement id`,
      );
    }
    await this.addFacts([replacement]);
    const marker = supersessionQuads(oldFact, replacement);
    const triples = marker.map((q) => quadToTriple(q)).join("\n");
    await this.#sdk.sparql({ query: `INSERT DATA { ${triples} }` });
  }

  async count(): Promise<number> {
    const rows = await this.query(
      `SELECT (COUNT(DISTINCT ?s) AS ?c) WHERE { ?s ${
        sparqlIri(RDF_TYPE)
      } ?t }`,
    );
    return Number(rows[0]?.["c"] ?? 0);
  }

  async close(): Promise<void> {
    await this.#closeFn();
  }

  /** Ids of all facts currently in the World (subjects with an rdf:type). */
  async #existingFactIds(): Promise<Set<string>> {
    const response = await this.#sdk.sparql({
      query: `SELECT DISTINCT ?s WHERE { ?s ${sparqlIri(RDF_TYPE)} ?t }`,
    });
    if (response.kind !== "select") return new Set();
    return new Set(
      response.data.results.bindings.map((b) => shrinkIri(b["s"].value)),
    );
  }
}

/**
 * Build a WorldClient for the requested backend.
 * Reads TWIN_WORLD_BACKEND / TWIN_WORLD_PATH / TWIN_WORLD_ID /
 * TWIN_WORLD_API_KEY from the environment when options are omitted.
 */
export async function createWorldClient(
  options?: Partial<WorldClientOptions>,
): Promise<WorldClient> {
  const backend: WorldBackend = options?.backend ??
    (env("TWIN_WORLD_BACKEND") as WorldBackend | undefined) ??
    "libsql";

  if (backend === "hosted") {
    const worldId = options?.worldId ?? env("TWIN_WORLD_ID");
    const apiKey = options?.apiKey ?? env("TWIN_WORLD_API_KEY");
    throw new Error(
      "NOT-IMPLEMENTED: hosted backend is not wired yet — the @worlds/client " +
        "wiring against the worlds-api data plane (data.wazoo.dev) is unverified, " +
        "so no hosted connection is attempted (nothing is faked). " +
        `worldId ${worldId ? "provided" : "missing (TWIN_WORLD_ID)"}, ` +
        `apiKey ${apiKey ? "provided" : "missing (TWIN_WORLD_API_KEY)"}. ` +
        "Use TWIN_WORLD_BACKEND=memory (tests/dev) or libsql (durable local) instead.",
    );
  }

  if (backend === "memory") {
    const sdk = createMemoryWorldsSdk() as unknown as SdkLike;
    return new WorldClientImpl(sdk, () => Promise.resolve());
  }

  if (backend === "libsql") {
    const libsqlUrl = options?.libsqlUrl ?? env("TWIN_WORLD_URL");
    const libsqlAuthToken = options?.libsqlAuthToken ??
      env("TWIN_WORLD_AUTH_TOKEN");
    let client;
    if (libsqlUrl) {
      client = createClient({ url: libsqlUrl, authToken: libsqlAuthToken });
    } else {
      const path = expandHome(
        options?.libsqlPath ?? env("TWIN_WORLD_PATH") ?? DEFAULT_LIBSQL_PATH,
      );
      const dir = path.slice(0, path.lastIndexOf("/"));
      if (dir) await Deno.mkdir(dir, { recursive: true });
      client = createClient({ url: `file:${path}` });
    }
    const sdk = await createLibsqlWorldsSdk({ client }) as unknown as SdkLike;
    return new WorldClientImpl(sdk, () => {
      client.close();
      return Promise.resolve();
    });
  }

  throw new Error(
    `unknown TWIN_WORLD_BACKEND "${backend}" (expected "memory" | "libsql" | "hosted")`,
  );
}
