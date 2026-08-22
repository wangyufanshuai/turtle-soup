# TURTLE SOUP / 深汤 / The Black Soup

## Product Bible v0.1

> Status: concept and vertical-slice specification. No production code is defined by this document.
>
> Updated: 2026-08-22

## 0. One-sentence positioning

TURTLE SOUP is an evidence-first causal mystery game in which every question probes a finite hidden world and every successful solution is backed by a reconstructable proof chain.

中文表达：

> 不是猜中一句汤底，而是证明一件事究竟是如何发生的。

## 1. Product thesis

The market already has many products that provide a short strange premise, a chat box, and an answer. TURTLE SOUP must make the investigation itself the game.

The player should repeatedly perform four meaningful acts:

1. Observe an incomplete but fair situation.
2. Ask a question that tests a hypothesis, not merely requests a hint.
3. Record and connect evidence.
4. Submit a causal reconstruction that can be checked and replayed.

The product is successful when a player can explain why the answer is true, why the most tempting alternatives are false, and which evidence closed the case.

## 2. Product boundaries

### 2.1 Launch assumptions

- Platform: responsive Web/PWA, desktop-first but mobile-complete.
- First language: Chinese; English is a planned second presentation layer.
- Launch mode: solo story mode. Multiplayer rooms are reserved in the model and protocol.
- Target session: 5–20 minutes per case, with optional replay challenges.
- MVP content: 12 authored cases.
- AI: optional host and presentation layer; never the source of truth.
- Core path: fully playable without an API key, network connection, or remote model.
- First phase excludes accounts, storefront, complex social graph, and large-scale UGC.
- New project: `E:\xuexi\turtle-soup`, an independent repository.

### 2.2 Non-goals

The first release is not:

- a general-purpose chatbot;
- an infinite random puzzle generator;
- a civilization simulator;
- a full detective-town simulation;
- a social dating or anonymous voice-chat product;
- a model-training showcase;
- a visual novel whose answer is only revealed by clicking through scenes.

## 3. Target players

### 3.1 Primary player

Age 16+, enjoys mystery, lateral thinking, narrative games, escape rooms, tabletop deduction, or streamer-friendly puzzle content. They may be fluent in Chinese but should not need specialist knowledge, obscure cultural references, or programming skills.

### 3.2 Secondary players

- A solo player who wants a short, complete mystery during a break.
- A pair or group who discuss a case over voice chat.
- A streamer who wants viewers to propose questions.
- A puzzle author who wants to build and validate cases.

### 3.3 Accessibility promise

- Text-first, playable without audio.
- Keyboard and touch input are both first-class.
- High-contrast and reduced-motion modes.
- No required real-time reaction or hidden audio clue.
- Important facts are never communicated only through color.

## 4. First-session experience script

The first case should teach the product without a tutorial wall.

### Beat A — The impossible surface

The player sees a short incident with one striking contradiction. The opening should create a concrete question, not a vague lore dump.

Example surface:

> 凌晨两点，冷藏室里的人听见门外有人敲门。门从里面锁着，监控却显示那个人在一小时前已经离开了大楼。

The game tells the player only what is observed, not what it means.

### Beat B — First probe

The player may type a natural-language question or use a compact question scaffold. The system returns a concise, source-tagged answer. It should teach that questions test facts.

### Beat C — Evidence notebook

The answer becomes a candidate evidence card. The player can keep it, dismiss it, or connect it to an existing hypothesis. The notebook shows source and confidence, never hidden answer text.

### Beat D — A plausible wrong theory

The player is invited to submit a provisional theory before the case is solved. The game responds with a structured gap:

- missing time relation;
- contradiction with a witnessed fact;
- unsupported motive;
- alternative still consistent.

It does not reveal the solution.

### Beat E — Causal closure

The player identifies the minimum proof set, submits the event chain, and sees a replay of the incident. Each replay beat highlights the evidence that proves it.

### Beat F — Aftertaste

The player receives a compact debrief:

- what they observed;
- which questions had the highest information value;
- which red herring consumed time;
- why the final chain is unique;
- what replay modifier is now available.

The player should leave with the feeling: “I solved a case,” not “I exhausted a text box.”

## 5. Core game loop

```text
Observe surface
  -> formulate a question
  -> map question to predicates
  -> receive a bounded answer
  -> capture evidence
  -> connect evidence to a hypothesis
  -> test a contradiction or missing link
  -> submit a causal chain
  -> validate against the solution certificate
  -> receive proof, score, and replay challenge
```

### 5.1 Question is an action

A question is not a free hint request. It is an action against the case model. It should have:

- a target: person, place, object, time, event, or relationship;
- a predicate: was present, knew, touched, caused, intended, remembered, concealed;
- an optional qualifier: before, after, during, alone, physically possible;
- an intent: discover, verify, eliminate, compare, or challenge.

### 5.2 Answer semantics

The host must use a small, explicit vocabulary:

| Code | Player-facing meaning | Use |
|---|---|---|
| `yes` | 是 | The queried proposition is supported by the case truth. |
| `no` | 不是 | The queried proposition is contradicted by the case truth. |
| `partial` | 部分相关 | Some but not all of the proposition is true, or the target is too broad. |
| `invalid_premise` | 前提不成立 | The question assumes an entity, event, or condition that is not true. |
| `unknown` | 信息不足 | The fact exists but is not yet visible under current progression. |
| `irrelevant` | 与真相无关 | The proposition does not help explain the case. |
| `unanswerable` | 当前无法判断 | The case intentionally withholds or does not define this property. |

The player-facing sentence may be stylistic, but the underlying code must remain stable across languages and hosts.

### 5.3 Provisional theories

Players may create multiple hypotheses without penalty. A hypothesis contains:

- proposed event chain;
- implicated entities;
- assumed motive or cause;
- evidence supporting each link;
- unresolved gaps;
- contradictions discovered against it.

The game rewards testing a theory, not merely keeping many guesses.

## 6. Canonical case model

The canonical case is a finite, versioned truth graph. Presentation text, AI phrasing, and localization are projections of this graph.

### 6.1 Required domains

- `entities`: people, places, objects, roles, abstract states;
- `events`: timestamped or ordered occurrences;
- `relations`: caused_by, located_at, possessed, witnessed, intended, concealed, mistaken_for, transferred;
- `facts`: atomic propositions with provenance;
- `visibility_rules`: conditions under which a fact may be returned;
- `question_semantics`: normalized predicates and argument constraints;
- `answer_policy`: deterministic mapping from query result to answer code;
- `evidence_items`: player-visible cards derived from facts or event bundles;
- `hypotheses`: player-authored or system-assisted candidate chains;
- `contradictions`: failed spatial, temporal, physical, testimonial, or causal constraints;
- `solution_certificate`: minimum proof set and uniqueness obligations;
- `red_herrings`: true but nonessential facts or tempting interpretations;
- `replay_modifiers`: bounded variants that do not change canonical truth unless explicitly authored.

### 6.2 Fact requirements

Each fact must have:

- stable ID;
- human-readable statement;
- machine predicate;
- source event or relation;
- truth status;
- visibility state;
- localization key;
- tags for authoring and evaluation.

Facts cannot be created only in an LLM response.

### 6.3 Event requirements

Each event must define:

- event ID;
- participants;
- location;
- start and end or ordered position;
- preconditions;
- effects;
- witness or source links;
- whether it belongs to the canonical solution;
- which facts can reveal it.

### 6.4 Visibility rules

Visibility is separate from truth. A true fact can be hidden until the player:

- visits a location;
- asks about the right entity;
- discovers prerequisite evidence;
- challenges a testimony;
- reaches a chapter or replay condition.

Visibility rules must never make the final truth inconsistent. They only control when the player can know it.

### 6.5 Solution certificate

The certificate contains:

- canonical culprit or causal agent, if any;
- canonical event sequence;
- required fact IDs;
- required contradiction resolutions;
- accepted equivalent phrasings for motive/cause;
- excluded alternative chains;
- minimum proof set;
- optional bonus proof set;
- explanation templates for success and failure.

The certificate is authoritative for victory. An AI host may narrate it, but may not edit it.

## 7. Evidence notebook

The notebook is the primary player instrument, not a debug panel.

### 7.1 Evidence card fields

- title;
- player-facing observation;
- source: question, scene, testimony, object, timeline, or replay;
- normalized facts;
- related entities;
- confidence: observed, inferred, or provisional;
- supports / conflicts / depends-on links;
- spoiler-safe explanation of why it matters;
- discovered timestamp and question ID.

### 7.2 Evidence states

```text
unseen -> discovered -> examined -> connected -> verified
                         \-> dismissed
```

`verified` means the player has connected it to a valid fact or contradiction. It does not mean the evidence is part of the final proof.

### 7.3 Hypothesis board

The board supports:

- event nodes;
- temporal ordering;
- causal arrows;
- entity assignment;
- confidence markers;
- contradiction badges;
- “what would prove this?” prompts.

The board must not automatically draw the complete answer before the player earns it.

## 8. Theory submission and victory

### 8.1 Submission contract

A final submission contains:

1. event chain;
2. involved entities;
3. causal explanation;
4. motive or driving condition where applicable;
5. selected evidence IDs;
6. optional confidence statement.

### 8.2 Judgement levels

- `unfounded`: the proposed chain has no sufficient support;
- `plausible`: the chain is currently consistent but alternatives remain;
- `nearly_proven`: one or more required proof obligations are missing;
- `solved`: all required obligations pass and no authored alternative survives;
- `invalidated`: the submission contradicts a verified fact.

Only `solved` completes the case.

### 8.3 Failure feedback

Failure feedback must identify the type of gap, not the answer:

- “The time order is not established.”
- “This motive is possible but not necessary.”
- “Your theory requires the object to be in two places.”
- “Another candidate still satisfies all current evidence.”

The system must never say “ask about X” if X directly reveals the solution. It may say “a physical constraint remains untested.”

## 9. Scoring and replay

### 9.1 Primary score dimensions

- proof completeness;
- evidence efficiency;
- question information value;
- contradiction detection;
- red-herring resistance;
- hint dependency;
- time band;
- explanation quality.

The first three dimensions matter more than speed. Fast guessing without proof is not a high score.

### 9.2 Replay modes

MVP replay should use authored, bounded variants:

- `blind-evidence`: no automatic evidence cards until the player commits a note;
- `limited-questions`: a fixed question budget;
- `red-herring-heavy`: additional true but irrelevant facts;
- `reverse-proof`: start from a disputed conclusion and find the missing cause;
- `no-host`: use only deterministic UI answers;
- `local-host`: optional local model changes phrasing but not truth.

Randomized truth generation is out of scope for MVP.

## 10. AI host boundary

### 10.1 Allowed

- natural-language paraphrase of a deterministic answer;
- role-specific voice and tone;
- translation and localization assistance;
- spoiler-safe hint wording;
- optional recap prose after the case is solved;
- local-model host with strict structured output.

### 10.2 Forbidden

- creating a new fact, event, suspect, timeline, or motive;
- choosing the winning theory;
- changing answer code based on persuasion;
- inventing evidence sources;
- revealing hidden fact IDs or certificate fields;
- inferring beyond the allowed visibility projection;
- silently calling a remote API in the core solo path.

### 10.3 Fail-closed behavior

If the model is unavailable, malformed, overconfident, or attempts an unsupported claim:

1. discard its text;
2. use the deterministic answer template;
3. record a local host error for QA;
4. continue play without penalty.

## 11. Twelve-case MVP matrix

Each case is authored before implementation, with a one-page truth graph, a public surface, a minimum proof set, two false theories, and a replay modifier.

| ID | Working title | Archetype | Core causal trick | Player skill | Replay modifier |
|---|---|---|---|---|---|
| C01 | 冷藏室的敲门声 | spatial/temporal | The apparent victim and the sound occur in different time windows. | Establish an event order. | Limited questions. |
| C02 | 没有脚印的回家路 | physical | A real movement is hidden by a non-human carrier or surface condition. | Test physical feasibility. | Blind evidence. |
| C03 | 十二点的第二个影子 | identity | One testimony confuses a role, not a person. | Separate identity from appearance. | Red-herring-heavy. |
| C04 | 空房间里的生日歌 | social | The “celebration” is a signal used to coordinate an unrelated action. | Distinguish intention from surface meaning. | Reverse proof. |
| C05 | 失效的门禁记录 | technical/social | The log is true but refers to a copied credential, not the person. | Link object, access, and agency. | Limited questions. |
| C06 | 最后一杯没有喝完的汤 | classic lateral | The drink is not the causal object players assume. | Challenge the premise. | No-host. |
| C07 | 迟到的证词 | testimonial | A witness reports a true memory attached to the wrong time. | Validate memory against timeline. | Blind evidence. |
| C08 | 借来的名字 | identity/motive | The “culprit” acts under a role that belongs to someone else. | Follow role and motive separately. | Reverse proof. |
| C09 | 关灯后的第三步 | spatial | The crucial movement happens before the visible incident. | Build an ordered event chain. | Limited questions. |
| C10 | 只寄出一半的信 | causal/social | The missing half changes who benefits, not what physically happened. | Distinguish motive from mechanism. | Red-herring-heavy. |
| C11 | 无人认领的录音 | evidence provenance | The recording proves an event but not its speaker. | Treat source and content separately. | No-host. |
| C12 | 黑汤的余温 | synthesis | Several small, individually ordinary facts form one unique chain. | Integrate all evidence types. | Full challenge mode. |

Content rules for these cases:

- no case depends on a cultural pun or obscure trivia;
- at least one solution path must work with short Chinese questions;
- English localization must preserve predicates and answer codes;
- each case must include at least one legitimate “irrelevant” answer;
- each case must include a post-solve proof replay.

## 12. Content authoring workflow

```text
Author premise
  -> write canonical event graph
  -> define proof obligations
  -> define false theories
  -> define visibility and answer policy
  -> run static validation
  -> run automatic solver
  -> run adversarial question corpus
  -> blind human playtest
  -> revise wording and clue order
  -> freeze version and hash
```

The author must write the truth graph before the public prose. Prose cannot be used to patch a broken graph.

### 12.1 Required authoring reports

- schema errors;
- dangling references;
- unreachable facts;
- facts with no possible query;
- facts exposed too early;
- multiple surviving solutions;
- missing proof obligations;
- question ambiguity;
- red-herring overload;
- estimated solve-time band;
- localization hazards;
- spoiler scan.

## 13. Fairness, anti-cheat, and safety

### 13.1 Solo fairness

- The hidden case is shipped in a protected local bundle only if it is necessary for offline play.
- The UI never exposes the solution object through public state.
- The final answer is judged by the local certificate, not by text similarity.
- Hints are derived from proof gaps, not from the full solution.
- Replay and debrief are spoiler-safe until completion.

Offline bundles cannot provide perfect secrecy against a determined user. The product promise is fair play and clean information boundaries, not impossible cryptography.

### 13.2 Future multiplayer fairness

- Server-authoritative hidden truth.
- Separate host, player, spectator, and observer projections.
- Commit/reveal for host-authored custom cases.
- Question and answer event log with monotonic sequence IDs.
- Rate limits and duplicate-question compression.
- Host cannot edit the truth after a room begins.
- Reconnect resumes from a verified event cursor.

### 13.3 Content safety

Default content is dark mystery, not graphic shock. Prohibited or restricted categories include explicit sexual violence, hate content, real-person exploitation, instructions for wrongdoing, and gratuitous gore. A content tag and skip policy are required for every case.

## 14. Technical architecture boundary

### 14.1 Core packages

- `mystery-core`: pure deterministic state transitions, query evaluation, judgement, replay.
- `case-schema`: versioned types and validation.
- `authoring`: case editor models, reports, imports, exports.
- `evaluation`: solver, adversarial query suite, fairness metrics.
- `ui`: evidence notebook, hypothesis board, timeline, host surface.
- `host-adapters`: deterministic host, scripted host, optional local-model host.

### 14.2 Runtime modes

1. `offline`: no server, no model, complete solo case.
2. `local-host`: optional local model bridge; core remains authoritative.
3. `room-preview`: local simulation of future multiplayer permissions.
4. `server-room` (future): server-authoritative multiplayer.

### 14.3 Reuse policy

Reuse only pure, well-understood modules from existing projects:

- deduction graph ideas and validators from `detective-novel-lab`;
- evidence and contradiction models from `recursive-narrative-maze` and `quine-mystery-engine`;
- proof/audit patterns from `worldpulse` and `mini-frontier-llm`;
- evidence-board interaction patterns from `quantum-detective-desk`.

Do not import entire applications, route trees, database schemas, or world runtimes.

## 15. Vertical slice plan

### Slice A — one case, no AI

Deliverables:

- one authored case;
- deterministic question scaffolds plus bounded free-text normalization;
- answer codes;
- evidence notebook;
- hypothesis board;
- theory submission;
- proof replay;
- local save;
- one mobile layout;
- automated solver and fairness tests.

Exit criteria:

- a new player can finish without documentation;
- a wrong theory receives a useful gap without a spoiler;
- the same case remains answer-consistent across question order;
- no model or network call is required.

### Slice B — twelve cases

Deliverables:

- case browser and chapter metadata;
- 12 frozen case files;
- difficulty and accessibility settings;
- replay modifiers;
- content validation command;
- English presentation skeleton;
- optional local host adapter.

### Slice C — multiplayer reservation

Deliverables:

- room state protocol;
- host/player projections;
- event sequence and reconnect design;
- no public launch requirement yet.

## 16. Release gates

The product is not ready for public launch until all MVP cases pass:

1. Unique canonical solution.
2. Minimum proof set is non-empty and sufficient.
3. At least two tempting alternatives are rejected by evidence.
4. Every answer has a source fact or explicit irrelevant/unanswerable rule.
5. No question order changes the truth or judgement.
6. Automatic solver reaches `solved` without hidden answer injection.
7. AI host cannot add facts outside its projection.
8. Three blind human sessions per case are recorded.
9. Median target solve time is within 5–20 minutes.
10. Mobile, keyboard, contrast, and reduced-motion checks pass.
11. Public output contains no solution certificate or hidden identifiers.
12. Case content is versioned and hashable.

## 17. Explicitly do not reuse or rebuild

- Do not merge all existing repositories.
- Do not copy Detective Town's full campaign and town runtime.
- Do not move WorldPulse's production database and operations plane into MVP.
- Do not train a new foundation model before the deterministic game is fun.
- Do not build a marketplace before 12 cases retain players.
- Do not add accounts before local save and privacy boundaries are stable.
- Do not call model APIs from the core judgement path.
- Do not add procedural case generation before authored cases pass fairness gates.

## 18. Open risks and decisions

### Risk 1 — Free-text questions may be too hard to normalize

Mitigation: ship question scaffolds and a visible normalized interpretation. Free text is an input convenience, not an uncontrolled semantic authority.

### Risk 2 — Deterministic answers may feel robotic

Mitigation: separate answer code from presentation text; add role-specific authored phrasing and optional local-model paraphrase after the logic is stable.

### Risk 3 — Evidence boards can become busy dashboards

Mitigation: one current investigation goal, progressive disclosure, and a proof-focused debrief. Do not show every internal node.

### Risk 4 — Replay may feel like repeating the same case

Mitigation: authored modifiers change information constraints and scoring while preserving the same canonical truth unless a variant is explicitly authored and separately certified.

### Risk 5 — Dark content may narrow the audience

Mitigation: content tags, non-graphic presentation, a family-safe case subset, and a clear age rating strategy.

## 19. Current product assumptions to validate

- Players prefer proving a causal chain over receiving a fast answer.
- A 5–20 minute case can feel complete if its debrief is strong.
- Structured answer feedback is more satisfying than unrestricted AI improvisation.
- A local-first mode is a meaningful trust and accessibility advantage.
- A small number of excellent cases can outperform a large low-quality catalogue.
- Streamer and pair play can emerge from solo cases without building social infrastructure first.

## 20. Next minimum deliverable

The next artifact should be `Case Schema v0.1`, containing:

- one machine-readable case contract;
- one complete sample case, likely C01;
- a query-to-predicate table;
- answer-policy examples;
- a solution certificate;
- two false theories;
- a fairness test checklist;
- a spoiler-safe public projection.

Only after that artifact passes review should implementation begin.

