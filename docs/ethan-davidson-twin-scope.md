# Ethan Davidson Twin — Scope (v1)

**Status:** Draft scope, Nov 6, 2026. First Twin; dogfood build before any
customer Twin. **Working name:** Wazoo Twins. ("Doppel" was considered Nov 6 and
rejected — see Naming.) **Implementation plan:**
`ethan-davidson-twin-implementation-plan.md` (draft for review, Nov 6, 2026 — do
not implement until approved).

## 1. What a Twin is

A Twin is a **super-agent that orchestrates many other agents using shared,
expansive context via Worlds infrastructure**.

It is not a chatbot and not a single-purpose agent. The Twin is the
orchestrator: it takes Ethan's intent, decomposes it, dispatches work to
specialist sub-agents, merges their results, and asks when something is
ambiguous. All sub-agents read from and write to **one shared World** — Ethan's
world model — so context is never re-explained, re-fetched, or invented by any
single agent. The World is the memory; the Twin is the agent that acts on it.

This is the product form of Wazoo's core thesis: verifiable, provenance-aware
memory makes agents safe to let act. A Twin you can audit is a product; a
black-box clone is a liability.

## 2. Why Ethan first

Ethan is a solo founder, part-time on Wazoo, juggling: RTX onboarding (NBIS
eApp, drug screen, clearance docs), an active job search (General Translation,
LM Studio, Benchmark Motion, eClerx, Intuit), codeCampus teaching Tue/Thu, a
circuit-board contract, Wazoo itself (YC W27 submitted, a16z Speedrun submitted,
Mozilla proposal, KGC pitch, blog, dcwg-memory), and daily tracking (weight,
opportunities). His bottleneck is coordination overhead across all of that, not
any single task.

Dogfooding proves the architecture before it is sold: if a Twin can keep Ethan's
threads straight, it can keep a customer's best operator straight. The Ethan
Twin is also the demo for the agency pivot — "we built one for the founder; we
can build one for your best operator."

The PCB manufacturing company is explicitly **out of scope for v1** — there is
no direct solution or product to integrate there yet, and more prep is needed
first. The Twin is built for Ethan, then the agency story follows.

## 3. The World: Ethan's shared context

One World, seeded from sources Ethan already has:

| Source                        | What it contributes                                         |
| ----------------------------- | ----------------------------------------------------------- |
| `MEMORY.md` + daily notes     | durable facts, preferences, decisions, commitments          |
| Opportunity tracker           | Wazoo deadlines (YC Dec 11, Mozilla Nov 20, KGC, Techstars) |
| Goals / tracked items         | RTX pipeline, Pioneer W-9, docs.wazoo.dev issue, etc.       |
| Google Calendar               | teaching blocks, calls, deadlines, hard constraints         |
| Gmail                         | outreach, threads, approvals, deadlines                     |
| GitHub (wazootech + personal) | issues, PRs, blog-idea pipeline, repo state                 |
| `USER.md` + people files      | who matters, relationships, contact details                 |

Rules for the World: every fact carries provenance (source + date). Ingestion is
validated (SHACL-style gates); retractions and corrections propagate instead of
silently overwriting. This is Worlds' existing work (worlds-sdk-ts#221
provenance, #151 SHACL, #224 retraction handling) — the Twin depends on it and
does not re-implement it.

## 4. Sub-agents the Twin orchestrates (v1)

| Sub-agent          | Job                                                                                   | Tools / scope                                                      |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Inbox agent        | Triage Gmail, draft replies in Ethan's voice                                          | Gmail read + draft; never sends without approval                   |
| Calendar agent     | Scheduling, conflict checks, prep                                                     | Calendar read + holds; respects Tue/Thu 1:30–4:30pm teaching block |
| GitHub agent       | Watch wazootech repos, PR/issue status, blog-ideas results                            | gh CLI read; writes only with per-action approval                  |
| Job-pipeline agent | Track RTX / GT / LM Studio / Benchmark / eClerx / Intuit: next action + deadline each | Trackers + Gmail + Calendar                                        |
| Research agent     | Person/company prep before calls (public sources first)                               | Web search, GitHub, X — same standard as today                     |
| Briefing agent     | Morning brief + evening summary                                                       | Reads the World, writes summaries, no external actions             |

The Twin (orchestrator) owns: intent → plan → dispatch → merge → verify →
act-or-ask. Sub-agents never talk to Ethan directly and never invent context; if
the World doesn't have it, the Twin asks Ethan or the research agent finds it
from a public source.

## 5. V1 capabilities (concrete)

1. **Morning briefing** — today's calendar, deadlines in the next 7 days,
   unanswered outreach, outstanding items (e.g. NBIS eApp, Vogel docs).
2. **Inbox triage + draft replies** — in Ethan's plain voice, send only with
   approval.
3. **Scheduling** — propose times that respect the teaching block and existing
   commitments; never propose Tue/Thu 1:30–4:30pm PT.
4. **GitHub watch** — new activity on wazootech repos, blog-ideas cron results,
   PR status, all with links.
5. **Job-pipeline tracking** — one next action + deadline per opportunity.
6. **Research briefs** — person/company prep before calls.
7. **Evening summary** — what moved today, what is still open, updated trackers.

## 6. Guardrails

- **Provenance or it didn't happen.** Every Twin claim cites its source in the
  World. No invented facts, no guessed dates, no reconstructed IDs.
- **Permission tiers.** Read-only → draft-only → approved actions → autonomous
  routine actions (Phase 3 only, after eval). The Twin never jumps a tier on its
  own.
- **No autonomous sends.** No email sent, no issue filed, no post published, no
  application submitted without Ethan's approval — the same approval patterns he
  already uses (per-action GitHub approval, morning blog-ideas gate).
- **No money movement.** No purchases, no payments, no financial actions.
- **Audit log.** Everything the Twin does is logged and queryable in the World —
  what it read, what it proposed, what it did, who approved it.
- **Memory safety.** Ingestion validated; poisoned or retracted claims are
  handled, not absorbed. (See the "Memory Is the Moat" safeguards:
  source/ownership/trust metadata, least privilege, independent checking of
  proposed actions.)

## 7. Architecture (sketch)

- **Worlds** (worlds-sdk-ts / worlds-api) is the shared context layer: SPARQL +
  keyword search over quads, provenance, access control.
- **Orchestrator loop:** intent → plan → dispatch to sub-agents → merge → verify
  against the World → act or ask.
- **Sub-agents** are scoped tools with least privilege, not general-purpose
  chatbots.
- **Eval:** a wazoobench-style harness for the Twin — briefing accuracy, draft
  approval rate, zero provenance failures. No capability ships without an eval.

## 8. Phases

- **Phase 0 — Seed the World.** Import memory, trackers, goals, calendar, GitHub
  state. Success: the Twin can answer "what's open?" correctly, with sources.
- **Phase 1 — Read-only Twin.** Briefings, research, drafts. No writes. Success:
  one week of accurate morning briefs.
- **Phase 2 — Supervised writes.** Drafts filed/sent with approval, calendar
  holds, GitHub comments. Success: zero unapproved external actions; high
  approval-without-edits rate.
- **Phase 3 — Autonomous routine.** Recurring low-risk actions only (tracker
  updates, scan summaries), with a full audit log.

## 9. Success metrics (v1)

- Morning brief accuracy (facts right, sources cited, nothing missed that
  mattered).
- Time saved per day on coordination (Ethan's judgment, not a stopwatch).
- Draft approval rate without edits.
- Zero provenance failures; zero unapproved external actions.

## 10. Out of scope for v1

- PCB company integration (needs more prep; separate track).
- Multi-user Twins / Twins for customers.
- Voice or phone Twin.
- Autonomous job applications, public posting, financial actions.
- A standalone Twin product launch — v1 is a dogfood build, not a launch.

## 11. Open questions

1. Where does it run — Ethan's machine/VM, or hosted?
2. Which sub-agent first — briefing, or inbox?
3. What is the eval test set — which briefs/drafts count as "correct"?
4. How much history seeds the World — full Gmail/GitHub history, or a bounded
   window?

## 12. Naming

- **Wazoo Twins** is the working name (liked, not final).
- **Doppel** (short for doppelgänger) was considered Nov 6, 2026 and **rejected
  — saturated**:
  - Doppel Inc. (doppel.com) is an established AI company: Social Engineering
    Defense — it detects impersonations and deepfakes of people. It acquired
    YC-backed PropRise on Nov 4, 2026. A clone product called Doppel would sit
    directly opposite a company whose whole business is stopping fake clones,
    and doppel.com is taken.
  - trydoppel.com is already a digital-cloning platform literally described as
    "Doppel (short for Doppelgänger)" — a digital version of yourself.
  - Doppelgangers AI (Google Play) already sells "your own Digital Twin."
  - Multiple hackathon projects and DoppelWriter/DoppelMe use the name.
- **Twin saturation check (Nov 6, 2026):** "Twin" is, if anything, _more_
  saturated than "Doppel" by count, but less dangerous. The word is generic, so
  it can't be owned the way "Doppel" can, and "Wazoo Twins" as a full name is
  still distinctive:
  - Twin (twin.so) is a funded AI-agent platform for recurring business work —
    $10M seed led by LocalGlobe, 85,000 users — doing nearly what a Wazoo Twin
    does (agents that do your work).
  - Twin (twinlabs.co) is "your AI employee," 100k users, 3M agents built.
  - "Twins by Synthemo" is a digital twin that talks like you; the "AI twin"
    category is crowded (Delphi, Personify, HeyGen, Tavus, MyClone, CoachVox,
    BuddyPro).
  - "Digital twin" generically means industrial software (factories, buildings),
    which swamps search for the term.
  - Verdict: between the two, Twins is still the better pick. Doppel's collision
    is one well-funded company in the _opposite_ business (anti-clone) holding
    the exact name and .com; Twin's collisions are many, but generic-word
    competitors, not an adversarial one.
