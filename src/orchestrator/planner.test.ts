import { assertEquals } from "@std/assert";
import {
  classifyIntent,
  extractDate,
  extractRepos,
  extractResearchQuery,
  planIntent,
} from "./planner.ts";

Deno.test("planner: brief intents route to the briefing agent", () => {
  assertEquals(classifyIntent("give me the morning brief"), "brief");
  assertEquals(classifyIntent("evening summary please"), "brief");
  const plan = planIntent("give me the morning brief");
  assertEquals(plan.calls, [{ agent: "briefing", input: { kind: "morning" } }]);
  assertEquals(planIntent("evening summary").calls, [
    { agent: "briefing", input: { kind: "evening" } },
  ]);
});

Deno.test("planner: questions route to briefing question mode", () => {
  assertEquals(classifyIntent("what do I owe RTX?"), "jobs-status"); // RTX is a jobs keyword
  assertEquals(classifyIntent("when is the Mozilla deadline?"), "question");
  const plan = planIntent("when is the Mozilla deadline?");
  assertEquals(plan.kind, "question");
  assertEquals(plan.calls[0].agent, "briefing");
});

Deno.test("planner: draft-reply intents route to inbox", () => {
  assertEquals(classifyIntent("draft a reply to Travis"), "draft-reply");
  assertEquals(classifyIntent("send an email to Travis"), "draft-reply");
  assertEquals(planIntent("draft a reply to Travis").calls[0].agent, "inbox");
});

Deno.test("planner: schedule intents route to calendar, with date extraction", () => {
  assertEquals(classifyIntent("when am I free tomorrow?"), "schedule");
  assertEquals(extractDate("what is on 2026-11-06?"), "2026-11-06");
  assertEquals(extractDate("when am I free?"), undefined);
  assertEquals(
    planIntent("what is on 2026-11-06?").calls,
    [{ agent: "calendar", input: { date: "2026-11-06" } }],
  );
});

Deno.test("planner: prep intents route to research + calendar", () => {
  assertEquals(classifyIntent("prep me for Ernest"), "research");
  const plan = planIntent("prep me for Ernest");
  assertEquals(plan.calls.map((c) => c.agent), ["research", "calendar"]);
  assertEquals(extractResearchQuery("prep me for Ernest"), "Ernest");
  assertEquals(
    extractResearchQuery("who is Ernest McCarter?"),
    "Ernest McCarter?",
  );
});

Deno.test("planner: github-watch extracts repos", () => {
  assertEquals(
    classifyIntent("any new PRs on wazootech/wazoo-twins?"),
    "github-watch",
  );
  assertEquals(
    extractRepos("check wazootech/wazoo-twins and wazootech/worlds-sdk-ts"),
    [
      "wazootech/wazoo-twins",
      "wazootech/worlds-sdk-ts",
    ],
  );
});

Deno.test("planner: jobs-status keywords route to jobs", () => {
  for (
    const intent of [
      "what is the status of my job applications?",
      "what do I owe RTX?",
      "General Translation next steps",
      "LM Studio application",
    ]
  ) {
    assertEquals(classifyIntent(intent), "jobs-status", intent);
  }
});

Deno.test("planner: unknown intents fall back to question, deterministically", () => {
  assertEquals(classifyIntent("flibberty gibbet"), "question");
  assertEquals(planIntent("flibberty gibbet"), planIntent("flibberty gibbet"));
});
