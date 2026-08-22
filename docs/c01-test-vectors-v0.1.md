# C01 Test Vectors v0.1

This document turns [Case Schema v0.1](E:/xuexi/turtle-soup/docs/case-schema-v0.1.md) and [C01](E:/xuexi/turtle-soup/content/zh/cases/c01-cold-room-knock.json) into an executable acceptance contract.

These vectors test deterministic semantics. They are not language-model evaluation prompts. A host may paraphrase an answer only after the expected answer code has been selected.

## 1. State notation

Each vector describes only the relevant projection of a game state:

- `discoveredEvidenceIds`: evidence cards already owned by the player;
- `visitedLocationIds`: locations already inspected;
- `answeredQueryIds`: normalized queries already asked;
- `expectedVisibleFactIds`: facts that should be visible after the transition;
- `expectedAnswerCode`: the stable answer code;
- `expectedEvidenceIds`: cards that may be unlocked by the query.

The test harness MUST not inspect hidden facts to choose a player-facing answer. It may use the canonical graph internally, but the public result must obey visibility.

## 2. Answer-code vectors

| ID | Phase / setup | Query | Expected code | Expected public consequence |
|---|---|---|---|---|
| A01 | opening | `query-door-mechanism` | `yes` | Reveal door latch and no-entry facts; do not reveal phone or motive. |
| A02 | opening | `query-person-inside` | `unknown` | No answer card; suggest investigating the sound source. |
| A03 | opening | `query-knock-source` | `unknown` | No answer card; metal-tray evidence is still undiscovered. |
| A04 | opening | `query-irrelevant-color` | `irrelevant` | Add no fact and no evidence. |
| A05 | opening | unrecognized natural language | `unrecognized` | Do not call an AI or mutate game state. |
| A06 | after `evidence-metal-tray-mark` | `query-knock-source` | `no` | Reveal that no person is inside and expose the independent recording. |
| A07 | after A06 + `evidence-metal-tray-mark` | `query-phone-inside` | `yes` | Reveal phone location and alarm fact. |
| A08 | after A06 + phone gate | `query-lin-ownership` | `yes` | Reveal phone/Lin pairing. |
| A09 | after `evidence-access-log`, before locker visit | `query-sample-location` | `unknown` | Do not reveal the locker contents. |
| A10 | after `evidence-access-log` + visit locker | `query-sample-location` | `yes` | Reveal sample location and discovery evidence. |
| A11 | after sample + independent recording evidence | `query-lin-motive` | `yes` | Reveal delay chain and motive fact. |
| A12 | after door gate | `query-fang-entered` | `no` | Attach the no-entry contradiction to the Fang alternative. |

## 3. Visibility transition vectors

### V01 — Opening projection

Initial state must expose exactly these facts:

```text
fact-three-knocks
fact-door-sealed
fact-cctv-lin-exited
fact-lin-left-before-knock
fact-lin-authorized
```

Initial state MUST NOT expose:

```text
fact-phone-paired-to-lin
fact-phone-inside
fact-alarm-set
fact-vibration-caused-knock
fact-no-person-inside
fact-sample-in-locker
fact-lin-intent-delay
```

### V02 — Door query

After A01, visible facts must include:

```text
fact-door-auto-latched
fact-no-entry-after-lock
fact-fang-no-override
```

It MUST NOT expose the phone, sample, or motive facts.

### V03 — Sound-source evidence

After discovering `evidence-metal-tray-mark`, visible facts must include:

```text
fact-vibration-caused-knock
fact-no-person-inside
fact-knock-independently-recorded
```

### V04 — Phone gate

After A06 and asking `query-phone-inside`, visible facts must include:

```text
fact-phone-paired-to-lin
fact-phone-inside
fact-alarm-set
```

### V05 — Sample gate

After discovering `evidence-access-log` but before visiting `location-external-locker`, `fact-sample-in-locker` remains hidden. After visiting the locker, it becomes visible.

### V06 — Intent gate

The motive fact MUST remain hidden until both `evidence-sample-locker` and `evidence-knock-recording` are discovered. Once both are present, reveal:

```text
fact-inspection-delayed
fact-lin-intent-delay
```

## 4. Theory-judgement vectors

### J01 — Complete proof

Submission:

```text
hypothesis: hypothesis-canonical
  evidence:
    evidence-cctv-exit
    evidence-door-latch
    evidence-metal-tray-mark
    evidence-knock-recording
    evidence-access-log
    evidence-phone-in-room
  evidence-phone-pairing
  evidence-sample-locker
  evidence-intent-chain
events:
  event-lin-removes-sample
  event-lin-hides-sample
  event-lin-places-phone
  event-lin-exits
  event-phone-vibrates
  event-yu-delays-entry
motive: motive-delay-inspection
```

Expected:

```text
judgement: solved
missingEvidenceIds: []
missingContradictionResolutionIds: []
replayBeats: replay-sample, replay-phone, replay-exit, replay-knock, replay-delay
```

### J02 — Correct chain, incomplete proof

Use J01 but remove `evidence-intent-chain` and do not reveal `fact-lin-intent-delay`.

Expected:

```text
judgement: nearly_proven
missingEvidenceIds: [evidence-intent-chain]
missingFactIds: []
spoilerSafeGap: "动机与延迟检查之间的因果关系尚未闭合。"
```

The response MUST NOT mention the phone, sample locker, or exact motive if those facts are not visible in the current state.

### J03 — Correct-looking guess with no evidence

Submit the canonical event chain and motive, but with no submitted evidence.

Expected:

```text
judgement: plausible
missingEvidenceIds: all minimum-proof evidence
```

This vector proves that guessing the answer is not equivalent to solving the case.

### J04 — Fang entered the room

```text
hypothesis: hypothesis-fang-entered
evidence: evidence-cctv-exit, evidence-door-latch, evidence-access-log
```

Expected:

```text
judgement: invalidated
contradiction: contradiction-no-person-inside
spoilerSafeGap: "这条路径无法解释封闭后的进入条件。"
```

### J05 — Security guard faked the sound

```text
hypothesis: hypothesis-guard-faked
evidence: evidence-knock-recording, evidence-metal-tray-mark
```

Expected:

```text
judgement: invalidated
contradiction: contradiction-independent-recording
spoilerSafeGap: "独立录音与物理痕迹不支持这个来源。"
```

### J06 — Wrong motive

Use the canonical event chain and minimum proof set, but submit `motive-attention` instead of `motive-delay-inspection`.

Expected:

```text
judgement: nearly_proven
missingMotive: motive-delay-inspection
spoilerSafeGap: "事件链基本成立，但驱动条件仍未被证明。"
```

The system MUST NOT replace the submitted motive silently.

## 5. Question-order invariance vectors

Once the relevant visibility gates are satisfied, these sequences MUST produce the same answer codes regardless of order:

### O01 — Door first

```text
query-door-mechanism -> yes
query-knock-source (before tray evidence) -> unknown
discover evidence-metal-tray-mark
query-knock-source -> no
query-phone-inside -> yes
```

### O02 — Evidence first

```text
discover evidence-metal-tray-mark
query-knock-source -> no
query-door-mechanism -> yes
query-phone-inside -> yes
```

The final visible fact set after O01 and O02 must be identical.

### O03 — Sample detour

```text
discover evidence-access-log
query-sample-location -> unknown
visit location-external-locker
query-sample-location -> yes
```

Visiting the locker changes visibility, not truth.

## 6. Anti-leak vectors

Before the solution certificate is satisfied, no host response, hint, or failure message may contain these complete strings:

```text
林澈把手机留在房间里制造假敲门声
样本被藏在外部储物柜
他想拖延检查
```

The host MAY say:

- “一个物理来源仍未确认。”
- “时间线已经排除了一种进入路径。”
- “还有一个动机链没有闭合。”

The host MUST NOT reveal hidden IDs, certificate fields, or unavailable evidence titles.

## 7. Replay vectors

After J01, the proof replay MUST emit exactly five beats in causal order:

| Order | Beat | Event | Required facts |
|---:|---|---|---|
| 1 | `replay-sample` | `event-lin-hides-sample` | `fact-sample-in-locker` |
| 2 | `replay-phone` | `event-lin-places-phone` | phone inside, pairing, alarm |
| 3 | `replay-exit` | `event-lin-exits` | left before knock, auto latch |
| 4 | `replay-knock` | `event-phone-vibrates` | vibration cause, no person inside |
| 5 | `replay-delay` | `event-yu-delays-entry` | inspection delay, Lin intent |

Replay MUST use already certified facts. It cannot introduce a new explanation after victory.

## 8. Quality assertions

The C01 bundle is acceptable for engine implementation only if:

- all vectors reference existing IDs;
- every `expectedAnswerCode` is in the fixed answer-code set;
- every `unknown` vector has an unsatisfied visibility gate;
- every `yes` or `no` vector has a visible supporting fact;
- every invalidated hypothesis is named by at least one hard contradiction;
- J01 has a non-empty minimum proof set;
- J02 proves a correct theory can remain unfinished;
- J03 proves guessing is not completion;
- O01 and O02 converge to the same visible fact set;
- anti-leak vectors remain clean before J01;
- replay beats cover the certificate's success beats exactly.

## 9. What this does not prove yet

These vectors do not yet prove:

- robust Chinese free-text parsing;
- English equivalence;
- human solve time;
- visual usability on mobile;
- model-host refusal and paraphrase quality;
- multiplayer authority or reconnect behavior.

Those are later gates, not reasons to weaken this deterministic contract.
