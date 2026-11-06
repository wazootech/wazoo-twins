import { assertEquals, assertRejects } from "@std/assert";
import {
  gmailThreadsToFacts,
  groupGmailThreads,
  importGmail,
} from "./gmail.ts";
import { GOOGLE_OAUTH_NOT_SETUP } from "./calendar.ts";

const NOW = "2026-11-06T12:00:00.000Z";

Deno.test("gmailThreadsToFacts: one Thread per thread, needsReply from the latest sender", () => {
  const threads = groupGmailThreads([
    {
      id: "m1",
      threadId: "t1",
      from: "Ethan Davidson <ethan.r.davidson@gmail.com>",
      to: "travis@autonomoussearch.io",
      subject: "Re: Founding Engineer",
      date: "2026-11-06T02:27:00Z",
    },
    {
      id: "m2",
      threadId: "t1",
      from: "Travis Long <travis@autonomoussearch.io>",
      to: "ethan.r.davidson@gmail.com",
      subject: "Re: Founding Engineer",
      date: "2026-11-06T09:00:00Z",
      snippet: "Let's talk Monday",
    },
    {
      id: "m3",
      threadId: "t2",
      from: "Ethan Davidson <ethan.r.davidson@gmail.com>",
      to: "purav@clayzo.com",
      subject: "Clayzo trial",
      date: "2026-11-06T07:27:00Z",
    },
  ]);
  assertEquals(threads.length, 2);
  const facts = gmailThreadsToFacts(threads, NOW);
  assertEquals(facts.length, 2);
  const t1 = facts.find((f) => f.id === "twin:thread/gmail-t1")!;
  assertEquals(t1.properties["channel"], "gmail");
  assertEquals(t1.properties["needsReply"], "yes");
  assertEquals(
    t1.properties["lastMessage"]?.includes("Let's talk Monday"),
    true,
  );
  assertEquals(
    facts.find((f) => f.id === "twin:thread/gmail-t2")
      ?.properties["needsReply"],
    "no",
  );
});

Deno.test("importGmail throws the clear OAuth error when credentials are absent", async () => {
  for (
    const name of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REFRESH_TOKEN",
    ]
  ) {
    Deno.env.delete(name);
  }
  await assertRejects(() => importGmail(), Error, GOOGLE_OAUTH_NOT_SETUP);
});
