import {
  askQuestion,
  buildProofReplay,
  createInitialState,
  discoverEvidence,
  getDiscoverableEvidenceIds,
  judgeTheory,
  normalizeQuestion,
  visitLocation,
} from "./engine.ts";
import { boardsFor, reduceProofCommand } from "./proof-workspace-m3.ts";
import type {
  AnswerCode,
  CaseFile,
  DebriefReport,
  EvidenceItem,
  EvidencePlayerState,
  EventOptionProjection,
  GameCommand,
  GameEvent,
  GameState,
  LocationProjection,
  PlayerProjection,
  QuestionCandidateProjection,
  QuestionInterpretation,
  QuestionRoutingOffer,
  RuntimeResult,
  RuntimeState,
  TheoryDraft,
  ProofFeedback,
  TheoryOptionProjection,
  TranscriptEntry,
  ProofObligationKind,
  ReasoningBoardDraft,
} from "./types.ts";
import { reasoningBoardBehavior } from "./board-behavior.ts";
import { propositionCopy, propositionVisible, resolvePropositionM01 } from "./question-language-m01.ts";
import { explanationPolicy, investigationM2 } from "./investigation-m2.ts";

const DEFAULT_TARGET_MINUTES = { min: 5, max: 20 };

const ANSWER_LABELS: Record<AnswerCode, string> = {
  yes: "是",
  no: "不是",
  partial: "部分相关",
  invalid_premise: "前提不成立",
  unknown: "信息不足",
  irrelevant: "与真相无关",
  unanswerable: "当前无法判断",
  unrecognized: "无法识别",
};

const PREDICATE_LABELS: Record<string, string> = {
  occupancy: "验证现场是否有人",
  knock_source: "验证敲击声的来源",
  door_mechanism: "验证门锁机制",
  located_at: "验证物品位置",
  owned_by: "验证物品归属",
  intended_to_delay: "验证行为目的",
  entered_after_lock: "排除锁门后的进入",
  irrelevant_color: "验证外观细节",
  weather_rain: "验证是否在下雨",
  weather_stopped: "验证降雨是否停止",
  room_occupancy: "验证房间是否有人",
  drip_heard: "验证滴水发生时间",
  stored_water: "验证是否有储水",
  pipe_drainage: "验证水是否沿管道移动",
  roof_leak: "排除屋顶持续漏雨",
  unrelated_wet_object: "排除无关湿物",
};

const EVENT_ACTION_LABELS: Record<string, string> = {
  "removes-sample": "样本被带离冷藏室",
  "hides-sample": "样本被放入外部储物柜",
  "places-alarmed-phone": "定时手机被放在金属托盘旁",
  "exits-and-closes-door": "林澈离开，门闩自动闭合",
  "alarm-vibrates-against-tray": "手机震动撞击托盘",
  "hears-and-records-knock": "值班员听见并记录三下敲击",
  "delays-entry": "检查被延迟",
  "finds-sample": "样本在外部储物柜中被找到",
};

const HYPOTHESIS_LABELS: Record<string, string> = {
  "hypothesis-canonical": "林澈提前布置了延时声响",
  "hypothesis-fang-entered": "方砚在锁门后进入了冷藏室",
  "hypothesis-guard-faked": "余宁在走廊伪造了敲门声",
};

const MOTIVE_LABELS: Record<string, string> = {
  "motive-delay-inspection": "拖延样本检查",
  "motive-hide-error": "掩盖操作失误",
  "motive-attention": "吸引他人注意",
};

/** Read-only decoder for schema-one logs written before v2.12. Never project these aliases. */
function legacyHypothesisId(caseFile: CaseFile, hypothesisId: string): string {
  if (hypothesisId === caseFile.solutionCertificate.canonicalHypothesisId) {
    return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical";
  }
  const aliases: Record<string, string> = {
    "hypothesis-fang-entered": "path-late-entry",
    "hypothesis-guard-faked": "path-corridor-fake",
  };
  return aliases[hypothesisId] ?? `path-${hypothesisId.replace(/^hypothesis-/, "")}`;
}

function publicHypothesisId(caseFile: CaseFile, hypothesisId: string): string {
  return `path-${opaqueIdentityHash(`${caseFile.id}:hypothesis:${hypothesisId}`)}`;
}

function internalHypothesisId(caseFile: CaseFile, publicId: string): string | undefined {
  return caseFile.hypotheses.find((item) => publicHypothesisId(caseFile, item.id) === publicId || legacyHypothesisId(caseFile, item.id) === publicId)?.id;
}

function publicEventId(caseFile: CaseFile, eventId: string): string {
  return caseFile.events.some((event) => event.id === eventId)
    ? `event-${opaqueIdentityHash(`${caseFile.id}:event:${eventId}`)}` : "event-unknown";
}

function internalEventId(caseFile: CaseFile, publicId: string): string | undefined {
  const current = caseFile.events.find((event) => publicEventId(caseFile, event.id) === publicId);
  if (current) return current.id;
  const legacyIndex = /^event-(\d{2})$/.exec(publicId);
  return legacyIndex ? [...caseFile.events].sort((left, right) => left.order - right.order)[Number(legacyIndex[1]) - 1]?.id : undefined;
}

function localizations(caseFile: CaseFile): Record<string, string> {
  return caseFile.localization?.["zh-CN"] ?? {};
}

function translate(caseFile: CaseFile, key: unknown, fallback: string): string {
  return typeof key === "string" ? (localizations(caseFile)[key] ?? fallback) : fallback;
}

const DEFAULT_PRESENTATION = {
  layoutId: "cold-room",
  sceneAsset: "/scene-cold-room.svg",
  palette: "black-soup",
  accent: "#b8cf79",
  questionPromptMode: "host",
  evidenceVisualMode: "archive-cards",
  mobileNavigation: ["现场", "提问", "推理"],
};

function entityLabel(caseFile: CaseFile, id: unknown): string {
  if (typeof id !== "string") return "案件对象";
  const entity = caseFile.entities.find((item) => item.id === id);
  return entity ? translate(caseFile, entity.labelKey, id) : id;
}

function queryProjection(caseFile: CaseFile, queryId: string): QuestionCandidateProjection | undefined {
  const query = caseFile.questionSemantics.find((item) => item.id === queryId);
  if (!query) return undefined;
  const copy = propositionCopy(caseFile, queryId);
  const firstPhrase = copy?.label ?? translate(caseFile, query.labelKey, query.examplePhrases?.[0] ?? PREDICATE_LABELS[String(query.predicate)] ?? "验证一个事实");
  const slots = (query.slots ?? {}) as Record<string, unknown>;
  const target = entityLabel(caseFile, slots.subjectId ?? slots.locationId ?? slots.objectId ?? slots.effect ?? "案件事实");
  const qualifier = slots.time ? String(slots.time) : undefined;
  return {
    queryId: query.id,
    label: firstPhrase,
    target,
    predicate: PREDICATE_LABELS[String(query.predicate)] ?? String(query.predicate ?? "验证"),
    qualifier,
    ...(copy ? { starterEligible: Boolean(copy.starter) } : {}),
  };
}

function looksLikeInternalQuestionCopy(value: string): boolean {
  return /verified_c\d+_\d+/iu.test(value)
    || /^(?:entity|location|fact|event|query|evidence|relation|hypothesis|board|slot|chapter)-c\d+(?:[-_.]|$)/iu.test(value)
    || /(?:solutionCertificate|canonicalHypothesis|truthGraph|hiddenFacts?)/iu.test(value);
}

/**
 * Removes authoring identifiers from the copy shown to players or sent to an
 * optional routing model. The internal projection remains available for
 * deterministic routing identity and save replay compatibility.
 */
function publicQuestionCandidate(candidate: QuestionCandidateProjection): QuestionCandidateProjection {
  const label = looksLikeInternalQuestionCopy(candidate.label) ? "验证一条公开线索" : candidate.label;
  const target = looksLikeInternalQuestionCopy(candidate.target) ? "案件对象" : candidate.target;
  const predicate = !looksLikeInternalQuestionCopy(candidate.predicate) && /[\u3400-\u9fff]/u.test(candidate.predicate)
    ? candidate.predicate
    : "验证公开事实";
  const qualifier = candidate.qualifier && !looksLikeInternalQuestionCopy(candidate.qualifier)
    ? candidate.qualifier
    : undefined;
  return { ...candidate, label, target, predicate, ...(qualifier ? { qualifier } : { qualifier: undefined }) };
}

function interpretationFor(
  caseFile: CaseFile,
  rawText: string,
  status: QuestionInterpretation["status"],
  candidateIds: string[],
): QuestionInterpretation {
  const candidates = candidateIds
    .map((id) => queryProjection(caseFile, id))
    .filter((item): item is QuestionCandidateProjection => Boolean(item))
    .map(publicQuestionCandidate);
  return {
    status,
    rawText,
    interpretedAs: status === "matched" ? candidates[0]?.label : undefined,
    candidates,
    requiresConfirmation: status === "ambiguous",
  };
}

function compactHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable public handles, not encryption: avalanche prevents common authoring suffixes implying rank. */
function opaqueIdentityHash(value: string): string {
  let hash = Number.parseInt(compactHash(value), 16);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0).toString(16).padStart(8, "0");
}

function routingCandidates(caseFile: CaseFile, state: Pick<RuntimeState, "replayMode"> & Partial<Pick<RuntimeState, "game">>) {
  if (state.replayMode === "no-scaffolds") return [];
  const initialIds = caseFile.surface?.initialQuestionPrompts ?? [];
  const orderedIds = [...initialIds, ...caseFile.questionSemantics.map((query) => query.id).filter((id) => !initialIds.includes(id))];
  return orderedIds.filter(id => !state.game || propositionVisible(caseFile, { game: state.game }, id))
    .map((id) => queryProjection(caseFile, id)).filter((item): item is QuestionCandidateProjection => Boolean(item));
}

/** Worker-owned historical public routing metadata, never supplied by a save or live request. */
export interface HistoricalQuestionRoutingContext {
  readonly sourceProfile: "v2.11-internal-rc" | "v2.12-internal-rc";
  readonly caseId: CaseFile["id"];
  readonly caseVersion: number;
  readonly contentHash: string;
  readonly candidates: readonly Readonly<QuestionCandidateProjection>[];
}

export interface ReplayValidationOptions {
  readonly historicalQuestionRoutingContexts?: readonly HistoricalQuestionRoutingContext[];
}

/** Capture only routing fields from an independently pinned historical presentation + alias profile. */
export function createQuestionRoutingReplayContext(
  caseFile: CaseFile,
  sourceProfile: HistoricalQuestionRoutingContext["sourceProfile"],
): HistoricalQuestionRoutingContext {
  return {
    sourceProfile,
    caseId: caseFile.id,
    caseVersion: caseFile.metadata?.contentVersion ?? 1,
    contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
    candidates: routingCandidates(caseFile, { replayMode: "standard" }),
  };
}

function questionRoutingContextHash(
  caseId: string,
  version: number,
  hash: string,
  replayMode: RuntimeState["replayMode"],
  raw: string,
  candidates: readonly Readonly<QuestionCandidateProjection>[],
): string {
  return compactHash(JSON.stringify({
    caseId, version, hash, replayMode, raw,
    candidates: candidates.map((item) => [item.queryId, item.label, item.target, item.predicate, item.qualifier ?? ""]),
  }));
}

/** Builds a truth-free routing offer. Opaque tokens, not query ids, are sent to AI. */
export function createQuestionRoutingOffer(caseFile: CaseFile, state: RuntimeState, rawQuestion: string): QuestionRoutingOffer {
  const raw = rawQuestion.trim();
  const candidates = routingCandidates(caseFile, state);
  const contextHash = questionRoutingContextHash(caseFile.id, caseFile.metadata?.contentVersion ?? 1,
    caseFile.metadata?.canonicalHash ?? "unversioned", state.replayMode, raw, candidates);
  const bindings = candidates.map((candidate, index) => ({
    token: `candidate-${String(index + 1).padStart(2, "0")}-${compactHash(`${contextHash}:${candidate.queryId}`).slice(0, 4)}`,
    queryId: candidate.queryId,
  }));
  const publicCandidates = candidates.map(publicQuestionCandidate);
  return {
    context: {
      contextHash,
      language: "zh-CN",
      publicSurface: translate(caseFile, caseFile.surface?.textKey, "一件无法解释的事件等待调查。"),
      rawQuestion: raw,
      candidates: publicCandidates.map((candidate, index) => ({
        token: bindings[index].token,
        label: candidate.label,
        target: candidate.target,
        predicate: candidate.predicate,
        ...(candidate.qualifier ? { qualifier: candidate.qualifier } : {}),
      })),
    },
    bindings,
  };
}

function matchesHistoricalQuestionRoutingContext(
  caseFile: CaseFile,
  state: RuntimeState,
  command: Extract<GameCommand, { type: "ask_resolved_text" }>,
  offer: QuestionRoutingOffer,
  options?: ReplayValidationOptions,
): boolean {
  if (!/^[0-9a-f]{8}$/.test(command.contextHash) || state.replayMode === "no-scaffolds") return false;
  const currentIds = new Set(caseFile.questionSemantics.map(query => query.id));
  return options?.historicalQuestionRoutingContexts?.some((historical) => {
    if (!["v2.11-internal-rc", "v2.12-internal-rc"].includes(historical.sourceProfile) || historical.caseId !== caseFile.id
      || historical.caseVersion !== (caseFile.metadata?.contentVersion ?? 1)
      || historical.contentHash !== (caseFile.metadata?.canonicalHash ?? "unversioned")) return false;
    const historicalIds = new Set(historical.candidates.map((candidate) => candidate.queryId));
    if (historicalIds.size !== historical.candidates.length || historicalIds.size !== currentIds.size
      || !historicalIds.has(command.queryId) || ![...historicalIds].every((id) => currentIds.has(id))) return false;
    return questionRoutingContextHash(historical.caseId, historical.caseVersion, historical.contentHash,
      state.replayMode, command.rawText.trim(), historical.candidates) === command.contextHash;
  }) ?? false;
}

function answerText(caseFile: CaseFile, code: AnswerCode): string {
  const template = caseFile.answerPolicy.templates?.[code];
  return template ?? `${ANSWER_LABELS[code]}。`;
}

function evidenceTitle(caseFile: CaseFile, evidence: EvidenceItem): string {
  return translate(caseFile, evidence.titleKey, evidence.id);
}

function evidenceObservation(caseFile: CaseFile, evidence: EvidenceItem): string {
  return translate(caseFile, evidence.observationKey, "这条记录需要进一步检查。 ");
}

function sourceLabel(caseFile: CaseFile, evidence: EvidenceItem): string {
  if (evidence.sourceLabelKey) return translate(caseFile, evidence.sourceLabelKey, "证据来源");
  const id = evidence.id;
  if (id.includes("cctv") || id.includes("recording") || id.includes("log")) return "记录来源";
  if (id.includes("door") || id.includes("tray") || id.includes("phone") || id.includes("sample")) return "现场物证";
  return "推理结论";
}

function initialEvidenceStates(caseFile: CaseFile): Record<string, EvidencePlayerState> {
  return Object.fromEntries(
    caseFile.evidenceItems
      .filter((item) => item.defaultState === "discovered")
      .map((item) => [item.id, "discovered" as const]),
  );
}

export function createRuntimeState(caseFile: CaseFile, initialDraftOrder?: "opaque", investigationRevision?: "m2"): RuntimeState {
  const authoredHypotheses = caseFile.hypotheses.map((hypothesis) => hypothesis.id);
  if (initialDraftOrder === "opaque") authoredHypotheses.sort((left, right) => publicHypothesisId(caseFile, left).localeCompare(publicHypothesisId(caseFile, right)));
  const legacyC01 = initialDraftOrder !== "opaque" && caseFile.id === "c01-cold-room-knock";
  const firstHypothesis = legacyC01 ? "hypothesis-fang-entered" : (authoredHypotheses[0] ?? "hypothesis-canonical");
  const secondHypothesis = legacyC01 ? "hypothesis-guard-faked" : (authoredHypotheses[1] ?? firstHypothesis);
  return {
    ...(investigationRevision ? { investigationRevision, explicitExplanationChoices: {}, transcriptQueryIds: [] } : {}),
    ...(initialDraftOrder ? { initialDraftOrder } : {}),
    game: createInitialState(caseFile),
    transcript: [],
    evidenceStates: initialEvidenceStates(caseFile),
    theoryDrafts: [
      { id: "theory-a", title: "主假设", hypothesisId: investigationRevision ? "" : firstHypothesis, eventIds: [], evidenceIds: [] },
      { id: "theory-b", title: "备选假设", hypothesisId: investigationRevision ? "" : secondHypothesis, eventIds: [], evidenceIds: [] },
    ],
    activeTheoryId: "theory-a",
    solved: false,
    replayBeatIds: [],
    acceptedCommandCount: 0,
    unlockedChapterIds: unlockedChapterIds(caseFile, createInitialState(caseFile)),
    reasoningBoards: Object.fromEntries((caseFile.reasoningBoards ?? []).map((_, index) => [
      `board-${String(index + 1).padStart(2, "0")}`,
      { placements: {}, connections: [] } satisfies ReasoningBoardDraft,
    ])),
    replayMode: "standard",
  };
}

function requirementListMet(actual: string[], required: string[] | undefined): boolean {
  return (required ?? []).every((id) => actual.includes(id));
}

function unlockedChapterIds(caseFile: CaseFile, game: GameState): string[] {
  return (caseFile.chapters ?? []).filter((chapter) => {
    const unlock = chapter.unlock ?? {};
    return requirementListMet(game.discoveredEvidenceIds, unlock.discoveredEvidenceIds)
      && requirementListMet(game.visitedLocationIds, unlock.visitedLocationIds)
      && requirementListMet(game.answeredQueryIds, unlock.answeredQueryIds);
  }).map((chapter) => chapter.id);
}

function publicBoardId(caseFile: CaseFile, internalId: string): string | undefined {
  const index = (caseFile.reasoningBoards ?? []).findIndex((board) => board.id === internalId);
  return index < 0 ? undefined : `board-${String(index + 1).padStart(2, "0")}`;
}

function internalBoard(caseFile: CaseFile, publicId: string) {
  const index = Number(publicId.match(/^board-(\d+)$/)?.[1] ?? 0) - 1;
  return index >= 0 ? caseFile.reasoningBoards?.[index] : undefined;
}

function publicSlotId(board: NonNullable<CaseFile["reasoningBoards"]>[number], internalId: string): string | undefined {
  const index = board.slots.findIndex((slot) => slot.id === internalId);
  return index < 0 ? undefined : `slot-${String(index + 1).padStart(2, "0")}`;
}

function internalSlot(board: NonNullable<CaseFile["reasoningBoards"]>[number], publicId: string) {
  const index = Number(publicId.match(/^slot-(\d+)$/)?.[1] ?? 0) - 1;
  return index >= 0 ? board.slots[index] : undefined;
}

function availableEvidenceIds(caseFile: CaseFile, state: RuntimeState): Set<string> {
  return new Set([
    ...state.game.discoveredEvidenceIds,
    ...getDiscoverableEvidenceIds(caseFile, state.game),
    ...Object.keys(state.evidenceStates),
  ]);
}

function projectedEvidence(caseFile: CaseFile, state: RuntimeState) {
  const available = availableEvidenceIds(caseFile, state);
  const discoverable = new Set(getDiscoverableEvidenceIds(caseFile, state.game));
  return caseFile.evidenceItems
    .filter((item) => available.has(item.id))
    .map((item) => {
      const explicit = state.evidenceStates[item.id];
      const playerState = explicit ?? (state.game.discoveredEvidenceIds.includes(item.id) ? "discovered" : "available");
      return {
        id: item.id,
        title: evidenceTitle(caseFile, item),
        observation: playerState === "available" ? "尚未检查。" : evidenceObservation(caseFile, item),
        state: playerState,
        sourceLabel: sourceLabel(caseFile, item),
        isNew: playerState === "discovered" || (playerState === "available" && discoverable.has(item.id)),
        visualAsset: typeof item.visualAsset === "string" ? item.visualAsset : undefined,
      };
    });
}

function referencedEntityIds(caseFile: CaseFile, state: RuntimeState): Set<string> {
  const ids = new Set<string>();
  for (const entity of caseFile.entities) {
    if (entity.publicAtStart === true) ids.add(entity.id);
  }
  const discovered = new Set(state.game.discoveredEvidenceIds);
  for (const evidence of caseFile.evidenceItems) {
    if (!discovered.has(evidence.id)) continue;
    for (const entityId of (evidence.relatedEntityIds ?? []) as string[]) ids.add(entityId);
    for (const factId of evidence.sourceFactIds ?? []) {
      const fact = caseFile.facts.find((item) => item.id === factId);
      const args = (fact?.args ?? {}) as Record<string, unknown>;
      for (const value of Object.values(args)) {
        if (typeof value === "string" && caseFile.entities.some((entity) => entity.id === value)) ids.add(value);
      }
    }
  }
  return ids;
}

function projectedLocations(caseFile: CaseFile, state: RuntimeState): LocationProjection[] {
  const referenced = referencedEntityIds(caseFile, state);
  return caseFile.entities
    .filter((entity) => entity.kind === "location" && referenced.has(entity.id))
    .map((entity) => ({
      id: entity.id,
      label: translate(caseFile, entity.labelKey, entity.id),
      visited: state.game.visitedLocationIds.includes(entity.id),
    }));
}

function eventTimeLabel(event: CaseFile["events"][number]): string {
  const time = event.time as { value?: string } | undefined;
  return time?.value ?? "时间待核对";
}

function projectedEventOptions(caseFile: CaseFile, state: RuntimeState): EventOptionProjection[] {
  const discoveredEvidence = new Set(state.game.discoveredEvidenceIds);
  const visibleEvents = new Set<string>();
  for (const evidence of caseFile.evidenceItems) {
    if (!discoveredEvidence.has(evidence.id)) continue;
    for (const eventId of evidence.sourceEventIds ?? []) visibleEvents.add(eventId);
    for (const factId of evidence.sourceFactIds ?? []) {
      const fact = caseFile.facts.find((item) => item.id === factId);
      for (const eventId of fact?.sourceEventIds ?? []) visibleEvents.add(eventId);
    }
  }

  return caseFile.events
    .filter((event) => visibleEvents.has(event.id))
    .sort((left, right) => publicEventId(caseFile, left.id).localeCompare(publicEventId(caseFile, right.id)))
    .map((event) => ({
      id: publicEventId(caseFile, event.id),
      timeLabel: eventTimeLabel(event),
      label: String(event.action) === "alarm-vibrates-against-tray" && !state.game.visibleFactIds.includes("fact-phone-inside")
        ? "某个物体有规律地撞击托盘"
        : translate(caseFile, event.labelKey, EVENT_ACTION_LABELS[String(event.action)] ?? String(event.action ?? "已知事件")),
    }));
}

function projectedTheoryOptions(caseFile: CaseFile, state: RuntimeState): TheoryOptionProjection[] {
  const m2 = investigationM2(caseFile, state);
  const policy = explanationPolicy(caseFile, state);
  const chosen = new Set(state.theoryDrafts.filter(d => state.explicitExplanationChoices?.[d.id]).map(d => d.hypothesisId));
  const intentVisible = state.game.visibleFactIds.includes("fact-lin-intent-delay");
  const interpretationVisible = state.solved || (caseFile.solutionCertificate.requiredFactIds.length > 0
    && caseFile.solutionCertificate.requiredFactIds.every((id) => state.game.visibleFactIds.includes(id)));
  return [...caseFile.hypotheses]
    .filter(hypothesis => !m2 || policy.ready || chosen.has(hypothesis.id))
    .sort((left, right) => publicHypothesisId(caseFile, left.id).localeCompare(publicHypothesisId(caseFile, right.id)))
    .map((hypothesis, index) => {
    const motiveKey = String(hypothesis.claim?.motiveKey ?? "");
    const motiveVisible = interpretationVisible || (caseFile.id === "c01-cold-room-knock" && intentVisible);
    return {
      id: publicHypothesisId(caseFile, hypothesis.id),
      label: m2 && !state.solved ? policy.labels?.[hypothesis.id] ?? (interpretationVisible ? translate(caseFile, hypothesis.labelKey, HYPOTHESIS_LABELS[hypothesis.id] ?? "待验证理论") : "此前选择的解释（继续核对材料）") : !interpretationVisible
        ? `待验证解释 ${index + 1}（先整理证据）`
        : translate(caseFile, hypothesis.labelKey, HYPOTHESIS_LABELS[hypothesis.id] ?? "待验证理论"),
      motiveOptions: motiveKey && motiveVisible && (!(caseFile.proofRevision || state.proofWorkspace) || translate(caseFile, `motive.${motiveKey}`, MOTIVE_LABELS[motiveKey] ?? '') !== '')
        ? [{ id: motiveKey, label: translate(caseFile, `motive.${motiveKey}`, MOTIVE_LABELS[motiveKey] ?? "未知动机") }]
        : [],
    };
  });
}

function replayProjection(caseFile: CaseFile, state: RuntimeState) {
  const selected = new Set(state.replayBeatIds);
  return caseFile.proofReplay
    .filter((beat) => selected.has(beat.id))
    .map((beat) => {
      const event = caseFile.events.find((item) => item.id === beat.eventId);
      const evidenceTitles = caseFile.evidenceItems
        .filter((item) => (item.sourceFactIds ?? []).some((factId) => beat.factIds.includes(factId)))
        .map((item) => evidenceTitle(caseFile, item));
      return {
        id: beat.id,
        timeLabel: event ? eventTimeLabel(event) : "未知时间",
        caption: translate(caseFile, beat.captionKey, EVENT_ACTION_LABELS[String(event?.action)] ?? "事件成立"),
        evidenceTitles,
      };
    });
}

function debrief(caseFile: CaseFile, state: RuntimeState): DebriefReport | undefined {
  if (!state.solved) return undefined;
  const required = caseFile.solutionCertificate.requiredEvidenceIds;
  const active = state.theoryDrafts.find((item) => item.id === state.activeTheoryId);
  const submitted = new Set(active?.evidenceIds ?? []);
  const complete = required.filter((id) => submitted.has(id)).length;
  return {
    proofCompleteness: required.length === 0 ? 100 : Math.round((complete / required.length) * 100),
    questionCount: state.transcript.length,
    repeatedQuestionCount: state.transcript.filter((item) => item.repeated).length,
    verifiedEvidenceCount: Object.values(state.evidenceStates).filter((value) => value === "verified" || value === "connected").length,
    contradictionCount: caseFile.solutionCertificate.requiredContradictionResolutionIds.length,
    unlockedReplayMode: "limited-questions",
  };
}

export function projectPlayerState(caseFile: CaseFile, state: RuntimeState): PlayerProjection {
  const m2 = investigationM2(caseFile, state);
  const evidence = projectedEvidence(caseFile, state);
  const visibleEvidence = new Set(evidence.map(item => item.id));
  const policy = explanationPolicy(caseFile, state);
  const title = translate(caseFile, caseFile.surface?.titleKey ?? caseFile.metadata?.titleKey, "未命名案件");
  const surface = translate(caseFile, caseFile.surface?.textKey, "一件无法解释的事件等待调查。");
  const initialIds = caseFile.surface?.initialQuestionPrompts ?? [];
  const orderedQueries = [
    ...initialIds,
    ...caseFile.questionSemantics.map((query) => query.id).filter((id) => !initialIds.includes(id)),
  ];
  const questionScaffolds = state.replayMode === "no-scaffolds" ? [] : orderedQueries
    .filter(id => propositionVisible(caseFile, state, id))
    .map((id) => queryProjection(caseFile, id))
    .filter((item): item is QuestionCandidateProjection => Boolean(item))
    .map(publicQuestionCandidate);
  const active = state.theoryDrafts.find((item) => item.id === state.activeTheoryId);
  const interpretation = state.pendingInterpretation
    ? { ...interpretationFor(state.pendingInterpretation.resolverRevision ? caseFile : { ...caseFile, questionLanguageRevision: undefined }, state.pendingInterpretation.rawText, "ambiguous", state.pendingInterpretation.candidateQueryIds),
      ...(state.pendingInterpretation.explanation ? { explanation: state.pendingInterpretation.explanation } : {}) }
    : undefined;

  return {
    ...(m2 ? { investigationRevision: "m2" as const, explanationPreparation: { ready: policy.ready, evidenceIds: policy.remainingEvidenceIds.filter(id => visibleEvidence.has(id)) } } : {}),
    ...(caseFile.proofRevision || state.proofWorkspace ? {proofRevision: 'm3' as const,
      canUndoProofEdit: Boolean(state.proofWorkspace?.history?.[state.activeTheoryId]?.length),
      previousVerifiedProof: state.proofWorkspace?.archive,
      proofFeedback: state.proofWorkspace?.feedback?.[state.activeTheoryId],
    } : {}),
    case: {
      id: caseFile.id,
      version: caseFile.metadata?.contentVersion ?? 1,
      contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
      title,
      surface,
      difficulty: caseFile.metadata?.difficulty ?? "unknown",
      targetMinutes: caseFile.metadata?.targetMinutes ?? DEFAULT_TARGET_MINUTES,
      contentTags: caseFile.metadata?.contentTags ?? [],
      presentation: caseFile.presentation ?? DEFAULT_PRESENTATION,
      presentationRevision: typeof caseFile.metadata?.presentationRevision === "number" ? caseFile.metadata.presentationRevision : undefined,
      presentationPatchHash: typeof caseFile.metadata?.presentationPatchHash === "string" ? caseFile.metadata.presentationPatchHash : undefined,
    },
    transcript: m2 ? state.transcript.map((entry, index) => {
      const query = caseFile.questionSemantics.find(item => item.id === state.transcriptQueryIds?.[index]);
      const facts = new Set(query?.supportingFactIds ?? []);
      return { ...entry, relatedEvidenceIds: caseFile.evidenceItems.filter(item => visibleEvidence.has(item.id)
        && item.sourceFactIds?.some(id => facts.has(id))).map(item => item.id) };
    }) : state.transcript,
    interpretation,
    evidence,
    locations: projectedLocations(caseFile, state),
    questionScaffolds,
    eventOptions: projectedEventOptions(caseFile, state),
    theoryOptions: projectedTheoryOptions(caseFile, state),
    theoryDrafts: state.theoryDrafts.map((draft) => ({
      ...draft,
      hypothesisId: m2 && !state.solved && !state.explicitExplanationChoices?.[draft.id] ? "" : draft.hypothesisId ? publicHypothesisId(caseFile, draft.hypothesisId) : "",
      eventIds: draft.eventIds.map((eventId) => publicEventId(caseFile, eventId)),
    })),
    activeTheoryId: state.activeTheoryId,
    canSubmit: Boolean(active && (!m2 || state.explicitExplanationChoices?.[active.id]) && active.eventIds.length > 0 && active.evidenceIds.length > 0),
    solved: state.solved,
    replay: replayProjection(caseFile, state),
    debrief: debrief(caseFile, state),
    chapters: (caseFile.chapters ?? []).map((chapter, index) => ({
      id: `chapter-${String(index + 1).padStart(2, "0")}`,
      title: translate(caseFile, chapter.titleKey, `调查阶段 ${index + 1}`),
      unlocked: state.unlockedChapterIds.includes(chapter.id),
    })),
    reasoningBoards: (caseFile.reasoningBoards ?? []).map((board, boardIndex) => {
      const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
      const draft = boardsFor(state)[boardId] ?? { placements: {}, connections: [] };
      return {
        id: boardId,
        title: translate(caseFile, board.titleKey, "推理板"),
        mode: board.mode,
        slots: board.slots.map((slot, slotIndex) => {
          const slotId = `slot-${String(slotIndex + 1).padStart(2, "0")}`;
          return { id: slotId, label: translate(caseFile, slot.labelKey, `步骤 ${slotIndex + 1}`), itemId: draft.placements[slotId] };
        }),
        items: projectedEventOptions(caseFile, state),
        connections: draft.connections,
        allowedRelations: board.allowedRelations ?? ["causes", "precedes", "explains"],
        behavior: reasoningBoardBehavior(
          board.mode,
          caseFile.id === "c60-last-sample-before-stop" && board.mode === "signal-chain" ? "terminal" : "standard",
        ),
      };
    }),
    replayMode: state.replayMode,
    replayChallenges: caseFile.replayChallenges ?? [],
  };
}

function rejected(caseFile: CaseFile, state: RuntimeState, message: string): RuntimeResult {
  return {
    state,
    projection: projectPlayerState(caseFile, state),
    events: [{ type: "command_rejected", message }],
    accepted: false,
  };
}

function accepted(caseFile: CaseFile, state: RuntimeState, events: GameEvent[]): RuntimeResult {
  const unlocked = unlockedChapterIds(caseFile, state.game);
  const chapterEvents: GameEvent[] = unlocked
    .filter((id) => !state.unlockedChapterIds.includes(id))
    .map((chapterId) => ({ type: "chapter_unlocked", chapterId }));
  const next = { ...state, unlockedChapterIds: unlocked, acceptedCommandCount: state.acceptedCommandCount + 1 };
  return { state: next, projection: projectPlayerState(caseFile, next), events: [...events, ...chapterEvents], accepted: true };
}

function missingBoardObligation(caseFile: CaseFile, state: RuntimeState): ProofObligationKind | undefined {
  for (const obligation of caseFile.solutionCertificate.proofObligations ?? []) {
    const boardId = publicBoardId(caseFile, obligation.boardId);
    const board = caseFile.reasoningBoards?.find((item) => item.id === obligation.boardId);
    if (!boardId || !board) return obligation.failureCategory;
    const draft = state.reasoningBoards[boardId];
    if (!draft) return obligation.failureCategory;
    for (const placement of obligation.requiredPlacements ?? []) {
      const slotId = publicSlotId(board, placement.slotId);
      if (!slotId || draft.placements[slotId] !== publicEventId(caseFile, placement.eventId)) return obligation.failureCategory;
    }
    for (const connection of obligation.requiredConnections ?? []) {
      const fromItemId = publicEventId(caseFile, connection.fromEventId);
      const toItemId = publicEventId(caseFile, connection.toEventId);
      if (!draft.connections.some((item) => item.fromItemId === fromItemId && item.toItemId === toItemId && item.relation === connection.relation)) return obligation.failureCategory;
    }
  }
  return undefined;
}

const BOARD_GAPS: Record<ProofObligationKind, string> = {
  time: "时间关系仍未在推理板上闭合。",
  space: "空间路径仍有一个必要环节没有证明。",
  source: "记录来源与事件之间仍缺少连接。",
  identity: "角色、对象或人物的对应关系仍未闭合。",
  measurement: "测量值与基准条件仍未闭合。",
  "state-transition": "状态改变的触发条件仍未闭合。",
  "alternative-exclusion": "仍有一条替代路径没有被推理板排除。",
};

const FEEDBACK_KEYS: Record<ProofObligationKind, string> = {
  time: "missing-time",
  space: "missing-space",
  source: "missing-source",
  identity: "missing-identity",
  measurement: "missing-measurement",
  "state-transition": "missing-state",
  "alternative-exclusion": "missing-alternative",
};

function boardGapText(caseFile: CaseFile, kind: ProofObligationKind): string {
  return translate(caseFile, `__presentation_patch.feedback.${FEEDBACK_KEYS[kind]}`, BOARD_GAPS[kind]);
}

function withDraft(state: RuntimeState, theoryId: TheoryDraft["id"], update: (draft: TheoryDraft) => TheoryDraft): RuntimeState | undefined {
  if (!state.theoryDrafts.some((draft) => draft.id === theoryId)) return undefined;
  return {
    ...state,
    theoryDrafts: state.theoryDrafts.map((draft) => draft.id === theoryId ? update(draft) : draft),
  };
}

/** Feedback identifies a workspace to revisit, never the hidden required item or relation. */
function proofFeedbackM3(file: CaseFile, state: RuntimeState): ProofFeedback {
  const draft=state.theoryDrafts.find(d=>d.id===state.activeTheoryId)!;
  const feedback=(message:string,nextStep:ProofFeedback['nextStep'],boardId?:string):ProofFeedback=>({message,nextStep,boardId,stale:false});
  if (!draft.hypothesisId) return feedback('先主动选择一个暂定解释，再检验它。你的原稿和证据仍在。','claim');
  const judged=judgeTheory(file,state.game,draft);
  if (judged.judgement==='invalidated') return feedback('这个解释与已经核实的事实有冲突。回到暂定解释，对照材料比较其他可能；原稿会保留。','claim');
  const publicBoards=projectPlayerState(file,state).reasoningBoards;
  const empty=publicBoards.find(b=>b.slots.some(s=>!s.itemId));
  if (empty) return feedback(`“${empty.title.replace(/\s*[·•]\s*[a-z-]+$/u,'')}”还有未整理的位置。检查哪些公开事件与这些位置有关。`,'board',empty.id);
  if (!draft.eventIds.length) return feedback('事件链里还没有片段。选入与你的解释有关的公开事件。','chain');
  if (judged.missingFactIds.length) return feedback('还有事实未通过调查核实。回到公开材料，检查来源并继续提问。','evidence');
  if (judged.missingEvidenceIds.length || !draft.evidenceIds.length) return feedback('当前证明还缺少材料支撑。核对已经检查的材料，把相关证据接入这份假设。','proof');
  if (judged.missingContradictionResolutionIds.length) return feedback('仍有其他解释没有排除。检查当前材料能否反驳它们，并补充相应证据。','proof');
  if (judged.missingMotiveKey) return feedback('这份解释还没有说明驱动条件。核对证据，再选择它为何会这样发生。','proof');
  for (const obligation of file.solutionCertificate.proofObligations ?? []) {
    const gap=missingBoardObligation({...file,solutionCertificate:{...file.solutionCertificate,proofObligations:[obligation]}},state);
    if (gap) return feedback(`${boardGapText(file,gap)} 核对这张板上的事件、方向和关系类型，再提交检验。`,'board',publicBoardId(file,obligation.boardId));
  }
  if (judged.judgement==='plausible') return feedback('当前解释还不能排除其他可能。回到暂定解释，对照已有材料继续比较。','claim');
  return feedback('当前事件链的顺序或片段还不足以证明解释。对照公开时间和前后条件，检查遗漏与先后。','chain');
}

function answerQuery(caseFile: CaseFile, state: RuntimeState, queryId: string, rawText: string): RuntimeResult {
  const candidate = queryProjection(caseFile, queryId);
  if (!candidate) return rejected(caseFile, state, "这个解释已经不在当前案件中。 ");
  const repeated = state.game.answeredQueryIds.includes(queryId);
  const result = askQuestion(caseFile, state.game, queryId);
  const entry: TranscriptEntry = {
    id: `q-${state.transcript.length + 1}`,
    rawQuestion: rawText,
    interpretedAs: candidate.label,
    answerCode: result.code,
    answerText: answerText(caseFile, result.code),
    repeated,
  };
  const next: RuntimeState = {
    ...state,
    game: result.state,
    transcript: [...state.transcript, entry],
    ...(investigationM2(caseFile, state) ? { transcriptQueryIds: [...(state.transcriptQueryIds ?? []), queryId] } : {}),
    pendingInterpretation: undefined,
    lastQuestionSnapshot: {
      game: { ...state.game, discoveredEvidenceIds: [...state.game.discoveredEvidenceIds], visitedLocationIds: [...state.game.visitedLocationIds], answeredQueryIds: [...state.game.answeredQueryIds], activeRuleIds: [...state.game.activeRuleIds], visibleFactIds: [...state.game.visibleFactIds] },
      transcriptLength: state.transcript.length,
    },
  };
  return accepted(caseFile, next, [{ type: "question_answered", entry }]);
}

export function reduceGameCommand(caseFile: CaseFile, state: RuntimeState, command: GameCommand): RuntimeResult {
  return reduceCommand(caseFile, state, command);
}

/** Compatibility authority is only passed by saved-log replay, never by the live reducer. */
function reduceCommand(caseFile: CaseFile, state: RuntimeState, command: GameCommand, replayOptions?: ReplayValidationOptions): RuntimeResult {
  if (command.type === 'proof_action' || command.type === 'edit_proof' || command.type === 'undo_proof_edit') return reduceProofCommand(caseFile,state,command,{
    reduce: (file,current,action) => reduceCommand(file,current,action,replayOptions), project:projectPlayerState,
    eventId:internalEventId, publicEventId,
    feedback: proofFeedbackM3,
    chapters: (file,current) => unlockedChapterIds(file,current.game),
    validProof: (file,current) => {
      const draft = current.theoryDrafts.find(d => d.id === current.activeTheoryId);
      return Boolean(draft && (!current.investigationRevision || current.explicitExplanationChoices?.[draft.id]) && judgeTheory(file,current.game,draft).judgement === 'solved'
        && !missingBoardObligation(file,current));
    },
  });
  if (command.type === "begin_investigation") {
    if (command.revision !== "m2") return rejected(caseFile, state, "无法读取调查版本。");
    const next = createRuntimeState(caseFile, "opaque", "m2");
    return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "case_started" }], accepted: true };
  }
  if (command.type === "set_theory_note") {
    if (command.revision !== "m2" || command.text.length > 4000) return rejected(caseFile, state, "暂定解释过长或版本不匹配。");
    const next = withDraft(state, command.theoryId, draft => ({ ...draft, note: command.text }));
    // Notes have no gameplay effects. Consecutive edits can be compacted in the saved log.
    return next ? { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "theory_updated", theoryId: command.theoryId }], accepted: true }
      : rejected(caseFile, state, "未知的理论草稿。");
  }
  if (command.type === "clear_explanation") {
    if (command.revision !== "m2") return rejected(caseFile, state, "无法读取调查版本。");
    const next = withDraft(state, command.theoryId, draft => ({...draft,hypothesisId:"",motiveKey:undefined}));
    if (!next) return rejected(caseFile, state, "未知的理论草稿。");
    const choices = {...state.explicitExplanationChoices};
    delete choices[command.theoryId];
    return accepted(caseFile,{...next,explicitExplanationChoices:choices},[{type:"theory_updated",theoryId:command.theoryId}]);
  }
  if (command.type === "start_case") {
    const next = createRuntimeState(caseFile, command.initialDraftOrder);
    return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "case_started" }], accepted: true };
  }
  if (command.type === "restart_case") {
    const next = createRuntimeState(caseFile, state.initialDraftOrder, state.investigationRevision);
    return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "case_started" }], accepted: true };
  }

  if (command.type === "dismiss_interpretation") {
    if (!state.pendingInterpretation || command.rawText !== state.pendingInterpretation.rawText) return rejected(caseFile, state, "这个问题已经不在等待确认。");
    return accepted(caseFile, { ...state, pendingInterpretation: undefined }, [{ type: "interpretation_dismissed" }]);
  }

  if (command.type === "ask_proposition" || command.type === "confirm_proposition") {
    if (command.resolverRevision !== "m01" || !command.rawText.trim()) return rejected(caseFile, state, "无法读取这个问题的解释版本。");
    const rawText = command.rawText.trim();
    const normalized = resolvePropositionM01(caseFile, rawText);
    if (command.type === "ask_proposition" && (command.queryId !== normalized.queryId
      || JSON.stringify(command.candidateQueryIds) !== JSON.stringify(normalized.candidateQueryIds))) return rejected(caseFile, state, "问题身份与原句不一致。");
    if (command.type === "confirm_proposition") {
      const pending = state.pendingInterpretation;
      if (!pending || pending.resolverRevision !== "m01" || pending.rawText !== rawText || normalized.status !== "ambiguous"
        || !normalized.candidateQueryIds.includes(command.queryId) || !pending.candidateQueryIds.includes(command.queryId)) return rejected(caseFile, state, "这个解释不属于当前待确认问题。");
    }
    if (state.replayMode === "limited-questions") {
      const limit = caseFile.replayChallenges?.find(item => item.mode === "limited-questions")?.questionLimit ?? 12;
      if (state.transcript.length >= limit) return rejected(caseFile, state, `限定问题挑战最多允许 ${limit} 次有效提问。`);
    }
    if (command.queryId) return answerQuery({ ...caseFile, questionLanguageRevision: "m01" }, state, command.queryId, rawText);
    const interpretation = { ...interpretationFor(caseFile, rawText, normalized.status, normalized.candidateQueryIds), explanation: normalized.explanation };
    if (normalized.status === "ambiguous") {
      const next: RuntimeState = { ...state, pendingInterpretation: { rawText, candidateQueryIds: normalized.candidateQueryIds, resolverRevision: "m01", explanation: normalized.explanation } };
      return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "interpretation_required", interpretation }], accepted: false };
    }
    const next = { ...state, pendingInterpretation: undefined };
    return { state: next, projection: projectPlayerState(caseFile, next), events: [...(state.pendingInterpretation ? [{ type: "interpretation_dismissed" as const }] : []), { type: "question_rejected", interpretation }], accepted: false };
  }

  if (command.type === "ask_text") {
    const rawText = command.rawText.trim();
    if (!rawText) return rejected(caseFile, state, "先写下一个可以验证的事实问题。 ");
    if (state.replayMode === "limited-questions") {
      const limit = caseFile.replayChallenges?.find((item) => item.mode === "limited-questions")?.questionLimit ?? 12;
      if (state.transcript.length >= limit) return rejected(caseFile, state, `限定问题挑战最多允许 ${limit} 次有效提问。`);
    }
    const normalized = normalizeQuestion(caseFile, rawText);
    if (normalized.status === "matched" && normalized.queryId) return answerQuery({ ...caseFile, questionLanguageRevision: undefined }, state, normalized.queryId, rawText);
    const interpretation = interpretationFor(caseFile, rawText, normalized.status, normalized.candidateQueryIds);
    if (normalized.status === "ambiguous") {
      const next = { ...state, pendingInterpretation: { rawText, candidateQueryIds: normalized.candidateQueryIds } };
      return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "interpretation_required", interpretation }], accepted: false };
    }
    return { state, projection: projectPlayerState(caseFile, state), events: [{ type: "question_rejected", interpretation }], accepted: false };
  }

  if (command.type === "ask_resolved_text") {
    const rawText = command.rawText.trim();
    if (!rawText || command.resolutionSource !== "ai-confirmed") return rejected(caseFile, state, "AI 问题解释无效。 ");
    if (state.replayMode === "no-scaffolds") return rejected(caseFile, state, "无辅助挑战中不能使用 AI 问题解释。 ");
    const offer = createQuestionRoutingOffer(caseFile, state, rawText);
    const allowed = offer.bindings.some((binding) => binding.queryId === command.queryId);
    const currentContext = offer.context.contextHash === command.contextHash;
    if (!(allowed && currentContext) && !matchesHistoricalQuestionRoutingContext(caseFile, state, command, offer, replayOptions)) {
      return rejected(caseFile, state, "问题解释已经过期或不属于当前公开候选。 ");
    }
    if (state.replayMode === "limited-questions") {
      const limit = caseFile.replayChallenges?.find((item) => item.mode === "limited-questions")?.questionLimit ?? 12;
      if (state.transcript.length >= limit) return rejected(caseFile, state, `限定问题挑战最多允许 ${limit} 次有效提问。`);
    }
    return answerQuery(caseFile, state, command.queryId, rawText);
  }

  if (command.type === "confirm_interpretation") {
    const pending = state.pendingInterpretation;
    if (pending?.resolverRevision) return rejected(caseFile, state, "请使用当前版本的问题确认。");
    const rawText = command.rawText?.trim() ?? pending?.rawText;
    if (!rawText || (pending && pending.rawText !== rawText)) return rejected(caseFile, state, "这个解释不属于当前待确认问题。 ");
    const normalized = normalizeQuestion(caseFile, rawText);
    if (normalized.status !== "ambiguous" || !normalized.candidateQueryIds.includes(command.queryId)
      || (pending && !pending.candidateQueryIds.includes(command.queryId))) return rejected(caseFile, state, "这个解释不属于当前待确认问题。 ");
    if (state.replayMode === "limited-questions") {
      const limit = caseFile.replayChallenges?.find((item) => item.mode === "limited-questions")?.questionLimit ?? 12;
      if (state.transcript.length >= limit) return rejected(caseFile, state, `限定问题挑战最多允许 ${limit} 次有效提问。`);
    }
    return answerQuery({ ...caseFile, questionLanguageRevision: undefined }, state, command.queryId, rawText);
  }

  if (command.type === "undo_last_question") {
    if (!state.lastQuestionSnapshot || state.transcript.length === 0) return rejected(caseFile, state, "没有可以撤销的问题。 ");
    const next: RuntimeState = {
      ...state,
      game: state.lastQuestionSnapshot.game,
      transcript: state.transcript.slice(0, state.lastQuestionSnapshot.transcriptLength),
      ...(state.transcriptQueryIds ? { transcriptQueryIds: state.transcriptQueryIds.slice(0, state.lastQuestionSnapshot.transcriptLength) } : {}),
      lastQuestionSnapshot: undefined,
      pendingInterpretation: undefined,
    };
    return accepted(caseFile, next, [{ type: "question_undone" }]);
  }

  if (command.type === "visit_location") {
    if (!projectedLocations(caseFile, state).some((location) => location.id === command.locationId)) {
      return rejected(caseFile, state, "这个地点还没有出现在调查记录中。 ");
    }
    const result = visitLocation(caseFile, state.game, command.locationId);
    if (!result.accepted) return rejected(caseFile, state, "当前无法检查这个地点。 ");
    return accepted(caseFile, { ...state, game: result.state }, [{ type: "location_visited", locationId: command.locationId }]);
  }

  if (command.type === "set_evidence_state") {
    const available = availableEvidenceIds(caseFile, state);
    if (!available.has(command.evidenceId)) return rejected(caseFile, state, "这件证据尚未出现。 ");
    let game = state.game;
    if (!game.discoveredEvidenceIds.includes(command.evidenceId) && command.state !== "available" && command.state !== "dismissed") {
      const discovery = discoverEvidence(caseFile, game, command.evidenceId);
      if (!discovery.accepted) return rejected(caseFile, state, "这件证据还不能被确认。 ");
      game = discovery.state;
    }
    const next = {
      ...state,
      game,
      evidenceStates: { ...state.evidenceStates, [command.evidenceId]: command.state },
    };
    return accepted(caseFile, next, [{ type: "evidence_updated", evidenceId: command.evidenceId, state: command.state }]);
  }

  if (command.type === "select_theory") {
    if (!state.theoryDrafts.some((draft) => draft.id === command.theoryId)) return rejected(caseFile, state, "未知的理论草稿。 ");
    return accepted(caseFile, { ...state, activeTheoryId: command.theoryId }, [{ type: "theory_updated", theoryId: command.theoryId }]);
  }

  if (command.type === "set_theory_hypothesis" || command.type === "choose_explanation") {
    if (command.type === "choose_explanation" && (command.revision !== "m2" || !projectedTheoryOptions(caseFile, state).some(option => option.id === command.hypothesisId))) {
      return rejected(caseFile, state, "先检查公开材料，再主动选择一个可比较的解释。");
    }
    const hypothesisId = internalHypothesisId(caseFile, command.hypothesisId);
    if (!hypothesisId) return rejected(caseFile, state, "未知的理论路径。 ");
    const next = withDraft(state, command.theoryId, (draft) => ({ ...draft, hypothesisId, motiveKey: undefined }));
    return next ? accepted(caseFile, investigationM2(caseFile, state) || command.type === "choose_explanation"
      ? { ...next, explicitExplanationChoices: { ...next.explicitExplanationChoices, [command.theoryId]: true } } : next,
      [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "upsert_theory_event") {
    const internalId = internalEventId(caseFile, command.eventId);
    if (!internalId || !projectedEventOptions(caseFile, state).some((item) => item.id === publicEventId(caseFile, internalId))) return rejected(caseFile, state, "这个事件还没有证据支持。 ");
    const next = withDraft(state, command.theoryId, (draft) => {
      const without = draft.eventIds.filter((id) => id !== internalId);
      const index = Math.max(0, Math.min(command.index ?? without.length, without.length));
      return { ...draft, eventIds: [...without.slice(0, index), internalId, ...without.slice(index)] };
    });
    return next ? accepted(caseFile, next, [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "remove_theory_event") {
    const internalId = internalEventId(caseFile, command.eventId);
    if (!internalId) return rejected(caseFile, state, "未知的事件。 ");
    const next = withDraft(state, command.theoryId, (draft) => ({ ...draft, eventIds: draft.eventIds.filter((id) => id !== internalId) }));
    return next ? accepted(caseFile, next, [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "move_theory_event") {
    const internalId = internalEventId(caseFile, command.eventId);
    if (!internalId) return rejected(caseFile, state, "未知的事件。 ");
    const next = withDraft(state, command.theoryId, (draft) => {
      const currentIndex = draft.eventIds.indexOf(internalId);
      if (currentIndex < 0) return draft;
      const targetIndex = Math.max(0, Math.min(draft.eventIds.length - 1, currentIndex + command.direction));
      const eventIds = [...draft.eventIds];
      eventIds.splice(currentIndex, 1);
      eventIds.splice(targetIndex, 0, internalId);
      return { ...draft, eventIds };
    });
    return next ? accepted(caseFile, next, [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "link_theory_evidence") {
    if (!state.game.discoveredEvidenceIds.includes(command.evidenceId)) return rejected(caseFile, state, "先检查这件证据，再把它放进证明链。 ");
    const next = withDraft(state, command.theoryId, (draft) => ({
      ...draft,
      evidenceIds: command.linked
        ? [...new Set([...draft.evidenceIds, command.evidenceId])]
        : draft.evidenceIds.filter((id) => id !== command.evidenceId),
    }));
    if (!next) return rejected(caseFile, state, "未知的理论草稿。 ");
    next.evidenceStates = {
      ...next.evidenceStates,
      [command.evidenceId]: command.linked ? "connected" : "examined",
    };
    return accepted(caseFile, next, [
      { type: "evidence_updated", evidenceId: command.evidenceId, state: next.evidenceStates[command.evidenceId] },
      { type: "theory_updated", theoryId: command.theoryId },
    ]);
  }

  if (command.type === "set_theory_motive") {
    // Legacy logs could choose a motive before all observations were disclosed.
    // Continue accepting authored keys; new projections withhold premature copy.
    const allowed = caseFile.hypotheses.some((hypothesis) => hypothesis.claim?.motiveKey === command.motiveKey);
    if (command.motiveKey && !allowed) return rejected(caseFile, state, "这个驱动条件还没有足够证据。 ");
    const next = withDraft(state, command.theoryId, (draft) => ({ ...draft, motiveKey: command.motiveKey }));
    return next ? accepted(caseFile, next, [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "submit_theory" || command.type === "submit_investigation") {
    const draft = state.theoryDrafts.find((item) => item.id === command.theoryId);
    if (!draft) return rejected(caseFile, state, "未知的理论草稿。 ");
    if (command.type === "submit_investigation" && (command.revision !== "m2" || !state.explicitExplanationChoices?.[draft.id])) {
      return rejected(caseFile, state, "还没有主动选择解释。先比较公开材料支持的可能性。");
    }
    const judgement = judgeTheory(caseFile, state.game, {
      hypothesisId: draft.hypothesisId,
      eventIds: draft.eventIds,
      evidenceIds: draft.evidenceIds,
      motiveKey: draft.motiveKey,
    });
    const boardGap = judgement.judgement === "solved" ? missingBoardObligation(caseFile, state) : undefined;
    const solved = judgement.judgement === "solved" && !boardGap;
    const next = { ...state, activeTheoryId: draft.id, solved };
    const proofFailureCategory = boardGap ?? (judgement.missingContradictionResolutionIds.length > 0 ? "alternative-exclusion" : judgement.missingFactIds.length > 0 ? "source" : undefined);
    return accepted(caseFile, next, solved
      ? [{ type: "theory_judged", judgement: judgement.judgement, message: judgement.spoilerSafeGap }, { type: "case_solved" }]
      : [{ type: "theory_judged", judgement: boardGap ? "nearly_proven" : judgement.judgement, message: boardGap ? boardGapText(caseFile, boardGap) : judgement.spoilerSafeGap, ...(proofFailureCategory ? { proofFailureCategory } : {}) }]);
  }

  if (command.type === "place_reasoning_item") {
    const board = internalBoard(caseFile, command.boardId);
    const slot = board ? internalSlot(board, command.slotId) : undefined;
    const internalEvent = internalEventId(caseFile, command.itemId);
    if (!board || !slot || !internalEvent || !slot.acceptsEventIds.includes(internalEvent)) return rejected(caseFile, state, "这个事件不能放入该推理位置。 ");
    const itemId = publicEventId(caseFile, internalEvent);
    if (!projectedEventOptions(caseFile, state).some((event) => event.id === itemId)) return rejected(caseFile, state, "这个事件还没有证据支持。 ");
    const current = state.reasoningBoards[command.boardId] ?? { placements: {}, connections: [] };
    const placements = Object.fromEntries(Object.entries(current.placements).filter(([, placedId]) => placedId !== itemId));
    placements[command.slotId] = itemId;
    const next = { ...state, reasoningBoards: { ...state.reasoningBoards, [command.boardId]: { ...current, placements } } };
    return accepted(caseFile, next, [{ type: "reasoning_board_updated", boardId: command.boardId }]);
  }

  if (command.type === "remove_reasoning_item") {
    const board = internalBoard(caseFile, command.boardId);
    const slot = board ? internalSlot(board, command.slotId) : undefined;
    if (!board || !slot) return rejected(caseFile, state, "未知的推理位置。 ");
    const current = state.reasoningBoards[command.boardId] ?? { placements: {}, connections: [] };
    const removedItem = current.placements[command.slotId];
    const placements = { ...current.placements };
    delete placements[command.slotId];
    const connections = current.connections.filter((item) => item.fromItemId !== removedItem && item.toItemId !== removedItem);
    const next = { ...state, reasoningBoards: { ...state.reasoningBoards, [command.boardId]: { placements, connections } } };
    return accepted(caseFile, next, [{ type: "reasoning_board_updated", boardId: command.boardId }]);
  }

  if (command.type === "connect_reasoning_items" || command.type === "disconnect_reasoning_items") {
    const board = internalBoard(caseFile, command.boardId);
    const current = state.reasoningBoards[command.boardId];
    const placed = new Set(Object.values(current?.placements ?? {}));
    const fromItemId = publicEventId(caseFile, internalEventId(caseFile, command.fromItemId) ?? "");
    const toItemId = publicEventId(caseFile, internalEventId(caseFile, command.toItemId) ?? "");
    if (!board || !current || !placed.has(fromItemId) || !placed.has(toItemId) || !(board.allowedRelations ?? ["causes", "precedes", "explains"]).includes(command.relation)) {
      return rejected(caseFile, state, "只能连接已放入推理板的事件。 ");
    }
    const keyMatches = (item: { fromItemId: string; toItemId: string; relation: string }) => item.fromItemId === fromItemId && item.toItemId === toItemId && item.relation === command.relation;
    const connections = command.type === "connect_reasoning_items"
      ? current.connections.some(keyMatches) ? current.connections : [...current.connections, { fromItemId, toItemId, relation: command.relation }]
      : current.connections.filter((item) => !keyMatches(item));
    const next = { ...state, reasoningBoards: { ...state.reasoningBoards, [command.boardId]: { ...current, connections } } };
    return accepted(caseFile, next, [{ type: "reasoning_board_updated", boardId: command.boardId }]);
  }

  if (command.type === "set_replay_mode") {
    if (!state.solved) return rejected(caseFile, state, "完成案件后才能开始重玩挑战。 ");
    if (command.mode !== "standard" && !caseFile.replayChallenges?.some((item) => item.mode === command.mode)) return rejected(caseFile, state, "这个案件没有定义该重玩挑战。 ");
    const next = { ...createRuntimeState(caseFile, state.initialDraftOrder, state.investigationRevision), replayMode: command.mode };
    return accepted(caseFile, next, [{ type: "replay_mode_started", mode: command.mode }]);
  }

  if (command.type === "request_proof_replay") {
    if (!state.solved) return rejected(caseFile, state, "只有证据链闭合后才能回放真相。 ");
    const draft = state.theoryDrafts.find((item) => item.id === state.activeTheoryId);
    if (!draft) return rejected(caseFile, state, "找不到已结案的理论。 ");
    const judgement = judgeTheory(caseFile, state.game, {
      hypothesisId: draft.hypothesisId,
      eventIds: draft.eventIds,
      evidenceIds: draft.evidenceIds,
      motiveKey: draft.motiveKey,
    });
    const replayBeatIds = buildProofReplay(caseFile, state.game, judgement).map((beat) => beat.id);
    return accepted(caseFile, { ...state, replayBeatIds }, [{ type: "replay_ready" }]);
  }

  return rejected(caseFile, state, "不支持的调查操作。 ");
}

/** Pending interpretation changes UI state without charging a question. Both live and replay commit it. */
export function commitsRuntimeTransition(result: RuntimeResult): boolean {
  return result.accepted || result.events.some((event) => event.type === "interpretation_required" || event.type === "interpretation_dismissed");
}

export function replayCommands(caseFile: CaseFile, commands: GameCommand[], options?: ReplayValidationOptions): RuntimeResult {
  let state = createRuntimeState(caseFile);
  let last: RuntimeResult = { state, projection: projectPlayerState(caseFile, state), events: [], accepted: true };
  for (const [index, command] of commands.entries()) {
    if (command.type === "start_case" && command.initialDraftOrder === undefined) continue;
    last = reduceCommand(caseFile, state, command, options);
    if (!commitsRuntimeTransition(last)) throw new Error(`存档第 ${index + 1} 个操作无法重放；原存档已保留。`);
    state = last.state;
  }
  return { ...last, state, projection: projectPlayerState(caseFile, state) };
}
