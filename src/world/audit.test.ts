/**
 * Correction-loop audit tests (spec §6).
 *
 * Every internal write produces an Action fact; ask-first writes that
 * were approved also produce an Approval fact. Auto writes record that
 * they were auto under the tier rule.
 */
import { assert, assertEquals } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import {
  correctionAuditFacts,
  type CorrectionAuditRecord,
  recordWriteAudit,
} from "./audit.ts";
import { validateFact } from "./schema.ts";

const AT = "2026-11-08T12:00:00.000Z";

function record(
  over: Partial<CorrectionAuditRecord> = {},
): CorrectionAuditRecord {
  return {
    id: "audit-1",
    actor: "Ethan",
    kind: "world.correct",
    target: "twin:commitment/mozilla",
    supersedes: "twin:commitment/mozilla-v1",
    decision: "auto",
    outcome: "applied — supersedes twin:commitment/mozilla-v1",
    at: AT,
    ...over,
  };
}

Deno.test("audit: auto correction produces one valid Action fact", () => {
  const facts = correctionAuditFacts(record(), {
    source: "twin:correction-loop",
    retrievedAt: AT,
  });
  assertEquals(facts.length, 1);
  assertEquals(facts[0].type, "Action");
  assertEquals(facts[0].properties["actionType"], "world.correct");
  assertEquals(
    facts[0].properties["supersedesStatement"],
    "twin:commitment/mozilla-v1",
  );
  assertEquals(facts[0].properties["outcome"].startsWith("applied"), true);
  assertEquals(validateFact(facts[0]).length, 0);
});

Deno.test("audit: approved ask-first correction adds an Approval fact", () => {
  const facts = correctionAuditFacts(
    record({ decision: "approved", approvedBy: "Ethan" }),
    { source: "twin:correction-loop", retrievedAt: AT },
  );
  assertEquals(facts.length, 2);
  const approval = facts.find((f) => f.type === "Approval");
  assert(approval !== undefined);
  assertEquals(approval.properties["approvedBy"], "Ethan");
  assertEquals(approval.properties["approvalDecision"], "approved");
  assertEquals(validateFact(approval).length, 0);
  const action = facts.find((f) => f.type === "Action");
  assertEquals(action?.properties["approvedBy"], "Ethan");
});

Deno.test("audit: recordWriteAudit writes the facts into the World", async () => {
  const world = createFakeWorldClient();
  const facts = await recordWriteAudit(
    world,
    record({ kind: "world.undo", outcome: "undid correction" }),
    { source: "twin:correction-loop", retrievedAt: AT },
  );
  assertEquals(facts.length, 1);
  assertEquals(await world.getFact("twin:action/audit-1"), facts[0]);
  await world.close();
});

Deno.test("audit: rejected procedure patch is audited with its outcome", () => {
  const facts = correctionAuditFacts(
    record({
      kind: "procedure.patch.rejected",
      target: "twin:procedure/call-prep-v2",
      outcome: "rejected in fork eval: step-check: FAIL — missing step",
    }),
    { source: "twin:correction-loop", retrievedAt: AT },
  );
  assertEquals(facts.length, 1);
  assertEquals(facts[0].properties["actionType"], "procedure.patch.rejected");
  assert(facts[0].properties["outcome"].includes("rejected in fork eval"));
});
