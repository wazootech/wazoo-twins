import { assertEquals, assertRejects } from "@std/assert";
import { calendarEventsToFacts, importCalendar } from "./calendar.ts";
import { GOOGLE_OAUTH_NOT_SETUP } from "./calendar.ts";

const NOW = "2026-11-06T12:00:00.000Z";

Deno.test("calendarEventsToFacts maps events, skips dateless ones", () => {
  const facts = calendarEventsToFacts([
    {
      id: "abc123",
      summary: "Ernest McCarter call",
      start: { dateTime: "2026-11-06T11:00:00-08:00" },
      end: { dateTime: "2026-11-06T11:30:00-08:00" },
      attendees: [{
        email: "ernest@example.com",
        displayName: "Ernest McCarter",
      }],
    },
    { id: "nodate", summary: "Dateless event" },
  ], NOW);
  assertEquals(facts.length, 1);
  assertEquals(facts[0].type, "Event");
  assertEquals(facts[0].properties["start"], "2026-11-06T11:00:00-08:00");
  assertEquals(facts[0].properties["kind"], "calendar");
  assertEquals(facts[0].properties["attendees"], "Ernest McCarter");
  assertEquals(facts[0].provenance.source, "google-calendar:abc123");
});

Deno.test("importCalendar throws the clear OAuth error when credentials are absent", async () => {
  for (
    const name of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REFRESH_TOKEN",
    ]
  ) {
    Deno.env.delete(name);
  }
  await assertRejects(() => importCalendar(), Error, GOOGLE_OAUTH_NOT_SETUP);
});
