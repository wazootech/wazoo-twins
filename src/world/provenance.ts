/**
 * Provenance helpers (plan §2.3, §3.5; correction-loop spec §2).
 *
 * Worlds has no built-in timestamp/version/provenance column yet
 * (wazootech/worlds-sdk-ts#257, formerly #221, open), so the Twin carries
 * provenance in its own layer: every Fact records `source` + `retrievedAt`,
 * and corrections supersede rather than silently overwrite.
 *
 * A superseded fact keeps its quads. The only thing a supersession adds is
 * a `supersededBy` link from the old fact to its replacement, so history
 * stays queryable: `currentHead` walks the chain to the live fact,
 * `history` walks it back to the original.
 */
import { Props } from "./schema.ts";
import type { Fact, FactAuthor, Iri, Provenance, Quad } from "./types.ts";

export function provenance(
  source: string,
  retrievedAt: string = new Date().toISOString(),
  author?: FactAuthor,
): Provenance {
  return author === undefined ? { source, retrievedAt } : {
    source,
    retrievedAt,
    author,
  };
}

/**
 * Derive the typed author from a pre-author fact's source string — the
 * migration fallback for facts written before `Provenance.author` existed
 * (issue #6). Returns undefined when the source is ambiguous (an importer
 * or public URL), never guesses.
 */
export function authorFromSource(source: string): FactAuthor | undefined {
  const s = source.trim().toLowerCase();
  if (s.startsWith("ethan")) return "Ethan";
  if (s.startsWith("twin:")) return "twin";
  return undefined;
}

/**
 * Backfill the typed author onto a fact written before the field existed,
 * leaving an already-typed fact and an ambiguous source untouched.
 */
export function backfillAuthor(fact: Fact): Fact {
  if (fact.provenance.author !== undefined) return fact;
  const author = authorFromSource(fact.provenance.source);
  return author === undefined ? fact : {
    ...fact,
    provenance: { ...fact.provenance, author },
  };
}

/** Serialize a Fact to quads: one per property, plus type + provenance quads. */
export function factToQuads(fact: Fact): Quad[] {
  const quads: Quad[] = [];
  const rdfType = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  quads.push({
    subject: fact.id,
    predicate: rdfType,
    object: fact.type,
    objectIsIri: true,
    provenance: fact.provenance,
  });
  for (const [prop, value] of Object.entries(fact.properties)) {
    quads.push({
      subject: fact.id,
      predicate: `${prop}`,
      object: value,
      objectIsIri: false,
      provenance: fact.provenance,
    });
  }
  // Provenance quads: the fact's source and retrieval time are themselves quads.
  quads.push({
    subject: fact.id,
    predicate: Props.source,
    object: fact.provenance.source,
    objectIsIri: false,
    provenance: fact.provenance,
  });
  quads.push({
    subject: fact.id,
    predicate: Props.retrievedAt,
    object: fact.provenance.retrievedAt,
    objectIsIri: false,
    provenance: fact.provenance,
  });
  if (fact.provenance.author !== undefined) {
    quads.push({
      subject: fact.id,
      predicate: Props.author,
      object: fact.provenance.author,
      objectIsIri: false,
      provenance: fact.provenance,
    });
  }
  return quads;
}

/**
 * Supersede an old fact with a replacement: the old fact's quads are marked
 * supersededBy the new fact's IRI, and the new fact is added. Nothing is
 * deleted silently. Returns the quads to write for the supersession marker.
 */
export function supersessionQuads(oldFact: Fact, replacement: Fact): Quad[] {
  return [{
    subject: oldFact.id,
    predicate: Props.supersededBy,
    object: replacement.id,
    objectIsIri: true,
    provenance: replacement.provenance,
  }];
}

/**
 * Errors that block a write: a fact with no usable provenance (spec §2.2).
 * Empty `source` or `retrievedAt` is a missing-provenance write — it never
 * lands, however the fact was produced.
 */
export function provenanceErrors(fact: Fact): string[] {
  const errors: string[] = [];
  if (!fact.provenance?.source?.trim()) {
    errors.push(`${fact.id}: missing provenance source`);
  }
  if (!fact.provenance?.retrievedAt?.trim()) {
    errors.push(`${fact.id}: missing provenance retrievedAt`);
  }
  return errors;
}

/** Throw when a fact may not be written (missing provenance). */
export function assertProvenance(fact: Fact): void {
  const errors = provenanceErrors(fact);
  if (errors.length > 0) {
    throw new Error(
      `cannot write fact without provenance: ${errors.join("; ")}`,
    );
  }
}

/**
 * Normalize an IRI for comparison. The real client stores fact IRIs in
 * `twin:` form but reads the `supersededBy` value back as the expanded
 * `https://wazoo.dev/twins/fact/...` IRI; in-memory clients store the
 * `twin:` form as-is. Both forms name the same fact.
 */
export function normalizeIri(iri: string): string {
  const prefix = "https://wazoo.dev/twins/fact/";
  return iri.startsWith(prefix) ? `twin:${iri.slice(prefix.length)}` : iri;
}

/** True when this fact has been superseded by a later fact. */
export function isSuperseded(fact: Fact): boolean {
  const value = fact.properties["supersededBy"];
  return value !== undefined && value.trim() !== "";
}

/** The IRI of the fact that superseded `fact`, if any. */
export function supersededBy(fact: Fact): Iri | undefined {
  const value = fact.properties["supersededBy"];
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * Current (non-superseded) facts only — the set "current" queries read
 * (spec §2.1). Superseded facts are history, not answers.
 */
export function currentFacts(facts: Fact[]): Fact[] {
  return facts.filter((f) => !isSuperseded(f));
}

/**
 * Follow a supersession chain to its live head, starting from `id`.
 * Returns the head fact, or undefined when the chain leaves the given
 * facts (e.g. the replacement was never written). A cycle is treated as
 * a broken chain and returns undefined rather than looping forever.
 */
export function currentHead(facts: Fact[], id: Iri): Fact | undefined {
  const byId = new Map(facts.map((f) => [normalizeIri(f.id), f]));
  const seen = new Set<string>();
  let current = byId.get(normalizeIri(id));
  while (current !== undefined) {
    const nextId = supersededBy(current);
    if (nextId === undefined) return current;
    const key = normalizeIri(nextId);
    if (seen.has(key)) return undefined;
    seen.add(key);
    current = byId.get(key);
  }
  return undefined;
}

/**
 * The full supersession chain for `id`, oldest first, ending at the live
 * head. Returns the single fact when it was never superseded.
 */
export function history(facts: Fact[], id: Iri): Fact[] {
  const byId = new Map(facts.map((f) => [normalizeIri(f.id), f]));
  const chain: Fact[] = [];
  const seen = new Set<string>();
  let current = byId.get(normalizeIri(id));
  while (current !== undefined) {
    chain.push(current);
    const nextId = supersededBy(current);
    if (nextId === undefined) break;
    const key = normalizeIri(nextId);
    if (seen.has(key)) break;
    seen.add(key);
    current = byId.get(key);
  }
  return chain;
}

/**
 * The full supersession chain containing `id`, oldest first, ending at
 * the live head — whether `id` names the root, a middle link, or the head
 * itself. `history` only walks forward from `id`; this walks back to the
 * root first (undo needs the previous head of the chain, and the caller
 * usually names the head).
 */
export function chainContaining(facts: Fact[], id: Iri): Fact[] {
  const byId = new Map(facts.map((f) => [normalizeIri(f.id), f]));
  const predecessorOf = new Map<string, Fact>();
  for (const f of facts) {
    const next = supersededBy(f);
    if (next !== undefined) predecessorOf.set(normalizeIri(next), f);
  }
  let root = byId.get(normalizeIri(id));
  if (root === undefined) return [];
  const seenBack = new Set<string>();
  while (true) {
    const predecessor = predecessorOf.get(normalizeIri(root.id));
    if (predecessor === undefined) break;
    const key = normalizeIri(predecessor.id);
    if (seenBack.has(key)) break;
    seenBack.add(key);
    root = predecessor;
  }
  return history(facts, root.id);
}

/**
 * Supersede the fact named by `oldId` with `replacement` (spec §7).
 * Pure: validates the replacement and returns the marker quads to write —
 * it does not touch any World itself. The caller writes the replacement
 * fact, then the marker quads; the old fact's quads are left in place.
 * Throws when the replacement has no provenance or reuses the old fact's
 * id (that would be a silent overwrite, not a supersession).
 */
export function supersede(oldId: Iri, replacement: Fact): Quad[] {
  assertProvenance(replacement);
  if (normalizeIri(replacement.id) === normalizeIri(oldId)) {
    throw new Error(
      `cannot supersede ${oldId} with a fact of the same id — a supersession needs a distinct replacement id`,
    );
  }
  return [{
    subject: oldId,
    predicate: Props.supersededBy,
    object: replacement.id,
    objectIsIri: true,
    provenance: replacement.provenance,
  }];
}
