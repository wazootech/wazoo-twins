# Wazoo Twins — Ethan Davidson Twin (v1)

A Twin is a **super-agent that orchestrates many other agents using shared,
expansive context via Worlds infrastructure**. This repo holds the first Twin:
Ethan Davidson's personal twin, a dogfood build. The World is the memory; the
Twin is the agent that acts on it.

**Owner:** [@EthanThatOneKid](https://github.com/EthanThatOneKid) · **License:**
MIT · **Set up, check, and test:** `deno task ci`

## Status

Phase 0 + Phase 1 implemented (Nov 6, 2026). Read-only Twin: briefings,
research, drafts — no external writes. Phase 2 (supervised writes) is not built
yet.

Design docs: `docs/ethan-davidson-twin-scope.md` (what a Twin is) and
`docs/ethan-davidson-twin-implementation-plan.md` (how it is built).

## How it fits together

Ethan talks only to the orchestrator. Sub-agents are scoped tools that never
talk to Ethan or to each other; the World holds every fact and every audit
record; the eval harness scores the whole system against the World.

```mermaid
flowchart TD
    ethan["Ethan (chat)<br/>briefs, answers, drafts, approvals"]
    orch["Orchestrator (the Twin)<br/>plan, dispatch, merge, verify, act or ask"]
    subs["Sub-agents<br/>briefing · inbox · calendar · github · jobs · research"]
    conns["Connectors<br/>Gmail · Calendar · GitHub · web search"]
    world[("The World<br/>RDF quads, SPARQL, keyword search<br/>provenance on every fact")]
    evals["Eval harness<br/>briefing accuracy, draft approval,<br/>zero provenance failures"]

    ethan <--> orch
    orch --> subs
    subs --> conns
    subs -->|read| world
    orch -->|"audit quads"| world
    evals -->|scores| world
```

## What it does (v1)

- **Morning brief** (7:30am PT) and **evening summary** (6pm PT) from the World
  — every line cited to its source.
- **On-demand answers** from the World with citations; anything untraceable is
  marked UNVERIFIED, never asserted.
- **Inbox triage + draft replies** (drafts only, never sent).
- **Calendar, GitHub, and job-pipeline watch** (read-only).
- **Research briefs** for upcoming calls (public sources first).

### The orchestrator loop

Every request, chat or scheduled, runs the same bounded loop (max 3 rounds, 10
tool calls). Nothing leaves the loop unverified, and every run is written back
to the World as audit quads.

```mermaid
flowchart LR
    intent(["Intent<br/>chat or cron"]) --> plan["1. Plan"]
    plan --> dispatch["2. Dispatch<br/>sub-agents"]
    dispatch --> merge["3. Merge<br/>newest provenance wins"]
    merge --> verify{"4. Verify<br/>traceable?"}
    verify -->|"no"| unverified["Mark UNVERIFIED"]
    verify -->|"yes"| decide{"5. Act or ask"}
    unverified --> decide
    decide -->|"read or draft"| present["Present to Ethan"]
    decide -->|"missing context"| ask["Ask one question"]
    decide -->|"external action"| approval["Approval card<br/>(Phase 2+)"]
    present --> audit["6. Audit<br/>Run, Action, Approval quads"]
    ask --> audit
    approval --> audit
```

## Stack

TypeScript + Deno. `@worlds/sdk` (`memory` in-memory backend for dev/tests,
`@worlds/libsql` durable local backend, `worlds-api` hosted switch). Custom
orchestrator loop. Model is pluggable (DeepSeek default, frontier switch);
without a model key, draft prose falls back to deterministic templates. Runs on
this VM; scheduled by cron.

## Quickstart

```sh
deno task ci      # format check, lint, typecheck, and tests
deno task seed    # build the World from MEMORY.md, trackers, GitHub
deno task smoke   # 20 smoke questions, answered with citations
deno task eval    # held-out eval set + baseline scores
deno task brief --kind morning   # dry-run morning brief (stdout only)
```

See `docs/runbook.md` for environment variables, cron jobs, and recovery.

## Guardrails (non-negotiable)

- Provenance on every quad (`source` + `retrievedAt`); Worlds has no native
  provenance column yet (worlds-sdk-ts#221) — the Twin carries it itself.
- Verifier gate: untraceable claims are marked UNVERIFIED, never asserted.
- No external action without approval. Phase 1 is read-only: no sends, no GitHub
  writes, no calendar creates.
- Seed data lives outside the repo (see `docs/runbook.md`).
- Hosted search is keyword-only (worlds-api#1); vector search is local-only.

### Permission tiers

A sub-agent can never raise its own tier. Phase 1 runs at `read` and `draft`
only; `auto` is Phase 3. Money movement, job applications, and public posting
are forbidden at every tier.

```mermaid
flowchart LR
    read["read<br/>query the World"] --> draft["draft<br/>write drafts, never send"]
    draft --> approved["approved<br/>sends, calendar, GitHub writes,<br/>each human-approved (Phase 2)"]
    approved --> auto["auto<br/>autonomous routine<br/>(Phase 3)"]
    forbidden["Always forbidden (v1):<br/>autonomous sends · money movement ·<br/>job applications · public posting"]
    auto -.- forbidden
```
