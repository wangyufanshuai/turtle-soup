import type {
  GameCommand,
  GameEvent,
  PlayerProjection,
  ProofObligationKind,
  TheoryDraft,
} from "./types.ts";
import type {
  ProjectionOnlyAdapter,
  ProjectionOnlySnapshot,
  SyntheticPersonaId,
} from "./blackbox-runner.ts";

export type BudgetedOutcome = "solved" | "abandoned" | "budget_exhausted";

export type BudgetedAbandonReason =
  | "recognition-failure-loop"
  | "duplicate-answer-loop"
  | "no-new-evidence"
  | "no-public-theory"
  | "no-public-events"
  | "proof-gap-unresolved"
  | "question-budget-exhausted"
  | "evidence-budget-exhausted"
  | "theory-budget-exhausted";

export interface BudgetedRunnerLimits {
  seed: number;
  questionLimit: number;
  evidenceLimit: number;
  theoryLimit: number;
  locationLimit: number;
  noProgressLimit: number;
}

export type BudgetedProgressObserver = (
  projection: PlayerProjection,
  events: readonly GameEvent[],
  command?: GameCommand,
) => void;

export interface BudgetedProjectionTrace {
  persona: SyntheticPersonaId;
  seed: number;
  outcome: BudgetedOutcome;
  abandonReason?: BudgetedAbandonReason;
  solved: boolean;
  replayReady: boolean;
  questionBudget: number;
  questionBudgetUsed: number;
  answeredQuestions: number;
  validQuestionRate: number;
  evidenceBudget: number;
  evidenceBudgetUsed: number;
  theoryBudget: number;
  theoryBudgetUsed: number;
  wrongTheoryAttempts: number;
  hintUseCount: number;
  ambiguityAttempts: number;
  ambiguityRecoveries: number;
  recognitionFailures: number;
  duplicateAnswers: number;
  consecutiveNoProgress: number;
  maximumConsecutiveNoProgress: number;
  chapterEntries: number;
  chapterTransitions: number;
  proofFailureCategories: Partial<Record<ProofObligationKind, number>>;
  finalProofFailureCategory?: ProofObligationKind;
  publicSearchAttempts: 0;
  saveRestored: boolean;
  acceptedCommands: number;
  rejectedCommands: number;
  inspectedEvidenceIds: string[];
  inspectedAllVisibleEvidence: boolean;
}

const DEFAULT_LIMITS: BudgetedRunnerLimits = {
  seed: 17,
  questionLimit: 24,
  evidenceLimit: 7,
  theoryLimit: 3,
  locationLimit: 3,
  noProgressLimit: 5,
};

function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function bigrams(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[\s，。！？、：；“”‘’（）()\-_/]+/g, "");
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function overlapScore(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.sqrt(a.size * b.size);
}

function personaQuestion(label: string, persona: SyntheticPersonaId, index: number): string {
  if (persona === "colloquial-questioner") return index % 3 === 0 ? `所以说，${label}` : `那${label}`;
  if (persona === "typo-input") return index % 3 === 0 ? label.replace("记录", "记绿").replace("时间", "时问") : label.replace("吗", "嘛");
  if (persona === "counterfactual-thinker") return index % 3 === 0 ? `如果不是这样，${label}` : label;
  if (persona === "minimal-questioner") return index % 2 === 0 ? label : `只确认：${label}`;
  if (persona === "shuffled-investigator") return index % 2 === 0 ? label : `从记录看，${label}`;
  if (persona === "ambiguity-recovery") return index % 4 === 0 ? `${label}，另一个相关情况呢？` : label;
  return label;
}

function visibleEvidenceCount(projection: PlayerProjection): number {
  return projection.evidence.filter((item) => item.state !== "available").length;
}

function examinedEvidence(projection: PlayerProjection): string[] {
  return projection.evidence
    .filter((item) => ["examined", "connected", "verified"].includes(item.state))
    .map((item) => item.id);
}

function hasEvent(snapshot: ProjectionOnlySnapshot, type: GameEvent["type"]): boolean {
  return snapshot.events.some((event) => event.type === type);
}

function evidenceContext(projection: PlayerProjection): string {
  return [
    projection.case.surface,
    ...projection.transcript.filter((entry) => !entry.repeated).map((entry) => `${entry.interpretedAs}${entry.answerText}`),
    ...projection.evidence.filter((item) => ["examined", "connected", "verified"].includes(item.state)).map((item) => `${item.title}${item.observation}`),
  ].join(" ");
}

function chooseQuestion(
  projection: PlayerProjection,
  seen: Set<string>,
  persona: SyntheticPersonaId,
  random: () => number,
) {
  const context = evidenceContext(projection);
  const candidates = projection.questionScaffolds
    .filter((candidate) => !seen.has(candidate.queryId))
    .map((candidate, index) => ({
      candidate,
      score: overlapScore(candidate.label, context) * 0.35
        + 1 / (index + 1)
        + (persona === "shuffled-investigator" ? random() * 0.8 : random() * 0.08)
    }))
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.candidate;
}

function chooseEvidence(projection: PlayerProjection, random: () => number) {
  const context = evidenceContext(projection);
  return projection.evidence
    .filter((item) => !["examined", "connected", "verified", "dismissed"].includes(item.state))
    .map((item, index) => ({
      item,
      score: (item.isNew ? 2 : 0)
        + (item.state === "discovered" ? 1 : 0)
        + overlapScore(`${item.title}${item.observation}`, context) * 0.25
        + random() * 0.04
        - index * 0.01,
    }))
    .sort((left, right) => right.score - left.score)[0]?.item;
}

function theoryOrder(projection: PlayerProjection, persona: SyntheticPersonaId, random: () => number) {
  const context = evidenceContext(projection);
  const ranked = projection.theoryOptions
    .map((option, index) => ({ option, score: overlapScore(option.label, context) + random() * 0.04 - index * 0.0001 }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.option);
  if (["premature-guesser", "wrong-theory-loop"].includes(persona) && ranked.length > 1) {
    return [ranked[1], ranked[0], ...ranked.slice(2)];
  }
  return ranked;
}

async function clearTheory(
  adapter: ProjectionOnlyAdapter,
  initial: ProjectionOnlySnapshot,
  theoryId: TheoryDraft["id"],
  send: (command: GameCommand) => Promise<ProjectionOnlySnapshot>,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  const draft = snapshot.projection.theoryDrafts.find((item) => item.id === theoryId);
  if (!draft) return snapshot;
  for (const eventId of [...draft.eventIds]) snapshot = await send({ type: "remove_theory_event", theoryId, eventId });
  for (const evidenceId of [...draft.evidenceIds]) snapshot = await send({ type: "link_theory_evidence", theoryId, evidenceId, linked: false });
  snapshot = await send({ type: "set_theory_motive", theoryId });
  return snapshot;
}

async function placeBoardsOnce(
  initial: ProjectionOnlySnapshot,
  send: (command: GameCommand) => Promise<ProjectionOnlySnapshot>,
): Promise<ProjectionOnlySnapshot> {
  let snapshot = initial;
  for (const board of snapshot.projection.reasoningBoards) {
    let currentBoard = snapshot.projection.reasoningBoards.find((candidate) => candidate.id === board.id);
    const used = new Set(currentBoard?.slots.map((slot) => slot.itemId).filter((item): item is string => Boolean(item)) ?? []);
    for (const slot of board.slots) {
      currentBoard = snapshot.projection.reasoningBoards.find((candidate) => candidate.id === board.id);
      if (currentBoard?.slots.find((candidate) => candidate.id === slot.id)?.itemId) continue;
      const candidates = board.items
        .filter((item) => !used.has(item.id))
        .map((item, index) => ({ item, score: overlapScore(`${slot.label}${board.title}`, `${item.label}${item.timeLabel}`) - index * 0.0001 }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);
      for (const { item } of candidates) {
        const next = await send({ type: "place_reasoning_item", boardId: board.id, slotId: slot.id, itemId: item.id });
        snapshot = next;
        const placed = next.projection.reasoningBoards.find((candidate) => candidate.id === board.id)?.slots.find((candidate) => candidate.id === slot.id)?.itemId;
        if (placed === item.id) { used.add(item.id); break; }
      }
    }
    const current = snapshot.projection.reasoningBoards.find((candidate) => candidate.id === board.id);
    const placed = current?.slots.map((slot) => slot.itemId).filter((item): item is string => Boolean(item)) ?? [];
    const relation = current?.allowedRelations[0];
    if (relation) {
      for (let index = 0; index + 1 < placed.length; index += 1) {
        snapshot = await send({ type: "connect_reasoning_items", boardId: board.id, fromItemId: placed[index], toItemId: placed[index + 1], relation });
      }
    }
  }
  return snapshot;
}

export async function runBudgetedProjectionOnlyCase(
  adapter: ProjectionOnlyAdapter,
  persona: SyntheticPersonaId,
  configured: Partial<BudgetedRunnerLimits> = {},
  observeProgress?: BudgetedProgressObserver,
): Promise<BudgetedProjectionTrace> {
  const limits = { ...DEFAULT_LIMITS, ...configured };
  if (limits.questionLimit < 1 || limits.evidenceLimit < 1 || limits.theoryLimit < 1) throw new Error("Budgeted runner limits must be positive");
  const random = makeRandom(limits.seed);
  const trace: BudgetedProjectionTrace = {
    persona,
    seed: limits.seed,
    outcome: "budget_exhausted",
    solved: false,
    replayReady: false,
    questionBudget: limits.questionLimit,
    questionBudgetUsed: 0,
    answeredQuestions: 0,
    validQuestionRate: 0,
    evidenceBudget: limits.evidenceLimit,
    evidenceBudgetUsed: 0,
    theoryBudget: limits.theoryLimit,
    theoryBudgetUsed: 0,
    wrongTheoryAttempts: 0,
    hintUseCount: 0,
    ambiguityAttempts: 0,
    ambiguityRecoveries: 0,
    recognitionFailures: 0,
    duplicateAnswers: 0,
    consecutiveNoProgress: 0,
    maximumConsecutiveNoProgress: 0,
    chapterEntries: 0,
    chapterTransitions: 0,
    proofFailureCategories: {},
    publicSearchAttempts: 0,
    saveRestored: false,
    acceptedCommands: 0,
    rejectedCommands: 0,
    inspectedEvidenceIds: [],
    inspectedAllVisibleEvidence: false,
  };
  const enteredChapters = new Set<string>();
  let lastUnlockedChapterCount = 0;
  let snapshot = await adapter.initialize();
  observeProgress?.(snapshot.projection, snapshot.events);
  for (const chapter of snapshot.projection.chapters.filter((item) => item.unlocked)) enteredChapters.add(chapter.id);
  lastUnlockedChapterCount = enteredChapters.size;

  const send = async (command: GameCommand): Promise<ProjectionOnlySnapshot> => {
    const next = await adapter.dispatch(command);
    observeProgress?.(next.projection, next.events, command);
    if (next.accepted) trace.acceptedCommands += 1;
    else trace.rejectedCommands += 1;
    for (const event of next.events) {
      if (event.type === "theory_judged" && event.proofFailureCategory) {
        trace.proofFailureCategories[event.proofFailureCategory] = (trace.proofFailureCategories[event.proofFailureCategory] ?? 0) + 1;
        trace.finalProofFailureCategory = event.proofFailureCategory;
      }
    }
    for (const chapter of next.projection.chapters.filter((item) => item.unlocked)) enteredChapters.add(chapter.id);
    if (enteredChapters.size > lastUnlockedChapterCount) {
      trace.chapterTransitions += enteredChapters.size - lastUnlockedChapterCount;
      lastUnlockedChapterCount = enteredChapters.size;
    }
    return next;
  };

  const seenQuestions = new Set<string>();
  let visitedLocations = 0;
  let recognitionFailureStreak = 0;
  let duplicateStreak = 0;
  let noEvidenceStreak = 0;
  let questionsWithoutNewEvidence = 0;
  let stopReason: BudgetedAbandonReason | undefined;

  const inspectOne = async (): Promise<boolean> => {
    if (trace.evidenceBudgetUsed >= limits.evidenceLimit) return false;
    const evidence = chooseEvidence(snapshot.projection, random);
    if (!evidence) return false;
    const next = await send({ type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
    snapshot = next;
    if (!next.accepted) return false;
    trace.evidenceBudgetUsed += 1;
    if (!trace.inspectedEvidenceIds.includes(evidence.id)) trace.inspectedEvidenceIds.push(evidence.id);
    trace.consecutiveNoProgress = 0;
    return true;
  };

  const askOne = async (): Promise<boolean> => {
    const candidate = chooseQuestion(snapshot.projection, seenQuestions, persona, random);
    if (!candidate) return false;
    seenQuestions.add(candidate.queryId);
    const beforeTranscript = snapshot.projection.transcript.length;
    const beforeEvidence = visibleEvidenceCount(snapshot.projection);
    trace.questionBudgetUsed += 1;
    snapshot = await send({ type: "ask_text", rawText: personaQuestion(candidate.label, persona, trace.questionBudgetUsed) });
    if (hasEvent(snapshot, "interpretation_required")) {
      trace.ambiguityAttempts += 1;
      const queryId = snapshot.projection.interpretation?.candidates[0]?.queryId;
      if (queryId) {
        const beforeConfirm = snapshot.projection.transcript.length;
        snapshot = await send({ type: "confirm_interpretation", queryId });
        if (snapshot.projection.transcript.length > beforeConfirm) trace.ambiguityRecoveries += 1;
      }
    }
    const added = snapshot.projection.transcript.length - beforeTranscript;
    trace.answeredQuestions += Math.max(0, added);
    const last = snapshot.projection.transcript.at(-1);
    const duplicate = added > 0 && Boolean(last?.repeated);
    const newEvidence = visibleEvidenceCount(snapshot.projection) > beforeEvidence;
    if (added === 0) { trace.recognitionFailures += 1; recognitionFailureStreak += 1; } else recognitionFailureStreak = 0;
    if (duplicate) { trace.duplicateAnswers += 1; duplicateStreak += 1; } else duplicateStreak = 0;
    if (!newEvidence && (added === 0 || duplicate)) noEvidenceStreak += 1; else noEvidenceStreak = 0;
    if (newEvidence) questionsWithoutNewEvidence = 0; else questionsWithoutNewEvidence += 1;
    const progressed = added > 0 && !duplicate || newEvidence;
    trace.consecutiveNoProgress = progressed ? 0 : trace.consecutiveNoProgress + 1;
    trace.maximumConsecutiveNoProgress = Math.max(trace.maximumConsecutiveNoProgress, trace.consecutiveNoProgress);
    if (recognitionFailureStreak >= 3) stopReason = "recognition-failure-loop";
    else if (duplicateStreak >= 3) stopReason = "duplicate-answer-loop";
    else if (noEvidenceStreak >= limits.noProgressLimit && trace.answeredQuestions >= 8 && trace.evidenceBudgetUsed < 3) stopReason = "no-new-evidence";
    else if (["minimal-questioner", "typo-input"].includes(persona) && questionsWithoutNewEvidence >= limits.noProgressLimit + 3 && trace.evidenceBudgetUsed >= 3) stopReason = "no-new-evidence";
    return progressed;
  };

  const runInvestigationPhase = async (questionTarget: number): Promise<void> => {
    while (!stopReason && trace.questionBudgetUsed < Math.min(questionTarget, limits.questionLimit)) {
      if (visitedLocations < limits.locationLimit) {
        const location = snapshot.projection.locations.find((item) => !item.visited);
        if (location && (trace.questionBudgetUsed === 0 || trace.questionBudgetUsed % 4 === 0)) {
          const next = await send({ type: "visit_location", locationId: location.id });
          snapshot = next;
          if (next.accepted) visitedLocations += 1;
        }
      }
      const progressed = await askOne();
      if (!progressed && !chooseQuestion(snapshot.projection, seenQuestions, persona, random)) break;
      if (trace.questionBudgetUsed % 2 === 0 || visibleEvidenceCount(snapshot.projection) > trace.evidenceBudgetUsed + 1) await inspectOne();
      if (trace.consecutiveNoProgress >= limits.noProgressLimit) { stopReason = stopReason ?? "no-new-evidence"; break; }
    }
  };

  await runInvestigationPhase(Math.max(8, Math.ceil(limits.questionLimit * 0.55)));
  while (!stopReason && trace.evidenceBudgetUsed < Math.min(4, limits.evidenceLimit) && await inspectOne()) { /* bounded evidence catch-up */ }

  if (persona === "interrupted-recovery" && snapshot.save) {
    const before = JSON.stringify(snapshot.projection);
    const restored = await adapter.restore(snapshot.save);
    trace.saveRestored = restored.accepted && JSON.stringify(restored.projection) === before;
    snapshot = restored;
  }

  const options = theoryOrder(snapshot.projection, persona, random);
  if (options.length === 0) stopReason = stopReason ?? "no-public-theory";
  if (snapshot.projection.eventOptions.length === 0) stopReason = stopReason ?? "no-public-events";

  const attemptedOptions = new Set<string>();
  const attemptTheory = async (): Promise<void> => {
    if (snapshot.projection.solved || trace.theoryBudgetUsed >= limits.theoryLimit) return;
    const option = options.find((candidate) => !attemptedOptions.has(candidate.id));
    if (!option) return;
    attemptedOptions.add(option.id);
    const theoryId: TheoryDraft["id"] = trace.theoryBudgetUsed % 2 === 0 ? "theory-a" : "theory-b";
    snapshot = await clearTheory(adapter, snapshot, theoryId, send);
    snapshot = await send({ type: "select_theory", theoryId });
    snapshot = await send({ type: "set_theory_hypothesis", theoryId, hypothesisId: option.id });
    const motive = option.motiveOptions[0]?.id;
    if (motive) snapshot = await send({ type: "set_theory_motive", theoryId, motiveKey: motive });
    for (const evidenceId of examinedEvidence(snapshot.projection).slice(0, limits.evidenceLimit)) {
      snapshot = await send({ type: "link_theory_evidence", theoryId, evidenceId, linked: true });
    }
    // One coherent public order, never a combination search.
    for (const event of snapshot.projection.eventOptions) snapshot = await send({ type: "upsert_theory_event", theoryId, eventId: event.id });
    snapshot = await placeBoardsOnce(snapshot, send);
    trace.theoryBudgetUsed += 1;
    snapshot = await send({ type: "submit_theory", theoryId });
    if (!snapshot.projection.solved) {
      trace.wrongTheoryAttempts += 1;
      if (trace.finalProofFailureCategory && trace.hintUseCount < 3) trace.hintUseCount += 1;
    }
  };

  if (!stopReason || trace.evidenceBudgetUsed >= 3) await attemptTheory();
  if (!snapshot.projection.solved && !["recognition-failure-loop", "duplicate-answer-loop", "no-new-evidence", "no-public-theory", "no-public-events"].includes(stopReason ?? "")) {
    stopReason = undefined;
    await runInvestigationPhase(limits.questionLimit);
    while (trace.evidenceBudgetUsed < limits.evidenceLimit && await inspectOne()) { /* bounded final evidence pass */ }
    while (!snapshot.projection.solved && trace.theoryBudgetUsed < limits.theoryLimit && attemptedOptions.size < options.length) await attemptTheory();
  }

  if (snapshot.projection.solved) {
    snapshot = await send({ type: "request_proof_replay" });
    trace.outcome = "solved";
    trace.solved = true;
    trace.replayReady = hasEvent(snapshot, "replay_ready") || snapshot.projection.replay.length > 0;
  } else if (stopReason && ["recognition-failure-loop", "duplicate-answer-loop", "no-new-evidence", "no-public-theory", "no-public-events"].includes(stopReason)) {
    trace.outcome = "abandoned";
    trace.abandonReason = stopReason;
  } else {
    trace.outcome = "budget_exhausted";
    trace.abandonReason = trace.theoryBudgetUsed >= limits.theoryLimit
      ? "theory-budget-exhausted"
      : trace.evidenceBudgetUsed >= limits.evidenceLimit
        ? "evidence-budget-exhausted"
        : trace.questionBudgetUsed >= limits.questionLimit
          ? "question-budget-exhausted"
          : "proof-gap-unresolved";
  }
  trace.chapterEntries = enteredChapters.size;
  trace.validQuestionRate = trace.questionBudgetUsed > 0 ? trace.answeredQuestions / trace.questionBudgetUsed : 0;
  trace.inspectedAllVisibleEvidence = snapshot.projection.evidence.length > 0 && trace.inspectedEvidenceIds.length >= snapshot.projection.evidence.length;
  return trace;
}
