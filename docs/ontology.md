# Ontology — Ethan's World

**Owner:** Ethan Davidson. The Twin proposes changes; Ethan approves them.
Namespace: `https://wazoo.dev/twins#`

## Classes

| Class        | Required properties                           | Meaning                                                     |
| ------------ | --------------------------------------------- | ----------------------------------------------------------- |
| Person       | name                                          | Someone Ethan deals with (role, org, contact, relationship) |
| Organization | name                                          | A company/org (type)                                        |
| Commitment   | description, status                           | Something owed or promised (due, owner, nextAction)         |
| Deadline     | description, due                              | A dated cutoff (consequence)                                |
| Task         | description, status                           | A unit of work (owner, nextAction)                          |
| Thread       | channel, participants                         | A conversation needing tracking (lastMessage, needsReply)   |
| Decision     | description, decidedAt                        | A decision Ethan made (rationale)                           |
| Event        | start, kind                                   | A calendar item (end, attendees)                            |
| Opportunity  | name, stage                                   | A job/opportunity (nextAction, due)                         |
| Run          | agent, task, started, outcome                 | Audit: one Twin run                                         |
| Action       | actor, actionType, target, at                 | Audit: one Twin action                                      |
| Approval     | description, approvedBy, approvalDecision, at | Audit: one approval outcome                                 |

## Rules

- Every fact carries `source` + `retrievedAt` (Twin-level provenance — Worlds
  has no native provenance column yet, worlds-sdk-ts#221).
- Corrections supersede; nothing is silently overwritten. A superseded fact
  keeps its `supersededBy` link.
- Retrieval is explicit SPARQL first, keyword FTS second. Hosted search is
  keyword-only (worlds-api#1); vector search is a local-only enhancement.
- Seed validation (SHACL-style): a fact missing a required property is
  quarantined, never half-landed.
