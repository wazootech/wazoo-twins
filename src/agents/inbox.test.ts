import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { GmailConnector } from "../connectors/gmail.ts";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import {
  createInboxAgent,
  draftReplyForThread,
  sendReply,
  triageThread,
} from "./inbox.ts";

const TODAY = "2026-11-06";
const ctx = () => ({
  world: createFakeWorldClient(ethanFixtureFacts()),
  tier: "draft" as const,
  today: TODAY,
});
const noGmail = new GmailConnector({
  clientId: "",
  clientSecret: "",
  refreshToken: "",
});

Deno.test("inbox: triage sorts needs-reply / FYI by World Thread facts", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const threads = await world.findFacts({ type: "Thread" });
  assertEquals(threads.map(triageThread).sort(), ["fyi", "needs-reply"]);
});

Deno.test("inbox: run triages and drafts only for needs-reply threads", async () => {
  const agent = createInboxAgent({ gmail: noGmail });
  const result = await agent.run({}, ctx());
  assertStringIncludes(result.summary[0], "1 need a reply, 1 FYI, 0 ignore");
  assert(result.summary.some((s) => s.includes("Draft ready for Travis Long")));
  assert(
    !result.summary.some((s) => s.includes("Draft ready for Purav Patel")),
  );
  assert(result.notes.some((n) => n.includes("Gmail connector unavailable")));
  assert(result.notes.some((n) => n.includes("Hi Travis")));
});

Deno.test("inbox: draft template quotes the last message, invents nothing", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const thread = (await world.findFacts({ type: "Thread" }))
    .find((t) => t.id === "twin:thread/travis-long")!;
  const draft = await draftReplyForThread(thread, {
    complete: () => Promise.resolve(null),
    provider: "deepseek",
    configured: false,
  });
  assertEquals(draft.to, "Travis Long");
  assertStringIncludes(draft.body, "Hi Travis,");
  assertStringIncludes(draft.body, "Founding Engineer role");
  assertStringIncludes(draft.body, "Best,\nEthan");
});

Deno.test("inbox: sending always throws (Phase 1 drafts only)", () => {
  assertThrows(
    () => sendReply(),
    Error,
    "requires approved tier (Phase 2)",
  );
});
