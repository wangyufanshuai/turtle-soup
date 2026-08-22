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
  RuntimeResult,
  RuntimeState,
  TheoryDraft,
  TheoryOptionProjection,
  TranscriptEntry,
} from "./types.ts";

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

function publicHypothesisId(hypothesisId: string): string {
  const aliases: Record<string, string> = {
    "hypothesis-canonical": "path-delayed-sound",
    "hypothesis-fang-entered": "path-late-entry",
    "hypothesis-guard-faked": "path-corridor-fake",
  };
  return aliases[hypothesisId] ?? `path-${hypothesisId.replace(/^hypothesis-/, "")}`;
}

function internalHypothesisId(caseFile: CaseFile, publicId: string): string | undefined {
  return caseFile.hypotheses.find((item) => publicHypothesisId(item.id) === publicId)?.id;
}

function publicEventId(caseFile: CaseFile, eventId: string): string {
  const index = [...caseFile.events].sort((left, right) => left.order - right.order).findIndex((event) => event.id === eventId);
  return index >= 0 ? `event-${String(index + 1).padStart(2, "0")}` : "event-unknown";
}

function internalEventId(caseFile: CaseFile, publicId: string): string | undefined {
  return [...caseFile.events].sort((left, right) => left.order - right.order)
    .find((event) => publicEventId(caseFile, event.id) === publicId)?.id;
}

function localizations(caseFile: CaseFile): Record<string, string> {
  return caseFile.localization?.["zh-CN"] ?? {};
}

function translate(caseFile: CaseFile, key: unknown, fallback: string): string {
  return typeof key === "string" ? (localizations(caseFile)[key] ?? fallback) : fallback;
}

function queryProjection(caseFile: CaseFile, queryId: string): QuestionCandidateProjection | undefined {
  const query = caseFile.questionSemantics.find((item) => item.id === queryId);
  if (!query) return undefined;
  const firstPhrase = query.examplePhrases?.[0] ?? PREDICATE_LABELS[String(query.predicate)] ?? "验证一个事实";
  const slots = (query.slots ?? {}) as Record<string, unknown>;
  const target = String(slots.subjectId ?? slots.locationId ?? slots.effect ?? "案件事实");
  const qualifier = slots.time ? String(slots.time) : undefined;
  return {
    queryId: query.id,
    label: firstPhrase,
    target,
    predicate: PREDICATE_LABELS[String(query.predicate)] ?? String(query.predicate ?? "验证"),
    qualifier,
  };
}

function interpretationFor(
  caseFile: CaseFile,
  rawText: string,
  status: QuestionInterpretation["status"],
  candidateIds: string[],
): QuestionInterpretation {
  const candidates = candidateIds
    .map((id) => queryProjection(caseFile, id))
    .filter((item): item is QuestionCandidateProjection => Boolean(item));
  return {
    status,
    rawText,
    interpretedAs: status === "matched" ? candidates[0]?.label : undefined,
    candidates,
    requiresConfirmation: status === "ambiguous",
  };
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

function sourceLabel(evidence: EvidenceItem): string {
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

export function createRuntimeState(caseFile: CaseFile): RuntimeState {
  return {
    game: createInitialState(caseFile),
    transcript: [],
    evidenceStates: initialEvidenceStates(caseFile),
    theoryDrafts: [
      { id: "theory-a", title: "主假设", hypothesisId: "hypothesis-fang-entered", eventIds: [], evidenceIds: [] },
      { id: "theory-b", title: "备选假设", hypothesisId: "hypothesis-guard-faked", eventIds: [], evidenceIds: [] },
    ],
    activeTheoryId: "theory-a",
    solved: false,
    replayBeatIds: [],
    acceptedCommandCount: 0,
  };
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
        sourceLabel: sourceLabel(item),
        isNew: playerState === "discovered" || (playerState === "available" && discoverable.has(item.id)),
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
  return time?.value ?? `序列 ${event.order}`;
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
    .sort((left, right) => left.order - right.order)
    .map((event) => ({
      id: publicEventId(caseFile, event.id),
      timeLabel: eventTimeLabel(event),
      label: String(event.action) === "alarm-vibrates-against-tray" && !state.game.visibleFactIds.includes("fact-phone-inside")
        ? "某个物体有规律地撞击托盘"
        : EVENT_ACTION_LABELS[String(event.action)] ?? String(event.action ?? "已知事件"),
    }));
}

function projectedTheoryOptions(caseFile: CaseFile, state: RuntimeState): TheoryOptionProjection[] {
  const intentVisible = state.game.visibleFactIds.includes("fact-lin-intent-delay");
  const selected = new Set(state.theoryDrafts.map((draft) => draft.hypothesisId));
  const discovered = new Set(state.game.discoveredEvidenceIds);
  return caseFile.hypotheses.filter((hypothesis) => {
    if (selected.has(hypothesis.id)) return true;
    if (hypothesis.id === "hypothesis-canonical") return state.game.visibleFactIds.includes("fact-vibration-caused-knock");
    if (hypothesis.id === "hypothesis-guard-faked") return discovered.has("evidence-knock-recording");
    return true;
  }).map((hypothesis) => {
    const motiveKey = String(hypothesis.claim?.motiveKey ?? "");
    const motiveVisible = hypothesis.kind !== "canonical" || intentVisible;
    return {
      id: publicHypothesisId(hypothesis.id),
      label: hypothesis.id === "hypothesis-canonical" && !state.game.visibleFactIds.includes("fact-phone-inside")
        ? "室内物体制造了延时声响"
        : HYPOTHESIS_LABELS[hypothesis.id] ?? "待验证理论",
      motiveOptions: motiveKey && motiveVisible
        ? [{ id: motiveKey, label: MOTIVE_LABELS[motiveKey] ?? "未知动机" }]
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
  const title = translate(caseFile, caseFile.surface?.titleKey ?? caseFile.metadata?.titleKey, "未命名案件");
  const surface = translate(caseFile, caseFile.surface?.textKey, "一件无法解释的事件等待调查。");
  const initialIds = caseFile.surface?.initialQuestionPrompts ?? [];
  const orderedQueries = [
    ...initialIds,
    ...caseFile.questionSemantics.map((query) => query.id).filter((id) => !initialIds.includes(id)),
  ];
  const questionScaffolds = orderedQueries
    .map((id) => queryProjection(caseFile, id))
    .filter((item): item is QuestionCandidateProjection => Boolean(item));
  const active = state.theoryDrafts.find((item) => item.id === state.activeTheoryId);
  const interpretation = state.pendingInterpretation
    ? interpretationFor(caseFile, state.pendingInterpretation.rawText, "ambiguous", state.pendingInterpretation.candidateQueryIds)
    : undefined;

  return {
    case: {
      id: caseFile.id,
      version: caseFile.metadata?.contentVersion ?? 1,
      contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
      title,
      surface,
      difficulty: caseFile.metadata?.difficulty ?? "unknown",
      targetMinutes: caseFile.metadata?.targetMinutes ?? DEFAULT_TARGET_MINUTES,
    },
    transcript: state.transcript,
    interpretation,
    evidence: projectedEvidence(caseFile, state),
    locations: projectedLocations(caseFile, state),
    questionScaffolds,
    eventOptions: projectedEventOptions(caseFile, state),
    theoryOptions: projectedTheoryOptions(caseFile, state),
    theoryDrafts: state.theoryDrafts.map((draft) => ({
      ...draft,
      hypothesisId: publicHypothesisId(draft.hypothesisId),
      eventIds: draft.eventIds.map((eventId) => publicEventId(caseFile, eventId)),
    })),
    activeTheoryId: state.activeTheoryId,
    canSubmit: Boolean(active && active.eventIds.length > 0 && active.evidenceIds.length > 0),
    solved: state.solved,
    replay: replayProjection(caseFile, state),
    debrief: debrief(caseFile, state),
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
  const next = { ...state, acceptedCommandCount: state.acceptedCommandCount + 1 };
  return { state: next, projection: projectPlayerState(caseFile, next), events, accepted: true };
}

function withDraft(state: RuntimeState, theoryId: TheoryDraft["id"], update: (draft: TheoryDraft) => TheoryDraft): RuntimeState | undefined {
  if (!state.theoryDrafts.some((draft) => draft.id === theoryId)) return undefined;
  return {
    ...state,
    theoryDrafts: state.theoryDrafts.map((draft) => draft.id === theoryId ? update(draft) : draft),
  };
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
    pendingInterpretation: undefined,
    lastQuestionSnapshot: {
      game: { ...state.game, discoveredEvidenceIds: [...state.game.discoveredEvidenceIds], visitedLocationIds: [...state.game.visitedLocationIds], answeredQueryIds: [...state.game.answeredQueryIds], activeRuleIds: [...state.game.activeRuleIds], visibleFactIds: [...state.game.visibleFactIds] },
      transcriptLength: state.transcript.length,
    },
  };
  return accepted(caseFile, next, [{ type: "question_answered", entry }]);
}

export function reduceGameCommand(caseFile: CaseFile, state: RuntimeState, command: GameCommand): RuntimeResult {
  if (command.type === "start_case") {
    const next = createRuntimeState(caseFile);
    return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "case_started" }], accepted: true };
  }
  if (command.type === "restart_case") {
    const next = createRuntimeState(caseFile);
    return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "case_started" }], accepted: true };
  }

  if (command.type === "ask_text") {
    const rawText = command.rawText.trim();
    if (!rawText) return rejected(caseFile, state, "先写下一个可以验证的事实问题。 ");
    const normalized = normalizeQuestion(caseFile, rawText);
    if (normalized.status === "matched" && normalized.queryId) return answerQuery(caseFile, state, normalized.queryId, rawText);
    const interpretation = interpretationFor(caseFile, rawText, normalized.status, normalized.candidateQueryIds);
    if (normalized.status === "ambiguous") {
      const next = { ...state, pendingInterpretation: { rawText, candidateQueryIds: normalized.candidateQueryIds } };
      return { state: next, projection: projectPlayerState(caseFile, next), events: [{ type: "interpretation_required", interpretation }], accepted: false };
    }
    return { state, projection: projectPlayerState(caseFile, state), events: [{ type: "question_rejected", interpretation }], accepted: false };
  }

  if (command.type === "confirm_interpretation") {
    const pending = state.pendingInterpretation;
    if (!pending?.candidateQueryIds.includes(command.queryId)) return rejected(caseFile, state, "这个解释不属于当前待确认问题。 ");
    return answerQuery(caseFile, state, command.queryId, pending.rawText);
  }

  if (command.type === "undo_last_question") {
    if (!state.lastQuestionSnapshot || state.transcript.length === 0) return rejected(caseFile, state, "没有可以撤销的问题。 ");
    const next: RuntimeState = {
      ...state,
      game: state.lastQuestionSnapshot.game,
      transcript: state.transcript.slice(0, state.lastQuestionSnapshot.transcriptLength),
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

  if (command.type === "set_theory_hypothesis") {
    const hypothesisId = internalHypothesisId(caseFile, command.hypothesisId);
    if (!hypothesisId) return rejected(caseFile, state, "未知的理论路径。 ");
    const next = withDraft(state, command.theoryId, (draft) => ({ ...draft, hypothesisId, motiveKey: undefined }));
    return next ? accepted(caseFile, next, [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "upsert_theory_event") {
    const internalId = internalEventId(caseFile, command.eventId);
    if (!internalId || !projectedEventOptions(caseFile, state).some((item) => item.id === command.eventId)) return rejected(caseFile, state, "这个事件还没有证据支持。 ");
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
      eventIds.splice(targetIndex, 0, command.eventId);
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
    const allowed = projectedTheoryOptions(caseFile, state)
      .flatMap((option) => option.motiveOptions)
      .some((option) => option.id === command.motiveKey);
    if (command.motiveKey && !allowed) return rejected(caseFile, state, "这个驱动条件还没有足够证据。 ");
    const next = withDraft(state, command.theoryId, (draft) => ({ ...draft, motiveKey: command.motiveKey }));
    return next ? accepted(caseFile, next, [{ type: "theory_updated", theoryId: command.theoryId }]) : rejected(caseFile, state, "未知的理论草稿。 ");
  }

  if (command.type === "submit_theory") {
    const draft = state.theoryDrafts.find((item) => item.id === command.theoryId);
    if (!draft) return rejected(caseFile, state, "未知的理论草稿。 ");
    const judgement = judgeTheory(caseFile, state.game, {
      hypothesisId: draft.hypothesisId,
      eventIds: draft.eventIds,
      evidenceIds: draft.evidenceIds,
      motiveKey: draft.motiveKey,
    });
    const solved = judgement.judgement === "solved";
    const next = { ...state, activeTheoryId: draft.id, solved };
    return accepted(caseFile, next, solved
      ? [{ type: "theory_judged", judgement: judgement.judgement, message: judgement.spoilerSafeGap }, { type: "case_solved" }]
      : [{ type: "theory_judged", judgement: judgement.judgement, message: judgement.spoilerSafeGap }]);
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

export function replayCommands(caseFile: CaseFile, commands: GameCommand[]): RuntimeResult {
  let state = createRuntimeState(caseFile);
  let last: RuntimeResult = { state, projection: projectPlayerState(caseFile, state), events: [], accepted: true };
  for (const command of commands) {
    if (command.type === "start_case") continue;
    last = reduceGameCommand(caseFile, state, command);
    if (last.accepted) state = last.state;
  }
  return { ...last, state, projection: projectPlayerState(caseFile, state) };
}
