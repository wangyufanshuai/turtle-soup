import type {
  AnswerCode,
  AskNaturalLanguageResult,
  AskResult,
  CaseFile,
  Contradiction,
  GameState,
  Judgement,
  JudgementResult,
  MutationResult,
  QuestionNormalizationResult,
  QuestionSemantic,
  TheorySubmission,
} from "./types.ts";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function appendUnique(values: string[], additions: string[]): string[] {
  return unique([...values, ...additions]);
}

function containsAll(haystack: string[], needles: string[] = []): boolean {
  return needles.every((value) => haystack.includes(value));
}

function byId<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

function assertUniqueIds(caseFile: CaseFile): void {
  const collections: Array<[string, Array<{ id: string }>]> = [
    ["entity", caseFile.entities],
    ["event", caseFile.events],
    ["relation", caseFile.relations],
    ["fact", caseFile.facts],
    ["rule", caseFile.visibilityRules],
    ["query", caseFile.questionSemantics],
    ["evidence", caseFile.evidenceItems],
    ["hypothesis", caseFile.hypotheses],
    ["contradiction", caseFile.contradictions],
    ["proof replay", caseFile.proofReplay],
  ];

  for (const [label, items] of collections) {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Duplicate ${label} id in case ${caseFile.id}`);
    }
  }
}

function requirementsMet(caseFile: CaseFile, state: GameState, ruleId: string): boolean {
  const rule = byId(caseFile.visibilityRules, ruleId);
  if (!rule) return false;
  const requirements = rule.requires ?? {};
  return (
    containsAll(state.discoveredEvidenceIds, requirements.discoveredEvidenceIds) &&
    containsAll(state.visitedLocationIds, requirements.visitedLocationIds) &&
    containsAll(state.answeredQueryIds, requirements.answeredQueryIds)
  );
}

function activeRuleIds(caseFile: CaseFile, state: GameState): string[] {
  return state.activeRuleIds.filter((ruleId) => requirementsMet(caseFile, state, ruleId));
}

function visibleFacts(caseFile: CaseFile, state: GameState): string[] {
  const visible = new Set<string>();
  for (const ruleId of activeRuleIds(caseFile, state)) {
    const rule = byId(caseFile.visibilityRules, ruleId);
    for (const factId of rule?.revealsFactIds ?? []) visible.add(factId);
  }
  return [...visible];
}

function refreshState(caseFile: CaseFile, state: GameState): GameState {
  return {
    ...state,
    activeRuleIds: unique(state.activeRuleIds),
    discoveredEvidenceIds: unique(state.discoveredEvidenceIds),
    visitedLocationIds: unique(state.visitedLocationIds),
    answeredQueryIds: unique(state.answeredQueryIds),
    visibleFactIds: visibleFacts(caseFile, state),
  };
}

function activateSatisfiedEvidenceRules(caseFile: CaseFile, state: GameState): GameState {
  const activated = [...state.activeRuleIds];
  for (const rule of caseFile.visibilityRules) {
    if (rule.mode !== "evidence") continue;
    if (requirementsMet(caseFile, state, rule.id)) activated.push(rule.id);
  }
  return { ...state, activeRuleIds: unique(activated) };
}

function newlyAdded(before: string[], after: string[]): string[] {
  return after.filter((value) => !before.includes(value));
}

export function validateCaseShape(caseFile: CaseFile): void {
  assertUniqueIds(caseFile);
  const eventIds = new Set(caseFile.events.map((item) => item.id));
  const factIds = new Set(caseFile.facts.map((item) => item.id));
  const ruleIds = new Set(caseFile.visibilityRules.map((item) => item.id));
  const evidenceIds = new Set(caseFile.evidenceItems.map((item) => item.id));
  const hypothesisIds = new Set(caseFile.hypotheses.map((item) => item.id));
  const contradictionIds = new Set(caseFile.contradictions.map((item) => item.id));

  for (const fact of caseFile.facts) {
    if (!fact.sourceType && (fact.sourceEventIds ?? []).length === 0) {
      throw new Error(`Fact ${fact.id} has no source`);
    }
    for (const eventId of fact.sourceEventIds ?? []) {
      if (!eventIds.has(eventId)) throw new Error(`Fact ${fact.id} references unknown event ${eventId}`);
    }
    for (const ruleId of fact.visibilityRuleIds ?? []) {
      if (!ruleIds.has(ruleId)) throw new Error(`Fact ${fact.id} references unknown rule ${ruleId}`);
    }
    for (const evidenceId of fact.evidenceItemIds ?? []) {
      if (!evidenceIds.has(evidenceId)) throw new Error(`Fact ${fact.id} references unknown evidence ${evidenceId}`);
    }
  }

  for (const rule of caseFile.visibilityRules) {
    for (const factId of rule.revealsFactIds) {
      if (!factIds.has(factId)) throw new Error(`Rule ${rule.id} references unknown fact ${factId}`);
    }
  }

  for (const hypothesis of caseFile.hypotheses) {
    for (const evidenceId of hypothesis.requiredEvidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) throw new Error(`Hypothesis ${hypothesis.id} references unknown evidence ${evidenceId}`);
    }
    for (const contradictionId of hypothesis.requiredContradictionResolutionIds ?? []) {
      if (!contradictionIds.has(contradictionId)) throw new Error(`Hypothesis ${hypothesis.id} references unknown contradiction ${contradictionId}`);
    }
  }

  const certificate = caseFile.solutionCertificate;
  if (!hypothesisIds.has(certificate.canonicalHypothesisId)) {
    throw new Error(`Certificate references unknown canonical hypothesis ${certificate.canonicalHypothesisId}`);
  }
  for (const evidenceId of certificate.requiredEvidenceIds) {
    if (!evidenceIds.has(evidenceId)) throw new Error(`Certificate references unknown evidence ${evidenceId}`);
  }
  for (const factId of certificate.requiredFactIds) {
    if (!factIds.has(factId)) throw new Error(`Certificate references unknown fact ${factId}`);
  }
}

export function createInitialState(caseFile: CaseFile): GameState {
  validateCaseShape(caseFile);
  const initialEvidence = caseFile.evidenceItems
    .filter((item) => item.defaultState === "discovered")
    .map((item) => item.id);
  const initialRules = caseFile.visibilityRules
    .filter((rule) => rule.mode === "scene" && Object.keys(rule.requires ?? {}).every((key) => {
      const value = (rule.requires as Record<string, unknown>)[key];
      return Array.isArray(value) ? value.length === 0 : true;
    }))
    .map((rule) => rule.id);
  const state: GameState = {
    caseId: caseFile.id,
    discoveredEvidenceIds: initialEvidence,
    visitedLocationIds: [],
    answeredQueryIds: [],
    activeRuleIds: initialRules,
    visibleFactIds: [],
  };
  return refreshState(caseFile, state);
}

export function createStateFromProjection(
  caseFile: CaseFile,
  projection: Partial<Pick<GameState, "discoveredEvidenceIds" | "visitedLocationIds" | "answeredQueryIds">>,
): GameState {
  let state = createInitialState(caseFile);
  const evidenceIds = unique(projection.discoveredEvidenceIds ?? []);
  const locationIds = unique(projection.visitedLocationIds ?? []);
  const queryIds = unique(projection.answeredQueryIds ?? []);
  const knownEvidence = new Set(caseFile.evidenceItems.map((item) => item.id));
  const knownLocations = new Set(caseFile.entities.filter((item) => item.kind === "location").map((item) => item.id));
  const knownQueries = new Set(caseFile.questionSemantics.map((item) => item.id));
  for (const id of evidenceIds) if (!knownEvidence.has(id)) throw new Error(`Unknown evidence projection ${id}`);
  for (const id of locationIds) if (!knownLocations.has(id)) throw new Error(`Unknown location projection ${id}`);
  for (const id of queryIds) if (!knownQueries.has(id)) throw new Error(`Unknown query projection ${id}`);

  state = {
    ...state,
    discoveredEvidenceIds: appendUnique(state.discoveredEvidenceIds, evidenceIds),
    visitedLocationIds: locationIds,
    answeredQueryIds: queryIds,
  };
  for (const queryId of queryIds) {
    const query = byId(caseFile.questionSemantics, queryId);
    state.activeRuleIds = appendUnique(state.activeRuleIds, query?.visibilityRuleIds ?? []);
  }
  state = activateSatisfiedEvidenceRules(caseFile, state);
  return refreshState(caseFile, state);
}

export function getDiscoverableEvidenceIds(caseFile: CaseFile, state: GameState): string[] {
  const current = refreshState(caseFile, state);
  return caseFile.evidenceItems
    .filter((evidence) => !current.discoveredEvidenceIds.includes(evidence.id))
    .filter((evidence) => {
      if (evidence.defaultState === "available") return true;
      return containsAll(current.visibleFactIds, evidence.sourceFactIds);
    })
    .map((evidence) => evidence.id);
}

export function discoverEvidence(caseFile: CaseFile, state: GameState, evidenceId: string): MutationResult {
  const before = refreshState(caseFile, state);
  const evidence = byId(caseFile.evidenceItems, evidenceId);
  if (!evidence || before.discoveredEvidenceIds.includes(evidenceId)) {
    return { state: before, accepted: false, newlyVisibleFactIds: [], unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, before) };
  }

  const discoverable = getDiscoverableEvidenceIds(caseFile, before);
  if (!discoverable.includes(evidenceId)) {
    return { state: before, accepted: false, newlyVisibleFactIds: [], unlockedEvidenceIds: discoverable };
  }

  let next: GameState = {
    ...before,
    discoveredEvidenceIds: appendUnique(before.discoveredEvidenceIds, [evidenceId]),
  };
  next = activateSatisfiedEvidenceRules(caseFile, next);
  next = refreshState(caseFile, next);
  return {
    state: next,
    accepted: true,
    newlyVisibleFactIds: newlyAdded(before.visibleFactIds, next.visibleFactIds),
    unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, next),
  };
}

export function visitLocation(caseFile: CaseFile, state: GameState, locationId: string): MutationResult {
  if (!caseFile.entities.some((entity) => entity.id === locationId && entity.kind === "location")) {
    const current = refreshState(caseFile, state);
    return { state: current, accepted: false, newlyVisibleFactIds: [], unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, current) };
  }
  const before = refreshState(caseFile, state);
  let next: GameState = {
    ...before,
    visitedLocationIds: appendUnique(before.visitedLocationIds, [locationId]),
  };
  next = activateSatisfiedEvidenceRules(caseFile, next);
  next = refreshState(caseFile, next);
  return {
    state: next,
    accepted: true,
    newlyVisibleFactIds: newlyAdded(before.visibleFactIds, next.visibleFactIds),
    unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, next),
  };
}

export function askQuestion(caseFile: CaseFile, state: GameState, queryId: string): AskResult {
  const before = refreshState(caseFile, state);
  const query = byId(caseFile.questionSemantics, queryId);
  if (!query) {
    return { state: before, queryId: null, code: "unrecognized", newlyVisibleFactIds: [], unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, before) };
  }

  const activeRules = appendUnique(before.activeRuleIds, query.visibilityRuleIds ?? []);
  const next = refreshState(caseFile, {
    ...before,
    answeredQueryIds: appendUnique(before.answeredQueryIds, [queryId]),
    activeRuleIds: activeRules,
  });
  const visible = new Set(next.visibleFactIds);
  const supportingFacts = query.supportingFactIds ?? [];
  const isVisible = supportingFacts.every((factId) => visible.has(factId));
  const code: AnswerCode = isVisible || query.answerCodeWhenVisible === "irrelevant"
    ? query.answerCodeWhenVisible
    : "unknown";

  return {
    state: next,
    queryId,
    code,
    newlyVisibleFactIds: newlyAdded(before.visibleFactIds, next.visibleFactIds),
    unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, next),
  };
}

function normalizedQuestionText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    // Common conversational wrappers are not semantic content. Removing
    // them keeps authored question corpora useful without making the host
    // depend on an LLM or fuzzy similarity threshold.
    .replace(/^(请问|我想确认|现在能否确认|调查记录里|后台记录里|从雪地现场看|从舞台现场看|请验证|我的问题是|能不能判断|请回答一个事实|关于这条路线|关于这个角色|记录是否支持|证词是否支持|在这个案件里)/, "")
    .replace(/(只回答事实|请只回答事实)$/, "");
}

function normalizedTerms(values: string[] | undefined): string[] {
  return (values ?? []).map(normalizedQuestionText).filter(Boolean);
}

function matchRuleScore(text: string, query: QuestionSemantic): number | null {
  let best: number | null = null;
  for (const rule of query.matchRules ?? []) {
    const all = normalizedTerms(rule.all);
    const any = normalizedTerms(rule.any);
    const none = normalizedTerms(rule.none);
    if (all.some((term) => !text.includes(term))) continue;
    if (any.length > 0 && !any.some((term) => text.includes(term))) continue;
    if (none.some((term) => text.includes(term))) continue;
    const specificity = [...all, ...any.filter((term) => text.includes(term))]
      .reduce((total, term) => total + term.length, 0);
    const score = (rule.priority ?? 0) * 100 + specificity;
    best = best === null ? score : Math.max(best, score);
  }
  return best;
}

export function normalizeQuestion(caseFile: CaseFile, rawText: string): QuestionNormalizationResult {
  const normalizedText = normalizedQuestionText(rawText);
  if (!normalizedText) {
    return { status: "unrecognized", rawText, normalizedText, queryId: null, candidateQueryIds: [], matchedBy: "none" };
  }

  const exact = caseFile.questionSemantics.filter((query) =>
    (query.examplePhrases ?? []).some((phrase) => normalizedQuestionText(phrase) === normalizedText),
  );
  if (exact.length === 1) {
    return { status: "matched", rawText, normalizedText, queryId: exact[0].id, candidateQueryIds: [exact[0].id], matchedBy: "exact" };
  }
  if (exact.length > 1) {
    return { status: "ambiguous", rawText, normalizedText, queryId: null, candidateQueryIds: exact.map((item) => item.id), matchedBy: "exact" };
  }

  const candidates = caseFile.questionSemantics
    .map((query) => ({ query, score: matchRuleScore(normalizedText, query) }))
    .filter((item): item is { query: QuestionSemantic; score: number } => item.score !== null)
    .sort((left, right) => right.score - left.score || left.query.id.localeCompare(right.query.id));
  if (candidates.length === 0) {
    return { status: "unrecognized", rawText, normalizedText, queryId: null, candidateQueryIds: [], matchedBy: "none" };
  }
  const topScore = candidates[0].score;
  const top = candidates.filter((item) => item.score === topScore);
  const topPriority = Math.floor(topScore / 100);
  // Low-priority rules are discovery fallbacks, not strong semantic proof. If
  // more than one query matches such an input, fail closed even when one rule
  // happens to score slightly higher. This prevents a typo or abbreviation
  // from silently selecting a different predicate.
  if (top.length !== 1 || (candidates.length > 1 && topPriority < 3)) {
    const ambiguous = top.length !== 1 ? top : candidates;
    return { status: "ambiguous", rawText, normalizedText, queryId: null, candidateQueryIds: [...new Set(ambiguous.map((item) => item.query.id))], matchedBy: "rule" };
  }
  return {
    status: "matched",
    rawText,
    normalizedText,
    queryId: top[0].query.id,
    candidateQueryIds: [top[0].query.id],
    matchedBy: "rule",
  };
}

export function askNaturalLanguage(caseFile: CaseFile, state: GameState, rawText: string): AskNaturalLanguageResult {
  const normalization = normalizeQuestion(caseFile, rawText);
  if (normalization.status !== "matched" || !normalization.queryId) {
    const current = refreshState(caseFile, state);
    return {
      state: current,
      queryId: null,
      code: "unrecognized",
      newlyVisibleFactIds: [],
      unlockedEvidenceIds: getDiscoverableEvidenceIds(caseFile, current),
      normalization,
    };
  }
  return { ...askQuestion(caseFile, state, normalization.queryId), normalization };
}

function contradictionResolutionMet(caseFile: CaseFile, state: GameState, contradictionId: string, submittedEvidenceIds: string[]): boolean {
  const contradiction = byId(caseFile.contradictions, contradictionId);
  if (!contradiction) return false;
  const factVisible = containsAll(state.visibleFactIds, contradiction.requiresFactIds);
  const evidenceResolved = containsAll(submittedEvidenceIds, contradiction.resolutionEvidenceIds);
  return factVisible && evidenceResolved;
}

function hardContradictionsFor(caseFile: CaseFile, state: GameState, hypothesisId: string): Contradiction[] {
  return caseFile.contradictions.filter((contradiction) =>
    contradiction.severity === "hard" &&
    (contradiction.invalidatesHypothesisIds ?? []).includes(hypothesisId) &&
    containsAll(state.visibleFactIds, contradiction.requiresFactIds),
  );
}

function spoilerSafeGap(result: {
  missingEvidenceIds: string[];
  missingFactIds: string[];
  missingContradictionResolutionIds: string[];
  missingMotiveKey?: string;
  contradictionIds: string[];
}): string {
  if (result.contradictionIds.length) return "这条路径与已验证的物理或时间约束冲突。";
  if (result.missingEvidenceIds.length) return "还有关键证据没有被提交或验证。";
  if (result.missingFactIds.length) return "事件链中仍有一个事实没有被当前证据证明。";
  if (result.missingContradictionResolutionIds.length) return "至少一个矛盾还没有被完整解释。";
  if (result.missingMotiveKey) return "事件链基本成立，但驱动条件仍未闭合。";
  return "这条理论目前与可见事实保持一致。";
}

export function judgeTheory(caseFile: CaseFile, state: GameState, submission: TheorySubmission): JudgementResult {
  const current = refreshState(caseFile, state);
  const hypothesis = byId(caseFile.hypotheses, submission.hypothesisId);
  if (!hypothesis) {
    return {
      judgement: "unfounded",
      hypothesisId: submission.hypothesisId,
      missingEvidenceIds: [],
      missingFactIds: [],
      missingContradictionResolutionIds: [],
      contradictionIds: [],
      spoilerSafeGap: "这条理论引用了未知对象。",
    };
  }

  const contradictionIds = hardContradictionsFor(caseFile, current, hypothesis.id).map((item) => item.id);
  const base = {
    judgement: "unfounded" as const,
    hypothesisId: hypothesis.id,
    missingEvidenceIds: [] as string[],
    missingFactIds: [] as string[],
    missingContradictionResolutionIds: [] as string[],
    contradictionIds,
    spoilerSafeGap: "",
  };

  if (contradictionIds.length) {
    return { ...base, judgement: "invalidated", spoilerSafeGap: spoilerSafeGap({ ...base, contradictionIds }) };
  }

  const certificate = caseFile.solutionCertificate;
  const selectedEvidence = unique(submission.evidenceIds ?? []);
  const selectedEvents = submission.eventIds ?? [];
  const proofSets = certificate.minimumProofSets?.length
    ? certificate.minimumProofSets
    : [{ id: "certificate-required", evidenceIds: certificate.requiredEvidenceIds }];
  const bestProofSet = [...proofSets]
    .map((set) => ({ set, missing: set.evidenceIds.filter((id) => !selectedEvidence.includes(id)) }))
    .sort((left, right) => left.missing.length - right.missing.length || left.set.evidenceIds.length - right.set.evidenceIds.length)[0];
  const missingEvidenceIds = bestProofSet?.missing ?? certificate.requiredEvidenceIds.filter((id) => !selectedEvidence.includes(id));
  const missingFactIds = certificate.requiredFactIds.filter((id) => !current.visibleFactIds.includes(id));
  const missingContradictionResolutionIds = certificate.requiredContradictionResolutionIds.filter(
    (id) => !contradictionResolutionMet(caseFile, current, id, selectedEvidence),
  );
  const canonical = hypothesis.id === certificate.canonicalHypothesisId;
  const canonicalHypothesis = byId(caseFile.hypotheses, certificate.canonicalHypothesisId);
  const expectedEvents = canonicalHypothesis?.claim?.eventIds ?? [];
  const eventOrderMatches = canonical && expectedEvents.length > 0 && expectedEvents.every((id, index) => selectedEvents[index] === id);
  const acceptedMotives = certificate.acceptedMotiveKeys ?? [];
  const motiveMissing = canonical && !acceptedMotives.includes(submission.motiveKey ?? "");

  const result = {
    ...base,
    missingEvidenceIds,
    missingFactIds,
    missingContradictionResolutionIds,
    missingMotiveKey: motiveMissing ? acceptedMotives[0] : undefined,
  };

  if (!canonical) {
    return { ...result, judgement: "plausible", spoilerSafeGap: spoilerSafeGap(result) };
  }

  const noProofSelected = selectedEvidence.length === 0;
  if (eventOrderMatches && !noProofSelected && missingEvidenceIds.length === 0 && missingFactIds.length === 0 && missingContradictionResolutionIds.length === 0 && !motiveMissing) {
    return { ...result, judgement: "solved", spoilerSafeGap: "证据链闭合，所有替代路径均已排除。" };
  }

  const judgement: Judgement = eventOrderMatches && noProofSelected
    ? "plausible"
    : eventOrderMatches
      ? "nearly_proven"
      : "unfounded";
  return { ...result, judgement, spoilerSafeGap: spoilerSafeGap(result) };
}

export function buildProofReplay(caseFile: CaseFile, state: GameState, judgement: JudgementResult) {
  if (judgement.judgement !== "solved") return [];
  const visible = new Set(refreshState(caseFile, state).visibleFactIds);
  return caseFile.proofReplay.filter((beat) => beat.factIds.every((factId) => visible.has(factId)));
}
