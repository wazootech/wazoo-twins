# Ethan Davidson Twin — Implementation Plan (v1)

**Status:** Draft for review, Nov 6, 2026. **Do not implement until Ethan
approves this plan.** Written to be implementable in one pass once approved:
Phase 0 + Phase 1 are specified end-to-end (repo layout, modules, data model,
seed sources, eval tasks, acceptance criteria). Phase 2–3 are specified to the
level needed to build toward them without rework.

**Companion doc:** `ethan-davidson-twin-scope.md` (what a Twin is, v1
capabilities, guardrails, phases). This plan is the _how_.

**Prior-art check (Nov 6, 2026):** no Twin design doc existed before this one.
Workspace search found only the scope doc and two incidental mentions of the
word "twin" (a per-page `.md` twin in `drafts/etok-for-agents-draft.md`, a
digital-twins angle in `wazootech-memory/Micro_Companies.md`). Nothing to reuse;
this plan starts from the scope doc and the live Worlds repos.

## 1. Product shape

### 1.1 What the user sees

A Twin is **one person, one World, one orchestrator**. The user does not see
agents, tools, or SPARQL. The user sees:

- **A morning brief** (chat, ~7:30am PT, before the day starts): today's
  calendar, deadlines in the next 7 days, unanswered outreach, outstanding items
  (e.g. NBIS eApp, Vogel docs), one next action per open thread.
- **An evening summary** (chat, ~6pm PT): what moved today, what is still open,
  trackers updated.
- **On-demand answers** in chat: "what's open?", "draft a reply to Travis",
  "what do I owe RTX?", "prep me for Ernest" — every answer cites its source in
  the World.
- **Approval cards** for anything external: no email sent, no issue filed, no
  calendar hold placed, no application submitted without Ethan tapping approve.
  This matches the approval patterns he already uses (per-action GitHub
  approval, morning blog-ideas gate).
- **An audit view**: everything the Twin did, what it read, what it proposed,
  who approved it — queryable in the World itself.

That is the whole v1 product surface. No web console in v1 (the `wazoo-console`
repo exists for later); no voice; no multi-user.

### 1.2 The daily rhythm (v1)

| When           | What happens                                                          | Human touch                                                               |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 7:30am PT      | Morning brief delivered in chat                                       | Ethan reads, corrects anything wrong (corrections go back into the World) |
| During the day | On-demand Q&A + draft replies                                         | Ethan asks, Twin answers/drafts                                           |
| 6:00pm PT      | Evening summary delivered                                             | Ethan confirms or corrects                                                |
| Overnight      | World sync: Gmail/Calendar/GitHub deltas imported, validated, indexed | None — read-only sync                                                     |

### 1.3 What a Twin is, as a system

```
            ┌─────────────────────────────────┐
            │  Ethan (chat)                   │
            │  briefs, answers, drafts,       │
            │  approvals, corrections         │
            └──────────────┬──────────────────┘
                           │
            ┌──────────────▼──────────────────┐
            │  Orchestrator (the Twin)        │
            │  intent → plan → dispatch →     │
            │  merge → verify → act or ask    │
            └──────┬───────────────┬──────────┘
                   │               │
┌──────────────────▼───┐   ┌───────▼──────────────────┐
│  Sub-agents          │   │  The World (Ethan's)     │
│  inbox, calendar,    │   │  RDF quads + SPARQL +    │
│  github, jobs,       │   │  keyword FTS (+ vectors  │
│  research, briefing  │   │  locally); provenance    │
│  — scoped tools,     │   │  on every fact; audit    │
│  least privilege     │   │  quads for every action  │
└──────────┬───────────┘   └───────▲──────────────────┘
           │                       │
┌──────────▼───────────┐   ┌───────┴──────────────────┐
│  Connectors          │   │  Eval harness            │
│  Gmail, Calendar,    │   │  briefing accuracy,      │
│  GitHub, web search  │   │  draft approval rate,    │
│  — the Twin owns its │   │  zero provenance failures│
│  own credentials     │   └──────────────────────────┘
└──────────────────────┘
```

The World is the memory; the Twin is the agent that acts on it; the sub-agents
are scoped tools; the eval harness is what keeps the Twin honest. Nothing in the
system invents context — if the World doesn't have it, the Twin asks Ethan or
the research agent finds it from a public source.

### 1.4 Design principles (carried over from Ethan's own rules)

1. **Local knowledge first, managed web search as fallback.** Never invent an
   answer; never return nothing when a search could answer it.
2. **Validated answers kept distinct from unvalidated ones.** A Twin answer says
   what is verified and what is not.
3. **Provenance or it didn't happen.** Every claim cites its source quad.
4. **Human owns the schema and the summary.** The ontology and the morning brief
   are Ethan-reviewed; the Twin proposes, Ethan disposes.
5. **Self-improvement is a queryable patch with evidence**, evaluated in a fork
   and promoted only on a per-item diff with no regression (the
   worlds-sdk-ts#232 pattern — see §5).
6. **Agency feeds the product.** Anything the Twin learns that is reusable goes
   back into Worlds core; nothing is a one-off.

## 2. Stack

### 2.1 Recommended stack (best judgment)

| Layer              | Choice                                                                                                          | Why                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language / runtime | **TypeScript + Deno**                                                                                           | First-class JSR support for `@worlds/sdk`; matches worlds-sdk-ts and sparql-engine; Deno's permission flags are a natural fit for least-privilege sub-agents; one language across Twin + Worlds. |
| World (local/dev)  | **`@worlds/sdk` + LibSQL/Turso backend**, in-memory `MemoryStore` for tests                                     | The SDK's portable facade; hybrid retrieval (keyword FTS5 + vector embeddings) locally; zero-dependency Wazoo SPARQL engine as default.                                                          |
| World (deployed)   | **`worlds-api` data plane** (Cloudflare Worker + D1, `data.wazoo.dev`), world-scoped key `wzw_`                 | Already exists, self-hostable via Docker; the Twin is a data-plane client, not a new storage system.                                                                                             |
| Orchestrator       | **Custom TS loop on `@worlds/sdk` tools** (`discoverSchema`, `executeSparql`, `searchEntities`, `generateIri`)  | Keeps provenance and the verify step inside Wazoo's own tools; no framework between the Twin and its memory.                                                                                     |
| Model              | **Pluggable provider; v1 default DeepSeek** (already the wazoobench driver), env-var switch to a frontier model | Cost first while quality is measured; draft-approval rate is the metric that decides a switch (see §2.2, decision 4).                                                                            |
| Connectors         | **Google APIs (Gmail, Calendar) via official client; GitHub via Octokit + `gh` CLI; web research via search**   | The Twin must own its own credentials as a product (Google OAuth, offline refresh tokens in secure storage).                                                                                     |
| Scheduling         | **Cron for v1** (this runtime's cron, same pattern as the blog-ideas and NBIS-reminder jobs)                    | Zero new infra for dogfooding; an in-product scheduler is a Phase 3 item.                                                                                                                        |
| Hosting (v1)       | **This VM** (dogfood, zero new infra)                                                                           | Fastest path to a running Twin; the Docker/VPS and Cloudflare paths are already proven by worlds-api when it outgrows the VM.                                                                    |
| Eval               | **TS harness in the twins repo**, reusing wazoobench's split/verifier pattern                                   | Same rigor as wazoobench (held-out tasks, deterministic verifiers), but in the Twin's own language and repo.                                                                                     |
| Audit              | **Audit quads in the World** (Run/Action/Approval) + append-only log file                                       | The audit trail is queryable with the same SPARQL as everything else.                                                                                                                            |
| Repo               | **New private repo `wazootech/wazoo-twins`**                                                                    | Private per Ethan's direction; Ethan creates the empty repo first (the Muse GitHub App cannot create repos — same as holosuite-web).                                                             |

### 2.2 Decisions, with alternatives

Every call below is a judgment call. The recommendation is the default; the
alternative is a live option if Ethan disagrees.

| #  | Decision                     | Recommendation                                              | Alternative (also logical)                                                                                                 | Switch if…                                                                                                                                             |
| -- | ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1  | Runtime / language           | TypeScript + Deno                                           | **Node.js + TypeScript** — bigger ecosystem, mature `googleapis` SDKs, more agent examples                                 | Deno permission model or JSR friction costs more time than it saves; or a needed SDK is Node-only                                                      |
| 2  | Runtime / language (2nd alt) | —                                                           | **Python** — wazoobench's runner is Python, LangGraph ecosystem is the deepest for agent loops                             | The team (or a hire) is Python-first, or LangGraph's checkpointing becomes a must-have                                                                 |
| 3  | World backend                | `@worlds/sdk` + LibSQL/Turso; `worlds-api` hosted           | **Postgres + pgvector + custom SPARQL layer** — familiar ops, one database                                                 | Worlds' SPARQL/RDF model turns out to be the wrong fit for a personal Twin's data (it won't — but this is the escape hatch)                            |
| 4  | Model                        | Pluggable; v1 default DeepSeek (cost), frontier via env var | **Frontier-first (Claude/GPT)** — best draft quality from day one; measure cost, not quality                               | Draft-approval rate without edits is low (<70%) on DeepSeek, or Ethan judges the drafts visibly worse                                                  |
| 5  | Orchestrator                 | Custom TS loop on `@worlds/sdk` tools                       | **LangGraph (Python)** — checkpointing, human-in-the-loop interrupts, large community                                      | The custom loop grows a second framework by accident (retry logic, state, interrupts) — then adopt the framework instead of maintaining a shadow of it |
| 6  | Orchestrator (2nd alt)       | —                                                           | **Vercel AI SDK (TS)** — good tool-calling + streaming, stays in TypeScript                                                | Streaming chat UX becomes the priority and the custom loop's tool plumbing is the bottleneck                                                           |
| 7  | Interface                    | Chat + scheduled briefs                                     | **CLI-first** (`wazoo twins` via `@wazoo/cli`) — scriptable, Ethan-native, no chat dependency                              | Ethan finds himself living in a terminal for Twin work and chat delivery feels like a detour                                                           |
| 8  | Interface (2nd alt)          | —                                                           | **Web console-first** (extend `wazoo-console`) — a real product surface from day one                                       | The dogfood phase ends early and a customer pilot needs a UI before the chat loop is proven                                                            |
| 9  | Hosting                      | This VM (v1)                                                | **VPS + Docker Compose** (worlds-api already ships a Docker image) — the moment the Twin needs 24/7 uptime outside this VM | The Twin must run while this VM is down, or Ethan wants it reachable from anywhere                                                                     |
| 10 | Hosting (2nd alt)            | —                                                           | **Cloudflare Workers + D1** (worlds-api's own shape) — edge-native, matches the Worlds story                               | The Twin's workload is bursty and request-shaped rather than a long-running service                                                                    |
| 11 | Eval                         | TS harness in twins repo, wazoobench patterns               | **Extend wazoobench directly (Python)** — one benchmark suite for all of Wazoo                                             | Twin evals turn out to be mostly memory-lift questions, not task questions                                                                             |
| 12 | First sub-agent              | **Briefing first**                                          | **Inbox first** — highest daily value, drafts are the most visible win                                                     | Ethan decides the morning brief is nice-to-have and inbox triage is the actual pain                                                                    |
| 13 | Repo                         | New public `wazootech/wazoo-twins`                          | **Private repo first, public later** — less pressure while the Twin is rough                                               | Anything in the seed data is sensitive enough that a public repo's history is a liability (seed data lives outside the repo either way — see §4.3)     |
| 14 | Seed history window          | Last 90 days of Gmail/Calendar + all open GitHub state      | **Full history** — deeper context, better briefs                                                                           | 90 days proves too thin for threads that matter (RTX, YC) — extend per-source, not globally                                                            |

### 2.3 Hard constraints the stack must respect

- **Worlds has no built-in timestamp/version/provenance column yet**
  (worlds-sdk-ts#221, open). The Twin must carry provenance in its own layer
  (source + retrievedAt on every imported quad) until #221 lands. Do not claim
  Worlds provides it natively.
- **Hosted search is keyword-only FTS** (worlds-api#1). The SDK's hybrid (FTS5 +
  vectors) is a local capability; the hosted data plane does not do hybrid
  search yet. The Twin's retrieval must work on keyword + explicit SPARQL, and
  treat vector search as a local-only enhancement.
- **Worlds is not append-only.** Corrections and retractions are first-class
  (worlds-sdk-ts#224); the Twin's audit layer must record supersession, not just
  insertion.
- **The Muse GitHub App cannot create repos and has no Workflows permission.**
  Ethan creates `wazootech/wazoo-twins` empty first; CI/workflow files are
  handed off as apply-ready patches, not pushed by the agent.
- **Google OAuth scopes are least-privilege**: Gmail read + draft/send (send
  only in Phase 2), Calendar read + event create (Phase 2). No Drive, no
  contacts export.

## 3. Architecture

### 3.1 Modules

```
twins/
  src/
    orchestrator/        # intent → plan → dispatch → merge → verify → act/ask
      loop.ts            # the agent loop (bounded turns, no infinite loops)
      planner.ts         # decomposes intent into sub-agent calls
      verifier.ts        # checks every sub-agent result against the World
      permissions.ts     # tier enforcement (read / draft / approved / auto)
    world/
      schema.ts          # ontology: classes + properties (§3.2)
      client.ts          # @worlds/sdk wrapper (local + hosted switch)
      provenance.ts      # source + retrievedAt on every quad; supersession
      audit.ts           # Run/Action/Approval quads (§3.4)
    agents/
      briefing.ts        # morning brief + evening summary
      inbox.ts           # Gmail triage + draft replies
      calendar.ts        # scheduling, conflicts, prep
      github.ts          # repo watch, PR/issue status, blog-ideas results
      jobs.ts            # job-pipeline tracking
      research.ts        # person/company prep (public sources first)
    connectors/
      gmail.ts           # Gmail API (read, draft; send in Phase 2)
      calendar.ts        # Calendar API (read; create in Phase 2)
      github.ts          # Octokit + gh CLI
      search.ts          # managed web search fallback
    seed/
      memory-md.ts       # MEMORY.md + daily notes → quads
      trackers.ts        # opportunity tracker, goals, tracked items
      calendar.ts        # calendar import (bounded window)
      gmail.ts           # Gmail import (bounded window)
      github.ts          # open issues/PRs across wazootech
    eval/
      harness.ts         # task runner + deterministic verifiers
      tasks/             # held-out briefing/draft/scheduling tasks
      scorer.ts          # pass@1, approval rate, provenance-failure count
    service/
      server.ts          # long-running entrypoint (VM, Phase 1+)
      cron.ts            # brief + sync job definitions
      chat.ts            # chat transport (deliver briefs, take questions)
  eval-data/             # held-out tasks + expected answers (never in seed)
  docs/
    ontology.md          # human-readable schema (Ethan owns this)
    runbook.md           # how to run, rotate keys, recover
  deno.json
  README.md
```

### 3.2 Data model (Ethan's World)

Core classes. Every fact is a quad with provenance (`source`, `retrievedAt`);
corrections supersede rather than silently overwrite. The ontology lives in
`docs/ontology.md` and is Ethan-owned (worlds-sdk-ts#232 / wiki#422 pattern).

| Class          | Key properties                                 | Examples in Ethan's World                                                              |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Person`       | name, role, org, contact, relationship         | Albert Davidson (father), Peter Van Voorhis (GT), Sarah Kate Hostetter (RTX recruiter) |
| `Organization` | name, type                                     | Wazoo, RTX, General Translation, codeCampus, Pioneer Circuits                          |
| `Commitment`   | description, due, status, source               | NBIS eApp due ~Nov 8; YC decisions Dec 11; Mozilla proposal Nov 20                     |
| `Deadline`     | date, what, consequence                        | Kiroween credits request Dec 1; drug-screen retest (done, date TBD)                    |
| `Task`         | description, owner, status, nextAction         | "Draft LM Studio note", "Send W-9 to Pioneer"                                          |
| `Thread`       | channel, participants, lastMessage, needsReply | Gmail threads (Travis Long, Purav Patel, Ananay)                                       |
| `Decision`     | what, when, rationale                          | Effectors over HWIL; agency pivot; Twins over Doppel                                   |
| `Event`        | start, end, attendees, kind                    | Teaching Tue/Thu 2:15–4pm; Ernest call Fri Nov 6 11am                                  |
| `Opportunity`  | org, role, stage, nextAction, deadline         | RTX Effectors (offer decided), GT (Ernest call), LM Studio (email apply)               |
| `Run`          | agent, task, started, ended, outcome           | Audit: every Twin run                                                                  |
| `Action`       | actor, type, target, approvedBy, at            | Audit: every external action                                                           |
| `Approval`     | what, approver, decision, at                   | Audit: every approval card outcome                                                     |

Retrieval is explicit SPARQL first, keyword FTS second, vector search local-only
(§2.3). No sub-agent does free-text "ask the model what Ethan owes RTX" — it
queries the World and cites the quads.

### 3.3 The orchestrator loop

```
on intent (chat message or scheduled job):
  1. plan: decompose into sub-agent calls (planner.ts)
  2. dispatch: run sub-agents (bounded: max 3 rounds, max 10 tool calls)
  3. merge: combine results, resolve conflicts by provenance recency
  4. verify: every claim must trace to a World quad or a fresh public
     source; anything untraceable is labelled UNVERIFIED, never asserted
  5. act or ask:
     - read-only / draft → present to Ethan
     - external action → approval card (Phase 2+)
     - ambiguous / missing context → ask Ethan one question, then continue
  6. audit: write Run + Action + Approval quads
```

Loop guards: hard turn cap, no sub-agent may call another sub-agent directly
(all coordination goes through the orchestrator), no external action without the
permission tier allowing it.

### 3.4 Sub-agents (v1 contracts)

Each sub-agent is a module with one job, a fixed tool set, and a fixed output
shape (structured + cited). None of them talks to Ethan directly.

| Sub-agent | Input                | Tools                                | Output                                                                     |
| --------- | -------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Briefing  | date, World state    | World queries                        | Morning brief / evening summary (markdown, every line cited)               |
| Inbox     | Gmail delta          | Gmail read, World queries            | Triaged list (needs reply / FYI / ignore) + draft replies in Ethan's voice |
| Calendar  | date range           | Calendar read, World queries         | Conflicts, free slots respecting the teaching block, prep notes            |
| GitHub    | repo list, watermark | gh CLI / Octokit read, World queries | New activity, PR/issue status, blog-ideas results                          |
| Jobs      | opportunity list     | World queries, Gmail/Calendar read   | One next action + deadline per opportunity                                 |
| Research  | person/org name      | Web search, GitHub, X                | Prep brief: facts with sources, open questions, no invented claims         |

### 3.5 Guardrails (enforced in code, not just documented)

- Permission tiers in `permissions.ts`: `read` → `draft` → `approved` → `auto`
  (Phase 3 only). A sub-agent cannot escalate its own tier.
- No autonomous sends, no money movement, no job applications, no public posting
  — ever in v1, regardless of tier.
- Verification gate in `verifier.ts`: an answer with an untraceable claim is
  returned with the claim marked UNVERIFIED, never silently dropped and never
  silently asserted.
- Audit quads for every run, action, and approval — the Twin's work is
  queryable, including by the Twin itself.
- Ingestion validation: seed/sync imports are SHACL-checked against the
  ontology; failures quarantine the batch and alert, they never half-land.

## 4. Milestones

### Phase 0 — Seed the World (the one-shot starting point)

Goal: a World that can answer "what's open?" correctly, with sources. No agents,
no chat, no writes outside the World.

| #   | Task                                                                                                                                                                       | Done when                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0.1 | Ethan creates empty `wazootech/wazoo-twins` repo; clone + scaffold per §3.1                                                                                                | Repo exists, `deno.json` + README + module skeleton compile                                      |
| 0.2 | `world/schema.ts` + `docs/ontology.md` for the §3.2 classes                                                                                                                | Ethan reviews the ontology doc and approves it                                                   |
| 0.3 | `world/client.ts`: `@worlds/sdk` wrapper, local LibSQL backend, hosted switch                                                                                              | Same code reads/writes local and hosted (flag flip)                                              |
| 0.4 | Seed importers (§4.3): MEMORY.md + daily notes, opportunity tracker, goals/tracked items, calendar (90 days), Gmail (90 days), GitHub open state                           | Import runs end-to-end; every quad has source + retrievedAt; SHACL check passes; counts reported |
| 0.5 | Retrieval smoke tests: 20 hand-written questions ("what do I owe RTX?", "when is the Mozilla deadline?", "who is Ernest McCarter?") answered from the World with citations | 20/20 answered, every claim cited, zero invented facts                                           |
| 0.6 | Eval harness skeleton + held-out task set (10 briefing questions, 10 draft tasks, 5 scheduling tasks) with deterministic verifiers                                         | Harness runs; baseline scores recorded (expect low — that is the point)                          |

**Phase 0 acceptance:** Ethan asks 10 new questions he did not write, the Twin
answers from the World, and he judges the answers correct and cited. If any
answer invents a fact, Phase 0 is not done.

### Phase 1 — Read-only Twin

Goal: briefings, research, drafts. No writes outside the World.

| #   | Task                                                                   | Done when                                                                           |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1.1 | Orchestrator loop (§3.3) + permissions tiers (read/draft enforced)     | Loop runs bounded; a draft-tier request cannot perform an external action in a test |
| 1.2 | Briefing agent + cron jobs (7:30am brief, 6pm summary, overnight sync) | 7 consecutive days of briefs delivered; Ethan corrects ≤2 facts per brief by day 7  |
| 1.3 | Research agent (public sources first)                                  | 5 prep briefs written (real upcoming calls); zero invented claims across all 5      |
| 1.4 | Inbox agent (triage + drafts only)                                     | 1 week of triage; draft-approval-without-edits rate measured and reported           |
| 1.5 | Calendar agent (read-only: conflicts, slots, prep)                     | 10 scheduling questions answered correctly, teaching block never violated           |
| 1.6 | GitHub + Jobs agents (read-only watch)                                 | Daily watch summary matches `gh` state; zero missed PR/issue events in a week       |
| 1.7 | Eval run: full held-out set, scores recorded                           | Scores published in-repo; any regression vs. baseline is explained, not hidden      |

**Phase 1 acceptance:** one full week where the Twin's briefs, drafts, and watch
summaries are useful enough that Ethan reads them daily — and zero unapproved
external actions, zero provenance failures.

### Phase 2 — Supervised writes

Goal: drafts filed/sent, calendar holds placed, GitHub comments posted — all
through approval cards.

| #   | Task                                                                                | Done when                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2.1 | Approval-card transport (chat) + `approved` tier enforcement                        | Every external action in tests is preceded by an approval record                                |
| 2.2 | Gmail send (approved drafts only), Calendar create (holds only)                     | 10 approved sends/holds, zero unapproved                                                        |
| 2.3 | GitHub writes (comments, issue filing) via approval, per-action                     | 10 approved writes, zero unapproved; duplicates impossible (state re-checked before each write) |
| 2.4 | Correction loop: Ethan's corrections update the World (supersession, not overwrite) | 5 corrections applied; the corrected fact wins in later briefs                                  |

**Phase 2 acceptance:** 2 weeks of supervised operation, zero unapproved
external actions, and Ethan's correction rate falling week over week.

### Phase 3 — Autonomous routine

Goal: recurring low-risk actions only, with a full audit log. Not scoped in
detail here — Phase 3 is a decision point after Phase 2 proves itself, not a
commitment now. Candidates: tracker updates, scan summaries, blog-ideas result
filing (through the existing morning approval gate).

### 4.1 What "one-shot" means here

If this plan is approved as-is, the build order is 0.1 → 0.6, then 1.1 → 1.7,
with no step requiring a new design decision. Every judgment call is already
made in §2.2, with its alternative named. The only inputs needed from Ethan
before starting are the §6 decisions (repo creation + the two open questions)
and the Google OAuth setup for the connectors.

## 5. Eval design

- **Held-out tasks, never in the seed.** Briefing questions, draft tasks, and
  scheduling tasks are written from real upcoming work, then frozen. The Twin
  never trains on them.
- **Deterministic verifiers where possible** (dates, names, links, slot
  validity), human judgment where not (draft quality = approval-without-edits).
- **Metrics:** briefing accuracy, draft approval rate, scheduling correctness,
  provenance-failure count (must stay zero), unapproved-action count (must stay
  zero).
- **Self-improvement follows worlds-sdk-ts#232:** a Twin improvement is a SPARQL
  UPDATE patch with evidence quads, evaluated in a fork, promoted only on a
  per-item diff with no regression. No silent self-edits.
- **Baseline first.** Phase 0.6 records scores before any agent work, so Phase 1
  has something to beat honestly.

## 6. Decisions needed from Ethan (review)

1. **Approve this plan as-is, or pick alternatives from §2.2?** (State the ones
   you disagree with; the alternatives are already written.)
2. **Where does v1 run?** Recommended: this VM. Alternatives: VPS/Docker,
   Cloudflare Workers.
3. **First sub-agent?** Recommended: briefing (zero-write, proves the World).
   Alternative: inbox (highest daily value).
4. **Create the empty `wazootech/wazoo-twins` repo** (private, per Ethan's
   direction) — the App cannot create it.
5. **Google OAuth setup** for Gmail/Calendar (scopes in §2.3) — needed before
   the inbox/calendar agents, not before Phase 0.
6. **Seed window:** 90 days of Gmail/Calendar (recommended) or full history
   (§2.2, decision 14).

## 7. Risks

| Risk                              | Mitigation                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Provenance gaps (#221 not landed) | Twin carries provenance in its own layer; never claim Worlds provides it natively          |
| Hosted search is keyword-only     | Retrieval is SPARQL + keyword first; vectors are local-only                                |
| Model draft quality is poor       | Draft-approval rate is the tripwire; frontier model is one env var away (§2.2 #4)          |
| Google OAuth / token storage      | Least-privilege scopes; refresh tokens in secure storage only; rotate on any suspicion     |
| Solo, part-time builder           | Phase 0 is the smallest shippable unit; nothing in Phase 1 depends on Phase 2              |
| Twin invents a fact in a brief    | Verifier gate (§3.5); any invented claim fails Phase 0/1 acceptance, not just a bug ticket |
| Scope creep into a product launch | v1 is dogfood, not a launch (§10 of the scope doc); a customer Twin is a separate plan     |

## Appendix A. Seed sources (Phase 0.4)

| Source                        | Importer            | Window / scope                                                   |
| ----------------------------- | ------------------- | ---------------------------------------------------------------- |
| `~/MEMORY.md`                 | `seed/memory-md.ts` | Whole file, sectioned                                            |
| `~/memory/*.md` daily notes   | `seed/memory-md.ts` | Whole files                                                      |
| Opportunity tracker           | `seed/trackers.ts`  | Whole file                                                       |
| Goals / tracked items         | `seed/trackers.ts`  | Active items                                                     |
| Google Calendar               | `seed/calendar.ts`  | Last 90 days + next 90 days                                      |
| Gmail                         | `seed/gmail.ts`     | Last 90 days, threads with Ethan as participant                  |
| GitHub (wazootech + personal) | `seed/github.ts`    | Open issues/PRs; closed items only where referenced by open ones |
| `~/USER.md`, people files     | `seed/memory-md.ts` | Whole files                                                      |

Seed data lives **outside the repo** (local files + the World), never committed
— the repo holds code, ontology, and eval tasks only.

## Appendix B. Related Wazoo work this builds on

- worlds-sdk-ts — `@worlds/sdk` (JSR), SPARQL engine, MemoryStore; #221
  provenance, #151 SHACL, #224 retraction, #226, #227, #232 self-improving
  harness design.
- worlds-api — data plane (Cloudflare Worker + D1, `wzw_` keys); #1 keyword-only
  search.
- wazoobench — memory-lift benchmark, pass@1 with/without memory, held-out
  tasks, deterministic verifiers; DeepSeek driver.
- sparql-engine — Deno + TypeScript, ScriptC native CLI.
- wazoo-cli / wazoo-console / worlds-client-ts / worlds-cloudflare — existing
  surfaces the Twin can reuse or extend later, not in v1.
