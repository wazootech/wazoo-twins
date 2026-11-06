/**
 * Provenance helpers (plan §2.3, §3.5).
 *
 * Worlds has no built-in timestamp/version/provenance column yet
 * (wazootech/worlds-sdk-ts#221, open), so the Twin carries provenance in
 * its own layer: every Fact records `source` + `retrievedAt`, and
 * corrections supersede rather than silently overwrite.
 */
import { Props } from "./schema.ts";
import type { Fact, Provenance, Quad } from "./types.ts";

export function provenance(
  source: string,
  retrievedAt: string = new Date().toISOString(),
): Provenance {
  return { source, retrievedAt };
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
