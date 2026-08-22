# TURTLE SOUP Case Schema v0.1

> This document defines the canonical data contract for one playable case. It is a design contract, not an implementation-specific TypeScript interface.
>
> The canonical case is the source of truth. UI copy, localization, scripted host lines, and optional model output are projections.

## 1. Design rules

1. A case MUST have one canonical truth graph.
2. Every player-facing answer MUST resolve to a query result over that graph.
3. A true fact MAY be hidden, but a hidden fact MUST NOT become false because it is hidden.
4. A clue MUST have a source fact, source event, or explicit `irrelevant` rule.
5. The final judgement MUST use IDs and predicates, never text similarity alone.
6. A successful case MUST have a non-empty minimum proof set.
7. Every authored alternative theory MUST either be rejected by a named contradiction or remain explicitly accepted as an alternate ending.
8. Presentation text MAY vary by language or host style; predicate IDs, answer codes, and proof obligations MUST NOT vary.
9. The case bundle MUST be versioned and hashable.
10. A malformed optional AI response MUST fall back to the deterministic answer projection.

## 2. Top-level contract

The top-level object MUST contain these fields:

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `schemaVersion` | string | yes | Contract version, currently `0.1`. |
| `id` | string | yes | Stable case ID; lowercase kebab-case. |
| `metadata` | object | yes | Authoring, difficulty, safety, and duration metadata. |
| `surface` | object | yes | Spoiler-safe opening situation. |
| `entities` | array | yes | People, places, objects, records, and mechanisms. |
| `events` | array | yes | Canonical occurrences in a partial order. |
| `relations` | array | yes | Typed links between entities and events. |
| `facts` | array | yes | Atomic propositions derived from events or relations. |
| `visibilityRules` | array | yes | Conditions for exposing facts. |
| `questionSemantics` | array | yes | Normalized query definitions and example phrasings. |
| `answerPolicy` | object | yes | Stable answer codes and projection rules. |
| `evidenceItems` | array | yes | Player-facing evidence cards. |
| `hypotheses` | array | yes | Canonical solution and authored alternatives. |
| `contradictions` | array | yes | Rules that invalidate or weaken hypotheses. |
| `solutionCertificate` | object | yes | Proof obligations and uniqueness proof. |
| `replayModifiers` | array | yes | Authored replay variants. |
| `proofReplay` | array | yes | Spoiler-safe post-solve reconstruction beats. |
| `localization` | object | yes | Language-specific surface and answer copy. |

Unknown top-level fields SHOULD be rejected in a frozen release bundle. The authoring tool MAY preserve them in a draft namespace.

## 3. Metadata contract

```json
{
  "id": "c01-cold-room-knock",
  "titleKey": "case.c01.title",
  "difficulty": "intro|standard|hard",
  "ageRating": "16+",
  "contentTags": ["suspense", "non-graphic-danger"],
  "targetMinutes": { "min": 5, "max": 20 },
  "author": "string",
  "contentVersion": 1,
  "canonicalHash": "sha256:...",
  "status": "draft|playtest|frozen"
}
```

The hash is computed over a canonical serialization that excludes the hash field itself.

## 4. Entity contract

```json
{
  "id": "person-lin-che",
  "kind": "person",
  "labelKey": "entity.lin_che.label",
  "traits": ["researcher", "authorized-access"],
  "aliases": ["林澈", "Lin"],
  "publicAtStart": true
}
```

Allowed `kind` values in v0.1:

- `person`
- `location`
- `object`
- `record`
- `mechanism`
- `abstract_state`

Entity IDs MUST be unique within a case. Names and aliases are presentation data and MUST NOT be used as judgement keys.

## 5. Event contract

```json
{
  "id": "event-lin-places-phone",
  "order": 10,
  "time": { "kind": "instant", "value": "01:00" },
  "participants": ["person-lin-che", "object-phone"],
  "locationId": "location-cold-room",
  "action": "places-device",
  "preconditionFactIds": [],
  "effectFactIds": ["fact-phone-inside"],
  "sourceType": "canonical-event",
  "solutionRole": "required|supporting|red-herring|background"
}
```

`order` is a stable partial-order anchor, not necessarily a displayed timestamp. If two events have no explicit relation, the player must not be forced to infer an order that the case does not define.

## 6. Relation contract

```json
{
  "id": "relation-phone-belongs-to-lin",
  "type": "owned_by",
  "fromId": "object-phone",
  "toId": "person-lin-che",
  "eventId": "event-lin-places-phone",
  "factId": "fact-phone-paired-to-lin"
}
```

Allowed v0.1 relation types:

- `caused_by`
- `located_at`
- `owned_by`
- `possessed`
- `witnessed`
- `heard`
- `transferred`
- `concealed`
- `intended_to_delay`
- `physically_prevents`
- `contradicts`

## 7. Fact contract

```json
{
  "id": "fact-phone-inside",
  "predicate": "located_at",
  "args": {
    "subjectId": "object-phone",
    "locationId": "location-cold-room",
    "time": "01:00-02:00"
  },
  "truth": true,
  "sourceEventIds": ["event-lin-places-phone"],
  "visibilityRuleIds": ["rule-phone-mechanism"],
  "evidenceItemIds": ["evidence-phone-in-room"],
  "importance": "required|supporting|irrelevant",
  "localizationKey": "fact.phone.inside"
}
```

Facts MUST be atomic enough that a question can target one proposition or a documented conjunction. If a fact contains multiple independent claims, split it.

An authored premise that is not produced by a case event MUST set `sourceType: "authored-premise"` and explain its role in authoring notes. It cannot be silently source-less.

## 8. Visibility rule contract

```json
{
  "id": "rule-phone-mechanism",
  "mode": "question|evidence|scene|chapter",
  "requires": {
    "discoveredEvidenceIds": ["evidence-metal-tray-mark"],
    "visitedLocationIds": [],
    "answeredQueryIds": []
  },
  "revealsFactIds": ["fact-phone-inside", "fact-phone-paired-to-lin"],
  "spoilerLevel": "safe|sensitive|final"
}
```

Visibility evaluation is monotonic in v0.1: discovering an item may reveal more facts, but cannot make already discovered facts disappear or change truth value.

## 9. Question semantics contract

A normalized query has a stable ID, predicate, slots, and examples:

```json
{
  "id": "query-knock-source",
  "intent": "verify",
  "predicate": "knock_source",
  "slots": {
    "locationId": "location-cold-room",
    "time": "02:00"
  },
  "examplePhrases": [
    "敲门声是人敲的吗？",
    "里面真的有人吗？"
  ],
  "matchRules": [
    { "all": ["敲", "人"], "none": ["电影"], "priority": 3 }
  ],
  "truthFactIds": ["fact-no-person-inside", "fact-vibration-caused-knock"],
  "falseFactIds": ["fact-person-knocked"],
  "unlockedEvidenceIds": ["evidence-knock-recording"]
}
```

The parser may return:

- a direct query ID;
- a query ID plus extracted slots;
- `unrecognized` with no game-state mutation.

An unrecognized question MUST NOT trigger an answer generated from model intuition.

### 9.1 Deterministic natural-language normalization

Free text is normalized only as an input convenience. It is never allowed to create a new predicate.

The v0.1 normalizer uses:

1. Unicode NFKC normalization;
2. case, whitespace, punctuation, and symbol removal;
3. exact comparison against authored `examplePhrases`;
4. authored `matchRules` containing `all`, `any`, `none`, and optional `priority` terms;
5. failure-closed ambiguity handling.

If two queries have the same highest match score, the result is `ambiguous` and the public answer code is `unrecognized`. The engine MUST NOT ask an LLM to choose between them. The UI MAY show the candidate interpretations and let the player select one explicitly.

Match terms are only routing metadata. A term match cannot reveal evidence, satisfy a proof obligation, or produce victory by itself.

## 10. Answer policy contract

The answer code set is fixed:

```text
yes | no | partial | invalid_premise | unknown | irrelevant | unanswerable | unrecognized
```

Projection order:

1. If the normalized query is invalid, return `unrecognized` or `invalid_premise`.
2. If its relevant facts are not visible, return `unknown`.
3. If the query is explicitly marked irrelevant, return `irrelevant`.
4. If all required truth predicates hold, return `yes`.
5. If all required truth predicates fail, return `no`.
6. If a documented subset holds, return `partial`.
7. If the case does not define the requested property, return `unanswerable`.

The host text is selected after the code is determined.

## 11. Evidence item contract

```json
{
  "id": "evidence-knock-recording",
  "kind": "audio|testimony|object|record|timeline|scene",
  "titleKey": "evidence.knock_recording.title",
  "observationKey": "evidence.knock_recording.observation",
  "sourceFactIds": ["fact-three-knock-recording"],
  "sourceEventIds": ["event-phone-vibrates"],
  "relatedEntityIds": ["object-phone", "object-metal-tray"],
  "defaultState": "hidden|available|discovered",
  "supports": ["hypothesis-canonical"],
  "conflicts": ["hypothesis-guard-faked"],
  "spoilerLevel": "safe|sensitive|final"
}
```

An evidence card MUST distinguish observation from inference. The UI may show “金属托盘有三处连续震痕” while the inference “手机闹钟造成敲击” remains a player hypothesis until separately verified.

## 12. Hypothesis contract

```json
{
  "id": "hypothesis-canonical",
  "kind": "canonical|alternative",
  "claim": {
    "eventIds": ["event-lin-places-phone", "event-lin-exits", "event-phone-vibrates"],
    "orderedRelationIds": ["relation-phone-causes-knock"],
    "motiveKey": "motive-delay-inspection"
  },
  "requiredEvidenceIds": ["evidence-cctv-exit", "evidence-phone-in-room"],
  "requiredContradictionResolutionIds": ["contradiction-no-person-inside"],
  "status": "candidate|solved|rejected"
}
```

Alternative hypotheses are authored so the validator can verify that they fail for a named reason. They are not generated at runtime in MVP.

An alternative MAY use `assertedPropositions` for a claim that is intentionally not part of the canonical event graph. Such a proposition must be rejected by a named contradiction or explicit missing-proof obligation.

## 13. Contradiction contract

```json
{
  "id": "contradiction-no-person-inside",
  "kind": "spatial|temporal|physical|testimonial|causal",
  "descriptionKey": "contradiction.no_person_inside",
  "requiresFactIds": ["fact-lin-left-before-knock", "fact-no-entry-after-lock"],
  "invalidatesHypothesisIds": ["hypothesis-fang-entered"],
  "severity": "soft|hard",
  "resolutionEvidenceIds": ["evidence-cctv-exit", "evidence-door-latch"]
}
```

A `hard` contradiction prevents a theory from reaching `solved`. A `soft` contradiction lowers confidence and requests further evidence.

## 14. Solution certificate

```json
{
  "canonicalHypothesisId": "hypothesis-canonical",
  "requiredFactIds": [],
  "requiredEvidenceIds": [],
  "requiredEventOrder": [],
  "requiredContradictionResolutionIds": [],
  "alternativeHypothesisIds": [],
  "minimumProofSetId": "proof-c01-minimum",
  "acceptedMotiveKeys": [],
  "uniquenessClaim": "string",
  "successReplayBeatIds": []
}
```

The certificate MUST prove all of the following:

- the proposed chain is causally complete;
- every required event has a source;
- the event order is valid;
- the minimum proof set is discovered;
- authored alternatives are rejected;
- no second canonical hypothesis remains consistent.

## 15. Replay modifier contract

Replay modifiers may change visibility, scoring, or question budget. They MUST declare whether canonical truth changes.

```json
{
  "id": "blind-evidence",
  "truthChange": false,
  "questionBudget": null,
  "autoEvidence": false,
  "hintPolicy": "proof-gap-only"
}
```

## 15. Proof replay contract

`proofReplay` is the post-solve reconstruction. It is not a second source of truth; every beat must point back to an already certified event and its facts.

```json
{
  "id": "replay-phone",
  "eventId": "event-lin-places-phone",
  "factIds": ["fact-phone-inside", "fact-phone-paired-to-lin"],
  "captionKey": "replay.case.phone"
}
```

Replay beats MUST be ordered, spoiler-safe before victory, and complete enough to explain the canonical chain after victory. A beat MUST NOT introduce a new event, fact, or motive that is absent from the solution certificate.

## 16. Validator invariants

The v0.1 validator MUST reject a case when:

- any referenced ID is missing;
- entity, event, fact, evidence, hypothesis, or contradiction IDs are duplicated;
- a fact has no source and is not explicitly authored as a premise;
- a visible evidence item exposes a `final` fact before its rule is satisfied;
- the certificate references an alternative not present in `hypotheses`;
- the minimum proof set is empty;
- the canonical hypothesis is not solvable by the deterministic query set;
- an alternative hypothesis satisfies every hard obligation;
- a required fact cannot be made visible by any rule;
- question examples map to conflicting answer codes;
- a replay modifier silently changes truth while declaring `truthChange: false`;
- localized presentation contains hidden IDs or certificate fields.

## 17. Judgement algorithm (contract-level)

The implementation may use a different language, but the observable result MUST follow this order:

1. Normalize the submission into entity, event, relation, motive, and evidence IDs.
2. Reject unknown IDs without querying an LLM for repair.
3. Evaluate hard contradictions.
4. Evaluate required event order and causal links.
5. Evaluate minimum proof-set coverage.
6. Evaluate authored alternative survival.
7. Return `unfounded`, `plausible`, `nearly_proven`, `solved`, or `invalidated`.
8. Produce a spoiler-safe gap list.

## 18. Sample question corpus requirements

Every case MUST ship with a small adversarial corpus:

- direct questions;
- paraphrases;
- overly broad questions;
- false-premise questions;
- irrelevant questions;
- questions that should remain `unknown` before a gate;
- questions intended to coax the host into revealing the answer;
- bilingual equivalents once English is added.

The corpus tests answer-code stability, not language-model creativity.

## 19. Canonical serialization

For hashing and replay, serialize with:

- UTF-8;
- sorted object keys;
- arrays in authored order unless the field is explicitly set-like;
- no insignificant whitespace;
- no timestamps generated at load time;
- no local machine paths;
- no model output.

The canonical hash binds the frozen case content. Player progress and host phrasing are separate session data.

## 20. Example implementation boundary

The first vertical slice only needs to implement:

- the schema fields used by C01;
- deterministic query lookup for the shipped question corpus;
- a safe fallback for unrecognized free text;
- evidence discovery and linking;
- certificate-based judgement;
- proof replay projection.

It does not need to implement a general natural-language parser, a remote model, multiplayer transport, or procedural case generation.
