import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { CalendarConnector } from "../connectors/calendar.ts";
import { createFakeWorldClient } from "../testutil/fake-world.ts";
import { ethanFixtureFacts } from "../testutil/fixtures.ts";
import {
  createCalendarAgent,
  findConflicts,
  findFreeSlots,
  isTeachingBlock,
} from "./calendar.ts";

const TODAY = "2026-11-06"; // Friday
const TUESDAY = "2026-11-03";
const ctx = () => ({
  world: createFakeWorldClient(ethanFixtureFacts()),
  tier: "draft" as const,
  today: TODAY,
});
const noCalendar = new CalendarConnector({
  clientId: "",
  clientSecret: "",
  refreshToken: "",
});

Deno.test("calendar: teaching block is Tue/Thu 1:30–4:30pm PT, nothing else", () => {
  assertEquals(isTeachingBlock(TUESDAY, 14 * 60), true);
  assertEquals(isTeachingBlock(TUESDAY, 16 * 60 + 29), true);
  assertEquals(isTeachingBlock(TUESDAY, 13 * 60), false);
  assertEquals(isTeachingBlock(TUESDAY, 16 * 60 + 30), false);
  assertEquals(isTeachingBlock(TODAY, 15 * 60), false); // Friday
  assertEquals(isTeachingBlock("2026-11-05", 15 * 60), true); // Thursday
});

Deno.test("calendar: free slots never include the teaching block", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const events = await world.findFacts({ type: "Event" });
  const tuesdayEvents = events.filter((e) =>
    (e.properties.start ?? "").startsWith(TUESDAY)
  );
  const slots = findFreeSlots(tuesdayEvents, TUESDAY);
  // Teaching 2:15–4pm PT occupies the block; slots must end by 1:30pm or start at/after 4:30pm.
  for (const slot of slots) {
    assert(
      slot.end <= "1:30pm" || slot.start >= "4:30pm",
      `slot overlaps teaching block: ${slot.start}–${slot.end}`,
    );
  }
  assert(slots.some((s) => s.start === "9:00am"));
});

Deno.test("calendar: overlapping events on Friday are flagged as conflicts", async () => {
  const world = createFakeWorldClient(ethanFixtureFacts());
  const events = (await world.findFacts({ type: "Event" }))
    .filter((e) => (e.properties.start ?? "").startsWith(TODAY));
  const conflicts = findConflicts(events);
  assertEquals(conflicts.length, 1);
  assertEquals(conflicts[0][0].label, "Call with John Carlo Manuel");
  assertEquals(conflicts[0][1].label, "Call with Jeff Kazzee");
});

Deno.test("calendar: run reports conflicts, slots, and the connector fallback note", async () => {
  const agent = createCalendarAgent(noCalendar);
  const result = await agent.run({}, ctx());
  assert(
    result.claims.some((c) => c.text.includes("Call with Ernest McCarter")),
  );
  assert(result.summary.some((s) => s.includes("Conflict:")));
  assert(result.summary.some((s) => s.includes("Free slots")));
  assert(
    result.notes.some((n) => n.includes("Calendar connector unavailable")),
  );
  // Friday has no teaching block note.
  assert(!result.notes.some((n) => n.includes("teaching block applies")));
});

Deno.test("calendar: run on a Tuesday notes the teaching block", async () => {
  const agent = createCalendarAgent(noCalendar);
  const result = await agent.run({ date: TUESDAY }, ctx());
  assert(result.notes.some((n) => n.includes("teaching block applies")));
  assertStringIncludes(result.summary.join(" "), "Free slots");
});
