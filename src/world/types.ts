/**
 * Core types for the Twin's World.
 *
 * A Fact is the Twin's unit of knowledge: a typed record that serializes to
 * RDF quads. Every Fact carries Provenance — its source and when it was
 * retrieved — because Worlds has no built-in timestamp/version/provenance
 * column yet (wazootech/worlds-sdk-ts#221, open). The Twin carries
 * provenance in its own layer and never claims Worlds provides it natively.
 */

export type Iri = string;

/** Where a fact came from, and when the Twin read it. */
export interface Provenance {
  /** Human-readable source, e.g. "MEMORY.md#L41" or "github:wazootech/worlds-sdk-ts#251". */
  source: string;
  /** ISO 8601 timestamp of retrieval. */
  retrievedAt: string;
}

/** One RDF quad, with Twin-level provenance attached. */
export interface Quad {
  subject: Iri;
  predicate: Iri;
  object: string;
  /** True when `object` is an IRI, false when it is a literal. */
  objectIsIri: boolean;
  graph?: Iri;
  provenance: Provenance;
  /** IRI of the fact that superseded this quad, if any (never silently overwritten). */
  supersededBy?: Iri;
}

/** A typed fact in the World. Serializes to one quad per property. */
export interface Fact {
  /** Stable IRI, e.g. `twin:commitment/nbis-eapp`. */
  id: Iri;
  /** Ontology class, e.g. "Commitment". See src/world/schema.ts. */
  type: string;
  /** Short human label. */
  label: string;
  /** Property name -> literal value. Property names are ontology predicates. */
  properties: Record<string, string>;
  provenance: Provenance;
}

/** A pointer from a claim back to the fact(s) that support it. */
export interface Citation {
  factId: Iri;
  source: string;
  quote?: string;
}

/** A single claim in a Twin answer, with its evidence attached. */
export interface CitedClaim {
  text: string;
  citations: Citation[];
  /** False when no supporting fact exists — the claim must be marked UNVERIFIED, never asserted. */
  verified: boolean;
}

/** Result of validating one fact against the ontology (SHACL-style gate). */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
