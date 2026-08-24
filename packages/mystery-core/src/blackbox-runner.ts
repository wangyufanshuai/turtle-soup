import type { EventOptionProjection, GameCommand, GameEvent, PlayerProjection, SaveEnvelope } from "./types.ts";

/**
 * The runner deliberately knows only the public protocol. A concrete adapter
 * may live behind a Worker or an in-memory test harness, but this module never
 * receives a case file, certificate, hidden id, or authored answer.
 */
export interface ProjectionOnlySnapshot {
  projection: PlayerProjection;
  events: GameEvent[];
  accepted: boolean;
  save?: SaveEnvelope;
}

export interface ProjectionOnlyAdapter {
  initialize(): Promise<ProjectionOnlySnapshot>;
  dispatch(command: GameCommand): Promise<ProjectionOnlySnapshot>;
  restore(save: SaveEnvelope): Promise<ProjectionOnlySnapshot>;
}

export const SYNTHETIC_PERSONA_IDS = [
  "novice-observer",
  "colloquial-questioner",
  "typo-input",
  "evidence-first",
  "premature-guesser",
  "counterfactual-thinker",
  "minimal-questioner",
  "shuffled-investigator",
  "ambiguity-recovery",
  "wrong-theory-loop",
  "challenge-player",
  "interrupted-recovery",
] as const;

export type SyntheticPersonaId = typeof SYNTHETIC_PERSONA_IDS[number];

export interface ProjectionOnlyTrace {
  persona: SyntheticPersonaId;
  acceptedCommands: number;
  rejectedCommands: number;
  questionAttempts: number;
  answeredQuestions: number;
  ambiguityAttempts: number;
  ambiguityRecoveries: number;
  evidenceChecks: number;
  theoryAttempts: number;
  wrongTheoryAttempts: number;
  boardCommands: number;
  chapterUnlocks: number;
  saveRestored: boolean;
  challengeStarted: boolean;
  /** Number of bounded public-projection proof-search attempts. */
  publicSearchAttempts: number;
  /** Aggregate operation positions; raw command logs remain outside the report contract. */
  firstEffectiveOperation: number;
  firstAnsweredQuestionOperation: number;
  proofFailureCategories: Record<string, number>;
  solved: boolean;
  replayReady: boolean;
  publicLeak: boolean;
  commandTypeCounts: Record<string, number>;
  rejectionMessages: string[];
  inspectedEvidenceIds: string[];
  debugTimeline: Array<{ phase: string; evidenceIds: string[]; locations: string[]; questionCount: number }>;
  finalSummary?: {
    theoryOptions: string[];
    evidenceCount: number;
    examinedEvidenceCount: number;
    eventCount: number;
    theoryDrafts: Array<{ id: string; hypothesisId: string; eventCount: number; evidenceCount: number }>;
    boardCount: number;
    evidenceIds: string[];
    locationIds: string[];
    interpretedQuestions: string[];
  };
}

function publicText(value: string, persona: SyntheticPersonaId, index: number): string {
  if (persona === "colloquial-questioner") return `那${value}`;
  if (persona === "typo-input") return value.replace("是", "系").replace("吗", "嘛").replace("的", "地");
  if (persona === "counterfactual-thinker") return `如果不是这样，${value}`;
  if (persona === "minimal-questioner") return index % 2 === 0 ? value : `请只确认：${value}`;
  if (persona === "shuffled-investigator") return index % 2 === 0 ? value : `记录里，${value}`;
  if (persona === "ambiguity-recovery") return index % 2 === 0 ? `${value}，以及另一个相关事实呢？` : value;
  return value;
}

function increment(counts: Record<string, number>, command: GameCommand): void {
  counts[command.type] = (counts[command.type] ?? 0) + 1;
}

function hasEvent(snapshot: ProjectionOnlySnapshot, type: GameEvent["type"]): boolean {
  return snapshot.events.some((event) => event.type === type);
}

function visibleEvidence(snapshot: ProjectionOnlySnapshot): string[] {
  return snapshot.projection.evidence
    .filter((item) => item.state !== "available" && item.state !== "dismissed")
    .map((item) => item.id);
}

async function send(
  adapter: ProjectionOnlyAdapter,
  snapshot: ProjectionOnlySnapshot,
  command: GameCommand,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  increment(trace.commandTypeCounts, command);
  const next = await adapter.dispatch(command);
  if (next.accepted) trace.acceptedCommands += 1;
  else {
    trace.rejectedCommands += 1;
    for (const event of next.events) if (event.type === "command_rejected") trace.rejectionMessages.push(event.message);
  }
  if (command.type === "set_evidence_state" && next.accepted) trace.inspectedEvidenceIds.push(command.evidenceId);
  if (next.accepted && trace.firstEffectiveOperation === 0 && command.type !== "start_case") trace.firstEffectiveOperation = trace.acceptedCommands;
  if (next.accepted && trace.firstAnsweredQuestionOperation === 0 && hasEvent(next, "question_answered")) trace.firstAnsweredQuestionOperation = trace.acceptedCommands;
  for (const event of next.events) {
    if (event.type !== "theory_judged" || !event.proofFailureCategory) continue;
    trace.proofFailureCategories[event.proofFailureCategory] = (trace.proofFailureCategories[event.proofFailureCategory] ?? 0) + 1;
  }
  if (command.type.startsWith("place_reasoning") || command.type.startsWith("connect_reasoning") || command.type.startsWith("disconnect_reasoning")) trace.boardCommands += 1;
  return next;
}

async function askVisibleQuestions(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  persona: SyntheticPersonaId,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  const seen = new Set<string>();
  for (let round = 0; round < 4; round += 1) {
    const candidates = snapshot.projection.questionScaffolds.filter((candidate) => !seen.has(candidate.queryId));
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      seen.add(candidate.queryId);
      trace.questionAttempts += 1;
      const before = snapshot.projection.transcript.length;
      snapshot = await send(adapter, snapshot, { type: "ask_text", rawText: publicText(candidate.label, persona, trace.questionAttempts) }, trace);
      if (hasEvent(snapshot, "interpretation_required")) {
        trace.ambiguityAttempts += 1;
        const queryId = snapshot.projection.interpretation?.candidates[0]?.queryId;
        if (queryId) {
          snapshot = await send(adapter, snapshot, { type: "confirm_interpretation", queryId }, trace);
          if (snapshot.projection.transcript.length > before) trace.ambiguityRecoveries += 1;
        }
      }
      trace.answeredQuestions += Math.max(0, snapshot.projection.transcript.length - before);
      if (snapshot.projection.solved) return snapshot;
    }
  }
  return snapshot;
}

async function inspectPublicEvidence(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  for (let pass = 0; pass < 8; pass += 1) {
    for (const location of snapshot.projection.locations.filter((item) => !item.visited)) {
      snapshot = await send(adapter, snapshot, { type: "visit_location", locationId: location.id }, trace);
    }
    const visible = snapshot.projection.evidence.filter((item) => item.state !== "examined" && item.state !== "verified" && item.state !== "connected" && item.state !== "dismissed");
    trace.debugTimeline.push({ phase: `evidence-pass-${pass}-before`, evidenceIds: snapshot.projection.evidence.map((item) => `${item.id}:${item.state}`), locations: snapshot.projection.locations.map((item) => `${item.id}:${item.visited ? "visited" : "open"}`), questionCount: snapshot.projection.transcript.length });
    if (visible.length === 0) break;
    let changed = false;
    for (const evidence of visible) {
      const next = await send(adapter, snapshot, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }, trace);
      if (next.accepted) { trace.evidenceChecks += 1; changed = true; }
      snapshot = next;
    }
    // A visible item can be discoverable only after a newly visited location
    // or a follow-up question. Keep probing the public surface for a bounded
    // number of rounds instead of treating one rejected inspection as a dead
    // end.
    snapshot = await askVisibleQuestions(adapter, snapshot, "evidence-first", trace);
    trace.debugTimeline.push({ phase: `evidence-pass-${pass}-after-questions`, evidenceIds: snapshot.projection.evidence.map((item) => `${item.id}:${item.state}`), locations: snapshot.projection.locations.map((item) => `${item.id}:${item.visited ? "visited" : "open"}`), questionCount: snapshot.projection.transcript.length });
    if (!changed && snapshot.projection.evidence.every((item) => ["examined", "verified", "connected", "dismissed"].includes(item.state))) break;
  }
  return snapshot;
}

async function fillBoards(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  for (const board of snapshot.projection.reasoningBoards) {
    const items = [...snapshot.projection.eventOptions];
    for (const slot of board.slots) {
      for (const item of items) {
        const next = await send(adapter, snapshot, { type: "place_reasoning_item", boardId: board.id, slotId: slot.id, itemId: item.id }, trace);
        snapshot = next;
        if (next.projection.reasoningBoards.find((candidate) => candidate.id === board.id)?.slots.find((candidate) => candidate.id === slot.id)?.itemId === item.id) break;
      }
    }
    const placed = snapshot.projection.reasoningBoards.find((candidate) => candidate.id === board.id)?.slots.map((slot) => slot.itemId).filter((item): item is string => Boolean(item)) ?? [];
    for (let index = 0; index + 1 < placed.length; index += 1) {
      const relation = board.allowedRelations[0] ?? "causes";
      snapshot = await send(adapter, snapshot, { type: "connect_reasoning_items", boardId: board.id, fromItemId: placed[index], toItemId: placed[index + 1], relation }, trace);
    }
  }
  return snapshot;
}

async function clearPublicTheoryDraft(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  theoryId: "theory-a" | "theory-b",
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  const draft = snapshot.projection.theoryDrafts.find((item) => item.id === theoryId);
  if (!draft) return snapshot;
  for (const eventId of [...draft.eventIds]) {
    snapshot = await send(adapter, snapshot, { type: "remove_theory_event", theoryId, eventId }, trace);
  }
  for (const evidenceId of [...draft.evidenceIds]) {
    snapshot = await send(adapter, snapshot, { type: "link_theory_evidence", theoryId, evidenceId, linked: false }, trace);
  }
  snapshot = await send(adapter, snapshot, { type: "set_theory_motive", theoryId }, trace);
  return snapshot;
}

async function clearPublicBoards(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  for (const board of snapshot.projection.reasoningBoards) {
    for (const slot of board.slots) {
      if (!slot.itemId) continue;
      snapshot = await send(adapter, snapshot, {
        type: "remove_reasoning_item",
        boardId: board.id,
        slotId: slot.id,
      }, trace);
    }
  }
  return snapshot;
}

function* publicEventCombinations(
  items: EventOptionProjection[],
  size: number,
  start = 0,
  selected: EventOptionProjection[] = [],
): Generator<EventOptionProjection[]> {
  if (selected.length === size) {
    yield [...selected];
    return;
  }
  const remaining = size - selected.length;
  for (let index = start; index <= items.length - remaining; index += 1) {
    selected.push(items[index]);
    yield* publicEventCombinations(items, size, index + 1, selected);
    selected.pop();
  }
}

function publicSearchSizes(eventCount: number): number[] {
  if (eventCount <= 0) return [];
  // Start near the middle of the visible chain, then expand symmetrically.
  // This is a search heuristic only; it encodes no authored solution size.
  const center = Math.max(1, Math.min(eventCount, Math.ceil(eventCount * 0.7)));
  const sizes: number[] = [];
  for (let distance = 0; sizes.length < eventCount; distance += 1) {
    const lower = center - distance;
    const upper = center + distance;
    if (lower >= 1 && !sizes.includes(lower)) sizes.push(lower);
    if (upper <= eventCount && !sizes.includes(upper)) sizes.push(upper);
  }
  return sizes;
}

/**
 * Recover a proof using only public projection data after the ordinary persona
 * strategy fails. This is deliberately bounded and deterministic so it can
 * expose public-protocol reachability without importing an authored solution.
 */
async function searchPublicProof(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  const budget = 5000;
  const options = [...initial.projection.theoryOptions];
  const events = [...initial.projection.eventOptions];
  const evidenceIds = visibleEvidence(initial);
  if (options.length === 0 || events.length === 0) return initial;

  let snapshot = initial;
  for (const option of options) {
    const theoryId = "theory-a" as const;
    for (const size of publicSearchSizes(events.length)) {
      for (const combination of publicEventCombinations(events, size)) {
        if (trace.publicSearchAttempts >= budget) return snapshot;
        snapshot = await clearPublicTheoryDraft(adapter, snapshot, theoryId, trace);
        snapshot = await clearPublicBoards(adapter, snapshot, trace);
        snapshot = await send(adapter, snapshot, { type: "select_theory", theoryId }, trace);
        snapshot = await send(adapter, snapshot, {
          type: "set_theory_hypothesis",
          theoryId,
          hypothesisId: option.id,
        }, trace);
        const motive = option.motiveOptions[0]?.id;
        if (motive) snapshot = await send(adapter, snapshot, { type: "set_theory_motive", theoryId, motiveKey: motive }, trace);
        for (const event of combination) {
          snapshot = await send(adapter, snapshot, { type: "upsert_theory_event", theoryId, eventId: event.id }, trace);
        }
        for (const evidenceId of evidenceIds) {
          snapshot = await send(adapter, snapshot, { type: "link_theory_evidence", theoryId, evidenceId, linked: true }, trace);
        }
        snapshot = await fillBoards(adapter, snapshot, trace);
        trace.publicSearchAttempts += 1;
        trace.theoryAttempts += 1;
        snapshot = await send(adapter, snapshot, { type: "submit_theory", theoryId }, trace);
        if (snapshot.projection.solved || hasEvent(snapshot, "case_solved")) return snapshot;
      }
    }
  }
  return snapshot;
}

async function attemptTheories(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  persona: SyntheticPersonaId,
  trace: ProjectionOnlyTrace,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  const tried = new Set<string>();
  for (let optionIndex = 0; optionIndex < 6; optionIndex += 1) {
    const option = snapshot.projection.theoryOptions.find((candidate) => !tried.has(candidate.id));
    if (!option) break;
    tried.add(option.id);
    // A public projection may expose more hypotheses than the two editable
    // slots. Reuse slots deterministically; never assume authored ordering.
    const theoryId = optionIndex % 2 === 0 ? "theory-a" : "theory-b";
    snapshot = await send(adapter, snapshot, { type: "select_theory", theoryId }, trace);
    snapshot = await send(adapter, snapshot, { type: "set_theory_hypothesis", theoryId, hypothesisId: option.id }, trace);
    const motive = option.motiveOptions[0]?.id;
    if (motive) snapshot = await send(adapter, snapshot, { type: "set_theory_motive", theoryId, motiveKey: motive }, trace);
    for (const evidenceId of visibleEvidence(snapshot)) snapshot = await send(adapter, snapshot, { type: "link_theory_evidence", theoryId, evidenceId, linked: true }, trace);
    for (const event of snapshot.projection.eventOptions) snapshot = await send(adapter, snapshot, { type: "upsert_theory_event", theoryId, eventId: event.id }, trace);
    snapshot = await fillBoards(adapter, snapshot, trace);
    trace.theoryAttempts += 1;
    snapshot = await send(adapter, snapshot, { type: "submit_theory", theoryId }, trace);
    if (hasEvent(snapshot, "case_solved") || snapshot.projection.solved) break;
    trace.wrongTheoryAttempts += 1;
    if (persona === "wrong-theory-loop") {
      snapshot = await send(adapter, snapshot, { type: "submit_theory", theoryId }, trace);
    }
  }
  return snapshot;
}

export async function runProjectionOnlyCase(adapter: ProjectionOnlyAdapter, persona: SyntheticPersonaId): Promise<ProjectionOnlyTrace> {
  const trace: ProjectionOnlyTrace = {
    persona, acceptedCommands: 0, rejectedCommands: 0, questionAttempts: 0, answeredQuestions: 0,
    ambiguityAttempts: 0, ambiguityRecoveries: 0, evidenceChecks: 0, theoryAttempts: 0, wrongTheoryAttempts: 0,
    boardCommands: 0, chapterUnlocks: 0, saveRestored: false, challengeStarted: false, solved: false,
    replayReady: false, publicLeak: false, commandTypeCounts: {}, rejectionMessages: [], inspectedEvidenceIds: [], debugTimeline: [], publicSearchAttempts: 0,
    firstEffectiveOperation: 0, firstAnsweredQuestionOperation: 0, proofFailureCategories: {},
  };
  let snapshot = await adapter.initialize();
  snapshot = await askVisibleQuestions(adapter, snapshot, persona, trace);
  for (const location of snapshot.projection.locations.filter((item) => !item.visited)) {
    snapshot = await send(adapter, snapshot, { type: "visit_location", locationId: location.id }, trace);
  }
  if (persona === "evidence-first" || persona === "novice-observer") snapshot = await inspectPublicEvidence(adapter, snapshot, trace);
  else {
    snapshot = await inspectPublicEvidence(adapter, snapshot, trace);
    snapshot = await askVisibleQuestions(adapter, snapshot, persona, trace);
  }
  if (persona === "premature-guesser" && snapshot.projection.theoryOptions[0]) {
    snapshot = await send(adapter, snapshot, { type: "select_theory", theoryId: "theory-a" }, trace);
    snapshot = await send(adapter, snapshot, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: snapshot.projection.theoryOptions[0].id }, trace);
    snapshot = await send(adapter, snapshot, { type: "submit_theory", theoryId: "theory-a" }, trace);
  }
  if (persona === "interrupted-recovery" && snapshot.save) {
    const restored = await adapter.restore(snapshot.save);
    trace.saveRestored = JSON.stringify(restored.projection) === JSON.stringify(snapshot.projection);
    snapshot = restored;
  }
  snapshot = await attemptTheories(adapter, snapshot, persona, trace);
  if (!snapshot.projection.solved) {
    snapshot = await searchPublicProof(adapter, snapshot, trace);
  }
  if (snapshot.projection.solved) {
    snapshot = await send(adapter, snapshot, { type: "request_proof_replay" }, trace);
    trace.replayReady = hasEvent(snapshot, "replay_ready") || snapshot.projection.replay.length > 0;
    if (persona === "challenge-player") {
      snapshot = await send(adapter, snapshot, { type: "set_replay_mode", mode: "limited-questions" }, trace);
      trace.challengeStarted = hasEvent(snapshot, "replay_mode_started");
    }
  }
  trace.chapterUnlocks = snapshot.events.filter((event) => event.type === "chapter_unlocked").length;
  trace.finalSummary = {
    theoryOptions: snapshot.projection.theoryOptions.map((item) => item.id),
    evidenceCount: snapshot.projection.evidence.length,
    examinedEvidenceCount: snapshot.projection.evidence.filter((item) => ["examined", "verified", "connected"].includes(item.state)).length,
    eventCount: snapshot.projection.eventOptions.length,
    theoryDrafts: snapshot.projection.theoryDrafts.map((draft) => ({ id: draft.id, hypothesisId: draft.hypothesisId, eventCount: draft.eventIds.length, evidenceCount: draft.evidenceIds.length })),
    boardCount: snapshot.projection.reasoningBoards.length,
    evidenceIds: snapshot.projection.evidence.map((item) => item.id),
    locationIds: snapshot.projection.locations.map((item) => `${item.id}:${item.visited ? "visited" : "open"}`),
    interpretedQuestions: snapshot.projection.transcript.map((item) => item.interpretedAs),
  };
  trace.solved = snapshot.projection.solved || trace.challengeStarted;
  return trace;
}
