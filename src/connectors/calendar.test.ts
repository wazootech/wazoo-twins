import { assertEquals, assertRejects } from "@std/assert";
import { CalendarConnector, CalendarNotConfiguredError } from "./calendar.ts";

const noCreds = new CalendarConnector({
  clientId: "",
  clientSecret: "",
  refreshToken: "",
});

Deno.test("calendar connector: reads throw a clear OAuth error when not set up", async () => {
  assertEquals(noCreds.isConfigured(), false);
  await assertRejects(
    () =>
      noCreds.listEvents(
        "2026-11-06T00:00:00-08:00",
        "2026-11-06T23:59:59-08:00",
      ),
    CalendarNotConfiguredError,
    "Google OAuth not set up",
  );
  await assertRejects(
    () => noCreds.getEvent("e1"),
    CalendarNotConfiguredError,
    "docs/runbook.md",
  );
});

Deno.test("calendar connector: createEvent is a Phase 2 stub that throws", async () => {
  await assertRejects(
    () =>
      noCreds.createEvent({
        summary: "Call",
        start: "2026-11-07T10:00:00-08:00",
        end: "2026-11-07T10:30:00-08:00",
      }),
    Error,
    "requires approved tier (Phase 2)",
  );
});

Deno.test("calendar connector: listEvents works with a token exchange (injected fetch)", async () => {
  const fetchFn = (async (input: string | URL | Request): Promise<Response> => {
    await Promise.resolve();
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "tok" }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        items: [{
          id: "ev1",
          summary: "Call with Ernest McCarter",
          start: { dateTime: "2026-11-06T11:00:00-08:00" },
          end: { dateTime: "2026-11-06T11:30:00-08:00" },
          attendees: [{ email: "ernest@example.com" }],
          htmlLink: "https://calendar.google.com/event?eid=ev1",
        }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const conn = new CalendarConnector({
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtok",
    fetchFn,
  });
  const events = await conn.listEvents(
    "2026-11-06T00:00:00-08:00",
    "2026-11-06T23:59:59-08:00",
  );
  assertEquals(events.length, 1);
  assertEquals(events[0].summary, "Call with Ernest McCarter");
  assertEquals(events[0].attendees, ["ernest@example.com"]);
});
