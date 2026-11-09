/**
 * Permission-tier tests (plan §3.5; correction-loop spec §3).
 *
 * Internal writes need the approved tier. Auto writes are audited;
 * ask-first writes need Ethan's approval. External writes always need
 * an approval card on top of the tier, and forbidden actions stay
 * forbidden at every tier.
 */
import { assertEquals, assertThrows } from "@std/assert";
import {
  ACTION_MIN_TIER,
  clampTier,
  classifyInternalWrite,
  isActionAllowed,
  PHASE1_MAX_TIER,
  PHASE2_MAX_TIER,
  requireInternalWrite,
} from "./permissions.ts";

Deno.test("permissions: world.write needs the approved tier, not read", () => {
  assertEquals(ACTION_MIN_TIER["world.write"], "approved");
  assertEquals(ACTION_MIN_TIER["world.write.internal"], "approved");
  assertEquals(isActionAllowed("world.write", "read"), false);
  assertEquals(isActionAllowed("world.write", "draft"), false);
  assertEquals(isActionAllowed("world.write.internal", "approved"), true);
  assertEquals(isActionAllowed("world.read", "read"), true);
});

Deno.test("permissions: external writes need approved tier and stay card-gated", () => {
  assertEquals(ACTION_MIN_TIER["gmail.send"], "approved");
  assertEquals(ACTION_MIN_TIER["calendar.create"], "approved");
  assertEquals(ACTION_MIN_TIER["github.write"], "approved");
  // Tier approval is not card approval: the loop still never performs
  // these without an approval card (see loop.ts).
  assertEquals(isActionAllowed("gmail.send", "draft"), false);
});

Deno.test("permissions: forbidden actions are forbidden at every tier", () => {
  for (const tier of ["read", "draft", "approved", "auto"] as const) {
    assertEquals(isActionAllowed("money.move", tier), false);
    assertEquals(isActionAllowed("job.apply", tier), false);
    assertEquals(isActionAllowed("post.publish", tier), false);
  }
});

Deno.test("permissions: phase max tiers clamp correctly", () => {
  assertEquals(PHASE1_MAX_TIER, "draft");
  assertEquals(PHASE2_MAX_TIER, "approved");
  assertEquals(clampTier("auto", PHASE2_MAX_TIER), "approved");
  assertEquals(clampTier("read", PHASE2_MAX_TIER), "read");
});

Deno.test("permissions: classifyInternalWrite — auto for cited fresh corrections", () => {
  assertEquals(
    classifyInternalWrite({
      contradictsEthanAssertedFact: false,
      retractsWholeProcedure: false,
      lowConfidence: false,
      hasFreshSource: true,
    }),
    "auto",
  );
  // Ethan's own corrections are auto.
  assertEquals(
    classifyInternalWrite({
      contradictsEthanAssertedFact: false,
      retractsWholeProcedure: false,
      lowConfidence: false,
      hasFreshSource: true,
    }),
    "auto",
  );
});

Deno.test("permissions: classifyInternalWrite — ask-first cases", () => {
  const base = {
    contradictsEthanAssertedFact: false,
    retractsWholeProcedure: false,
    lowConfidence: false,
    hasFreshSource: true,
  };
  // Contradicting Ethan with no fresh source.
  assertEquals(
    classifyInternalWrite({
      ...base,
      contradictsEthanAssertedFact: true,
      hasFreshSource: false,
    }),
    "ask-first",
  );
  // Contradicting Ethan is ask-first even WITH a fresh source: spec §5
  // rule 2 says Ethan wins over any other source, always, and the spec §9
  // risk table says contradicting Ethan is ask-first, never auto. The
  // fresh source is the evidence Ethan sees when he is asked.
  assertEquals(
    classifyInternalWrite({ ...base, contradictsEthanAssertedFact: true }),
    "ask-first",
  );
  // Retracting a whole procedure.
  assertEquals(
    classifyInternalWrite({ ...base, retractsWholeProcedure: true }),
    "ask-first",
  );
  // Low confidence.
  assertEquals(
    classifyInternalWrite({ ...base, lowConfidence: true }),
    "ask-first",
  );
});

Deno.test("permissions: requireInternalWrite enforces tier and approval", () => {
  // Below the approved tier: denied even for auto writes.
  assertThrows(
    () => requireInternalWrite("draft", "auto", false),
    Error,
    "permission denied",
  );
  // Ask-first without approval: denied.
  assertThrows(
    () => requireInternalWrite("approved", "ask-first", false),
    Error,
    "ask-first",
  );
  // Ask-first with approval: allowed.
  requireInternalWrite("approved", "ask-first", true);
  // Auto at the approved tier: allowed.
  requireInternalWrite("approved", "auto", false);
});
