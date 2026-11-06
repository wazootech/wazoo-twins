/**
 * Synthetic in-memory World for eval (test-only stand-in).
 *
 * Implements the WorldClient interface over a Map, so the harness, scorer,
 * and verifiers can run with no network, no API keys, and no real seeded
 * World. The seed facts below are hand-written from ~/MEMORY.md and the
 * opportunity tracker — every fact's provenance names its source section.
 *
 * This is NOT the real World. Baseline numbers produced against it measure
 * the harness, not the Twin. The real baseline lives in
 * eval-data/baseline.json (world: real); the first synthetic baseline is
 * preserved at eval-data/baseline-synthetic.json — see eval-data/README.md.
 */
import type { Fact, Iri } from "../world/types.ts";
import { validateFact } from "../world/schema.ts";
import type { SparqlRow, WorldClient } from "../world/client.ts";

export const SYNTHETIC_RETRIEVED_AT = "2026-11-06T10:00:00-07:00";

function fact(
  id: Iri,
  type: string,
  label: string,
  properties: Record<string, string>,
  source: string,
): Fact {
  return {
    id,
    type,
    label,
    properties,
    provenance: { source, retrievedAt: SYNTHETIC_RETRIEVED_AT },
  };
}

/** Hand-written facts, grounded in ~/MEMORY.md (Facts / Commitments) and the opportunity tracker. */
export const SYNTHETIC_FACTS: Fact[] = [
  fact("twin:commitment/rtx-offer", "Commitment", "RTX Effectors offer", {
    description:
      "Software Engineer I (Onsite), req 01866752, Raytheon/Effectors, Tucson AZ (1151 E Hermans Rd, BLDG 805); tentative start Jan 18, 2027; active/existing security clearance needed BEFORE start; comp final Oct 15, highest permitted for campus hire",
    status: "decided (Effectors); letter review/signature pending",
    due: "2027-01-18",
    nextAction:
      "Review and sign the Workday letter (download/save it BEFORE e-signing); ask Sarah Kate Hostetter the clearance timing question",
  }, "MEMORY.md — Commitments / RTX offer"),
  fact("twin:commitment/nbis-eapp", "Commitment", "NBIS eApp (SF-86)", {
    description:
      "SF-86 clearance application; case HRC12777765, A00001315986; complete sections 1-10, download archival copy, certify/sign/release; CPC contact Shelby Frazier, GSS-CPC@RTX.com; due ~Nov 8, 2026 (four days after the Nov 4 reminder)",
    status: "outstanding",
    due: "2026-11-08",
    nextAction: "Complete sections 1-10 and certify/sign/release",
  }, "MEMORY.md — Commitments / RTX onboarding: NBIS eApp"),
  fact(
    "twin:commitment/vogel-docs",
    "Commitment",
    "RTX VOC citizenship verification (Patrick Vogel)",
    {
      description:
        "Secure email 'Raytheon - VoC [RTXSecure]' arrived Mon Oct 19; sign in with the one-time passcode and reply with a driver's license/state ID plus one of birth certificate, US passport/passport card (with city of birth), or naturalization/birth-abroad certificate; never attach document images to replies on regular email",
      status: "outstanding",
    },
    "MEMORY.md — Commitments / RTX onboarding: empowerU / Vogel",
  ),
  fact("twin:commitment/drug-screen", "Commitment", "RTX drug screen retest", {
    description:
      "First Advantage retest registration issued Nov 2, 2026 after Oct 30 Labcorp spill recorded as refusal; test due EOB Thu Nov 5, 2026 at Quest Diagnostics Anaheim Ball; extension contact Wanda Charles; Quest appointment Thu Nov 5, 9:10am reported by Ethan (no booking confirmation seen in Gmail)",
    status: "appointment reported Nov 5, 9:10am; outcome unknown",
    due: "2026-11-05",
  }, "MEMORY.md — Commitments / RTX onboarding: First Advantage drug screen"),
  fact("twin:deadline/yc-decision", "Deadline", "YC W27 decision", {
    description:
      "YC Winter 2027 application SUBMITTED Nov 2, 2026; decisions Dec 11, 2026; solo-founded; $0 revenue; batch Jan-Mar 2027, San Francisco",
    due: "2026-12-11",
  }, "MEMORY.md — Commitments / YC W27"),
  fact(
    "twin:deadline/mozilla",
    "Deadline",
    "Mozilla Human-Scale AI Incubator proposal",
    {
      description:
        "Deadline Fri Nov 20, 2026, 11:59pm PT. Proposal draft, NOT submitted; $300,000 for 12 months from April 2027, up to $500,000 over 3 years; blockers: (1) applicant type, (2) name ONE pilot community with permission plus verified user/partner counts",
      due: "2026-11-20T23:59:00-08:00",
    },
    "MEMORY.md — Commitments / Mozilla Human-Scale AI Incubator",
  ),
  fact("twin:deadline/techstars", "Deadline", "Techstars Spring 2027", {
    description:
      "Deadline Wed Nov 18, 2026. Accelerator backup; $220,000; program Mar 8-Jun 3, 2027; do not let it displace Mozilla (due Nov 20)",
    due: "2026-11-18",
  }, "opportunity-tracker.md — Active opportunities / Techstars Spring 2027"),
  fact(
    "twin:deadline/kiroween-credits",
    "Deadline",
    "Kiroween 2026 credits request",
    {
      description:
        "Request 4,000 free Kiro credits on the Devpost Resources tab by Tue Dec 1, 2026, 12:00pm PT (needs Kiro user ID or AWS account ID); registration is NOT credits confirmation; redeemed credits expire Dec 31, 2026, 11:59pm PT",
      due: "2026-12-01T12:00:00-08:00",
    },
    "MEMORY.md — Facts / Kiroween 2026",
  ),
  fact(
    "twin:deadline/kiroween-submissions",
    "Deadline",
    "Kiroween 2026 submissions",
    {
      description: "Kiroween 2026 submissions due Fri Dec 4, 2026, 2:00pm PT",
      due: "2026-12-04T14:00:00-08:00",
    },
    "MEMORY.md — Facts / Kiroween 2026",
  ),
  fact("twin:person/ernest-mccarter", "Person", "Ernest McCarter", {
    name: "Ernest McCarter",
    role: "VP of Engineering, General Translation",
    org: "General Translation",
    contact:
      "GitHub eoinest (gt-react/gt-next author); X @mccarterernest (lead, not yet verified on x.com)",
    description:
      "Conversation Fri Nov 6, 2026, 11:00-11:30am PT, Cal Video; originally reached out Oct 23 about sparql-engine relevance to GT compilers for treeshaking unused translation content",
  }, "MEMORY.md — Commitments / General Translation"),
  fact("twin:person/peter-van-voorhis", "Person", "Peter Van Voorhis", {
    name: "Peter Van Voorhis",
    role: "General Translation contact",
    description:
      "Nov 2 intro call went well; fully in person in San Francisco, relocation covered; next steps: Ernest conversation, then 2-3 team conversations, technical interview, one-week paid onsite in SF; comp ranges only: Ethan mentioned thinking $110k, Peter said minimum $180,000/year plus equity",
  }, "MEMORY.md — Commitments / General Translation"),
  fact("twin:person/albert-davidson", "Person", "Albert Davidson", {
    name: "Albert Davidson",
    relationship: "father",
    description:
      "Helped Ethan make the Journeyman banner; balancing the Wazoo banner sent Nov 6, 2026 (Gmail id 1a1b1c6e737f9bc1)",
  }, "MEMORY.md — Facts / Journeyman banner"),
  fact("twin:person/travis-long", "Person", "Travis Long", {
    name: "Travis Long",
    role: "Founder, Autonomous Search",
    org: "Benchmark Motion",
    contact: "travis@autonomoussearch.io",
    description:
      "Founding Engineer, Irvine, onsite 6 days/week, work directly with founder Daniel + small team; company bootstrapped to ~$60M ARR via golf business, top-benchmarked real-time human pose model, now pursuing physical AI; Calendly intro booked Mon Nov 9, 2026, 8:30-8:45am PT, 15-min phone call",
  }, "MEMORY.md — Commitments / Benchmark Motion"),
  fact("twin:person/sarah-kate-hostetter", "Person", "Sarah Kate Hostetter", {
    name: "Sarah Kate Hostetter",
    role: "RTX recruiter",
    description:
      "Effectors offer req 01866752; comp final Oct 15, highest permitted for campus hire; decision-deadline extension through weekend requested Oct 16, still pending",
  }, "MEMORY.md — Commitments / RTX offer"),
  fact("twin:person/purav-patel", "Person", "Purav Patel", {
    name: "Purav Patel",
    role: "Builder of Clayzo",
    org: "Clayzo",
    contact: "purav@clayzo.com",
    description:
      "Intro via Boardy Nov 4, 2026; building Clayzo: animation/motion-graphics creation with coding agents, own engine and file format positioned as a better Lottie; meetup confirmed Wed Nov 11, 6:00-7:00pm PT at Airoma Cafe, 8315 Garden Grove Blvd, Garden Grove",
  }, "MEMORY.md — Commitments / Purav Patel"),
  fact("twin:event/teaching-block", "Event", "codeCampus teaching block", {
    start: "Tue/Thu 1:30pm PT",
    end: "Tue/Thu 4:30pm PT",
    kind: "teaching",
    attendees: "Ethan Davidson",
    description:
      "Tuesdays and Thursdays 1:30-4:30pm PT hard block: driving to and from codeCampus Villa in Santa Ana plus teaching 2:15-4pm PT; no calls during that window",
  }, "MEMORY.md — Commitments / Tue/Thu work block"),
  fact("twin:decision/twins-name", "Decision", "Wazoo Twins name decision", {
    description:
      "'Doppel' REJECTED as saturated: Doppel Inc. (doppel.com) is an established AI impersonation-defense company (acquired YC-backed PropRise Nov 4, 2026), trydoppel.com is already a digital-cloning platform literally called 'Doppel (short for Doppelgänger)', Doppelgangers AI already sells a 'Digital Twin' app; 'Wazoo Twins' stays distinctive; first Twin is Ethan's personal twin, dogfood build",
    decidedAt: "2026-11-06",
  }, "MEMORY.md — Facts / Wazoo Twins"),
  fact(
    "twin:opportunity/lm-studio",
    "Opportunity",
    "LM Studio — Full Stack Software Engineer",
    {
      name: "LM Studio — Full Stack Software Engineer",
      stage: "résumé tailored Nov 6; no application sent yet",
      description:
        "NYC; $150K-$350K + equity; apply route is email only: Apply now opens a dialog to email apply@lmstudio.ai with résumé + a note on why fit, discussing technical expertise in depth; 'Do not use AI to apply for this job — write all application materials yourself'; US-based applicants only",
      nextAction:
        "Email apply@lmstudio.ai with résumé and fit note written by Ethan himself",
    },
    "MEMORY.md — Commitments / LM Studio",
  ),
  fact(
    "twin:opportunity/general-translation",
    "Opportunity",
    "General Translation",
    {
      name: "General Translation",
      stage: "Ernest McCarter conversation Fri Nov 6, 11:00-11:30am PT",
      description:
        "Fully in person in San Francisco, relocation covered, Ethan open to moving there; next: 2-3 team conversations, technical interview, one-week paid onsite in SF",
      nextAction: "Ernest call Fri Nov 6, 11:00am PT",
    },
    "MEMORY.md — Commitments / General Translation",
  ),
  fact(
    "twin:opportunity/eclerx",
    "Opportunity",
    "eClerx — financial-markets AI-product role",
    {
      name: "eClerx — financial-markets AI-product role",
      stage:
        "Round 1 held Tue Nov 3, 11:00am-12:00pm PT with Anish Kothuri; went ok; outcome pending",
      description:
        "Financial-markets vertical, financial-crime compliance, new AI-product team, NYC; Ethan stated ~1 month to relocate and $120K NY-adjusted expectation (stated figure, not an offer); 4 rounds, Round 1 LeetCode + case study; connection via college friend Mario Pinzon",
      nextAction: "Await Round 1 outcome",
    },
    "MEMORY.md — Commitments / eClerx interview",
  ),
  fact(
    "twin:commitment/discord-ccpa",
    "Commitment",
    "Discord CCPA data request",
    {
      description:
        "CCPA Request to Know / Access (section 1798.110) sent Fri Nov 6, 2:53am PT to privacy@discord.com, asking for a copy, not deletion; confirmation due Fri Nov 20, 2026; full response due Mon Dec 21, 2026; Ethan is not looking to sue, just wants his data back",
      status: "sent; awaiting confirmation",
      due: "2026-11-20",
    },
    "MEMORY.md — Facts / Discord account",
  ),
  fact("twin:decision/effectors-over-hwil", "Decision", "Effectors over HWIL", {
    description:
      "Told recruiter Sarah Kate Hostetter he'd take Effectors over HWIL and asked her to withdraw the HWIL offer (req 01874565)",
    decidedAt: "2026-10-12",
  }, "MEMORY.md — Commitments / RTX offer"),
  fact(
    "twin:deadline/mozilla-fellowship",
    "Deadline",
    "Mozilla Fellowship 2027-2028 LOI",
    {
      description:
        "Deadline Thu Dec 17, 2026, 11:59pm PT. 10 fellowships, up to $125,000 for Independent Fellows ($100,000 stipend + $25,000 project budget) for 12 months from Jun 1, 2027; Letter of Intent is the main review stage; shortlisted applicants invited to full application due Mar 12, 2027",
      due: "2026-12-17T23:59:00-08:00",
    },
    "opportunity-tracker.md — Active opportunities / Mozilla Fellowship",
  ),
  fact("twin:deadline/kgc", "Deadline", "KGC 2027 Call for Presentations", {
    description:
      "Submissions close Fri Jan 15, 2027. Knowledge Graph Conference, May 3-7, 2027, Jay Conference Bryant Park, New York City; presentation talks 25 minutes including Q&A; proposals evaluated weekly on a rolling basis; final notification one week after the deadline; pitch angle: verifiable agent memory with measured results, not a Wazoo sales talk",
    due: "2027-01-15",
  }, "opportunity-tracker.md — Active opportunities / KGC 2027"),
  fact("twin:person/john-carlo-manuel", "Person", "John Carlo Manuel", {
    name: "John Carlo Manuel",
    role: "Wazoo collaborator, DevRel",
    description:
      "Twice-weekly sync Wednesdays 9:30am and Sundays 6pm PT; building engineering blog at blog.wazoo.dev (Astro, Cloudflare Workers); fundamentals pillar: knowledge graphs, vector DBs, NLP concepts",
  }, "MEMORY.md — Commitments / John Carlo Manuel"),
  fact("twin:event/ernest-call", "Event", "Ernest McCarter call", {
    start: "2026-11-06T11:00:00-08:00",
    end: "2026-11-06T11:30:00-08:00",
    kind: "call",
    attendees: "Ernest McCarter, Ethan Davidson",
    description:
      "Fri Nov 6, 2026, 11:00-11:30am PT, Cal Video; note: 'Creator of sparql-engine at Wazoo, interested in joining General Translation'",
  }, "MEMORY.md — Commitments / General Translation"),
  fact("twin:event/benchmark-call", "Event", "Benchmark Motion intro call", {
    start: "2026-11-09T08:30:00-08:00",
    end: "2026-11-09T08:45:00-08:00",
    kind: "phone call",
    attendees: "Travis Long, Ethan Davidson",
    description:
      "Mon Nov 9, 2026, 8:30-8:45am PT, 15-min phone call; phone (714) 747-4331; LinkedIn linkedin.com/in/etok",
  }, "MEMORY.md — Commitments / Benchmark Motion"),
  fact("twin:task/weight-journey", "Task", "Weight gain journey", {
    description:
      "Starting weight 118 lb, Fri Nov 6, 2026 morning; regain weight safely: nutrient-dense higher-calorie foods, smaller frequent meals in a caloric surplus; target and timeline not shared yet; log weigh-ins in chat; first food log Nov 6 breakfast: 2 eggs + 1/2 sausage",
    status: "started Nov 6, 2026",
    owner: "Ethan Davidson",
  }, "MEMORY.md — Facts / Weight gain journey"),
  fact(
    "twin:thread/openhack-ananay",
    "Thread",
    "OpenHack demo thread (Ananay)",
    {
      channel: "Gmail",
      participants: "Ananay (ananay@openhack.com), Ethan Davidson",
      lastMessage: "Demo canceled Nov 6, 1:07am PT",
      needsReply: "true",
      description:
        "Ethan evaluating OpenHack on wazootech/wazoo-api; full repo scans returned 403 ('not included in the Free plan'); demo booked Nov 4 for Fri Nov 6, 2:00-2:30pm PT canceled by OpenHack Nov 6, 1:07am PT; demo + Mythos scanning are for enterprise paid plans only; no reschedule; draft reply directed Nov 6 apologizing if the free-plan/Mythos request was off base and asking about a paid-tier trial",
    },
    "MEMORY.md — Facts / OpenHack evaluation",
  ),
  fact("twin:person/manmeet-kaur-phagurah", "Person", "Manmeet Kaur Phagurah", {
    name: "Manmeet Kaur Phagurah",
    role: "Caltrans contact",
    contact: "LinkedIn manmeet-kaur-phagurah-965b8818a",
    description:
      "Friend who works at Caltrans; Ethan asked Nov 5, 2026 about open Caltrans roles fitting a B.S. in computer science; LinkedIn outreach draft awaits approval; listed as Technical Project Engineer, not software engineer",
  }, "MEMORY.md — People / Manmeet Kaur Phagurah"),
];

/** Minimal in-memory WorldClient: keyword search + findFacts, no SPARQL. */
export class SyntheticWorldClient implements WorldClient {
  private facts = new Map<Iri, Fact>();
  /** old fact id -> replacement fact id (supersession is recorded, never silent). */
  private superseded = new Map<Iri, Iri>();

  addFacts(facts: Fact[]): Promise<void> {
    for (const f of facts) {
      const errors = validateFact(f);
      if (errors.length > 0) {
        throw new Error(`invalid fact ${f.id}: ${errors.join("; ")}`);
      }
      this.facts.set(f.id, f);
    }
    return Promise.resolve();
  }

  query(_sparql: string): Promise<SparqlRow[]> {
    return Promise.reject(
      new Error(
        "synthetic world does not support SPARQL; use search/findFacts",
      ),
    );
  }

  update(_sparql: string): Promise<void> {
    return Promise.reject(
      new Error(
        "synthetic world does not support SPARQL UPDATE; use supersede()",
      ),
    );
  }

  search(keywords: string, limit = 10): Promise<Fact[]> {
    const tokens = keywords.toLowerCase().split(/[^a-z0-9@.]+/).filter(Boolean);
    const haystack = (f: Fact) =>
      [f.id, f.label, f.type, ...Object.values(f.properties)].join(" ")
        .toLowerCase();
    const scored = [...this.facts.values()]
      .map((f) => ({
        f,
        score: tokens.filter((t) => haystack(f).includes(t)).length,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return Promise.resolve(scored.slice(0, limit).map((s) => s.f));
  }

  getFact(id: Iri): Promise<Fact | undefined> {
    return Promise.resolve(this.facts.get(id));
  }

  findFacts(
    filter: { type?: string; property?: string; value?: string },
  ): Promise<Fact[]> {
    return Promise.resolve([...this.facts.values()].filter((f) => {
      if (filter.type && f.type !== filter.type) return false;
      if (filter.property) {
        const value = f.properties[filter.property];
        if (value === undefined) return false;
        if (
          filter.value &&
          !value.toLowerCase().includes(filter.value.toLowerCase())
        ) return false;
      }
      return true;
    }));
  }

  async supersede(oldId: Iri, replacement: Fact): Promise<void> {
    const old = this.facts.get(oldId);
    if (!old) throw new Error(`cannot supersede missing fact ${oldId}`);
    await this.addFacts([replacement]);
    this.superseded.set(oldId, replacement.id);
  }

  /** IRI of the fact that superseded `id`, if any. */
  supersededBy(id: Iri): Iri | undefined {
    return this.superseded.get(id);
  }

  count(): Promise<number> {
    return Promise.resolve(this.facts.size);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

/** Build a synthetic world pre-seeded with SYNTHETIC_FACTS. */
export async function seedSyntheticWorld(): Promise<WorldClient> {
  const world = new SyntheticWorldClient();
  await world.addFacts(SYNTHETIC_FACTS);
  return world;
}
