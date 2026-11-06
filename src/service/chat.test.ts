import { assertEquals, assertStringIncludes } from "@std/assert";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import { formatResult, handleIntentLine, readLines } from "./chat.ts";
import { runIntent } from "../orchestrator/loop.ts";

const TODAY = "2026-11-06";
const ctx = () => ({
  world: createFakeWorldClient(ethanFixtureFacts()),
  tier: "draft" as const,
  today: TODAY,
});

Deno.test("chat: formatResult renders claims, summary, and notes", async () => {
  const result = await runIntent("what's open?", ctx());
  const text = formatResult(result);
  assertStringIncludes(text, "## Answer — question");
  assertStringIncludes(text, "NBIS eApp");
  assertStringIncludes(text, "[test-fixture]");
});

Deno.test("chat: formatResult labels UNVERIFIED claims, never hides them", () => {
  const text = formatResult({
    intent: "x",
    kind: "question",
    claims: [{ text: "Untraceable claim", citations: [], verified: false }],
    summary: [],
    notes: [],
    action: "present",
    runId: "r",
    actionIds: [],
    rounds: 1,
    toolCalls: 1,
  });
  assertStringIncludes(text, "Untraceable claim [UNVERIFIED]");
});

Deno.test("chat: handleIntentLine answers an intent from the World", async () => {
  const text = await handleIntentLine("what's open?", ctx());
  assertStringIncludes(text, "NBIS eApp");
  assertStringIncludes(text, "Vogel citizenship documents");
});

Deno.test("chat: readLines splits a stream into lines", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("first line\nsecond"));
      controller.enqueue(new TextEncoder().encode(" line\nthird line"));
      controller.close();
    },
  });
  const lines: string[] = [];
  for await (const line of readLines(stream)) lines.push(line);
  assertEquals(lines, ["first line", "second line", "third line"]);
});
