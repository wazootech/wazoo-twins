import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { GmailConnector, GmailNotConfiguredError } from "./gmail.ts";

const noCreds = new GmailConnector({
  clientId: "",
  clientSecret: "",
  refreshToken: "",
});

Deno.test("gmail: reads throw a clear OAuth error when not set up", async () => {
  assertEquals(noCreds.isConfigured(), false);
  await assertRejects(
    () => noCreds.listMessages(),
    GmailNotConfiguredError,
    "Google OAuth not set up",
  );
  await assertRejects(
    () => noCreds.getMessage("abc"),
    GmailNotConfiguredError,
    "docs/runbook.md",
  );
});

Deno.test("gmail: createDraft and send are Phase 2 stubs that throw", async () => {
  await assertRejects(
    () => noCreds.createDraft("a@b.c", "hi", "body"),
    Error,
    "requires approved tier (Phase 2)",
  );
  await assertRejects(
    () => noCreds.send("a@b.c", "hi", "body"),
    Error,
    "requires approved tier (Phase 2)",
  );
});

Deno.test("gmail: listMessages works with a token exchange (injected fetch)", async () => {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request): Promise<Response> => {
    await Promise.resolve();
    const url = String(input);
    calls.push(url);
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "tok" }), {
        status: 200,
      });
    }
    if (url.includes("/messages?")) {
      return new Response(
        JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }] }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        snippet: "hello",
        payload: {
          headers: [
            { name: "Subject", value: "Intro" },
            { name: "From", value: "Travis Long <travis@example.com>" },
            { name: "Date", value: "Thu, 5 Nov 2026 13:37:00 -0800" },
          ],
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const conn = new GmailConnector({
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtok",
    fetchFn,
  });
  const messages = await conn.listMessages("is:unread", 5);
  assertEquals(messages.length, 1);
  assertEquals(messages[0].subject, "Intro");
  assertStringIncludes(messages[0].from, "Travis Long");
  assert(calls.some((c) => c.includes("oauth2.googleapis.com/token")));
});
