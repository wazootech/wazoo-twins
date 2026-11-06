import { assertEquals } from "@std/assert";
import { parseTracker } from "./trackers.ts";

const NOW = "2026-11-06T12:00:00.000Z";

Deno.test("parseTracker: named opportunities get stage, deadline facts for dated ones", () => {
  const text = [
    "# Wazoo Opportunity Tracker",
    "## Active opportunities — in deadline order",
    "- **YC W27** — Submitted Nov 2, 2026. Decisions Dec 11, 2026. **Next step: wait for decisions.**",
    "- **Mozilla Incubator** — P1. Deadline Fri Nov 20, 2026, 11:59pm PT. Draft ready, blockers listed.",
    "- **Basis Fellowship** — P2 verify-first. No deadline stated.",
    "## This week's next actions",
    "- [x] **Sun Nov 1, 2026:** a16z Speedrun SR008 SUBMITTED.",
    "- [ ] **Thu Nov 12, 5pm UTC:** Mozilla webinar — attend or watch.",
  ].join("\n");
  const { facts, skipped, parsed } = parseTracker(text, NOW);
  assertEquals(parsed, 5);
  assertEquals(skipped, 0);
  const opps = facts.filter((f) => f.type === "Opportunity");
  assertEquals(opps.length, 3);
  assertEquals(
    opps.find((f) => f.label === "YC W27")?.properties["stage"],
    "submitted",
  );
  assertEquals(
    opps.find((f) => f.label === "Mozilla Incubator")?.properties["stage"],
    "p1",
  );
  assertEquals(
    opps.find((f) => f.label === "Basis Fellowship")?.properties["stage"],
    "p2",
  );
  const deadlines = facts.filter((f) => f.type === "Deadline");
  assertEquals(deadlines.length, 2);
  assertEquals(
    deadlines.find((f) => f.label === "YC W27 deadline")?.properties["due"],
    "2026-11-02",
  );
  const tasks = facts.filter((f) => f.type === "Task");
  assertEquals(tasks.length, 2);
  assertEquals(
    tasks.find((f) => f.properties["status"] === "done")?.properties["due"],
    "2026-11-01",
  );
  assertEquals(
    tasks.find((f) => f.properties["status"] === "open")?.properties["due"],
    "2026-11-12",
  );
});

Deno.test("parseTracker: unparseable lines are skipped", () => {
  const { facts, skipped } = parseTracker(
    "- just a dash line with no bold name\n- **OK Name** — has a real description here.\n",
    NOW,
  );
  assertEquals(facts.length, 1);
  assertEquals(skipped, 1);
});
