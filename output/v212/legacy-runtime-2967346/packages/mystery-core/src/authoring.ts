import type { CaseFile } from "./types.ts";
import { normalizeQuestion } from "./engine.ts";

export type QualitySeverity = "error" | "warning" | "info";

export interface QualityIssue {
  severity: QualitySeverity;
  code: string;
  subjectId: string;
  message: string;
}

export interface QueryCorpusEntry {
  id: string;
  rawQuestion: string;
  expectedQueryId?: string | null;
  expectedStatus?: "matched" | "ambiguous" | "unrecognized";
  category?: "positive" | "ambiguous" | "irrelevant" | "unrecognized" | "spoiler-seeking";
}

export interface CaseQualityReport {
  caseId: string;
  errors: QualityIssue[];
  warnings: QualityIssue[];
  infos: QualityIssue[];
  metrics: {
    factCount: number;
    visibleAtStart: number;
    queryCount: number;
    evidenceCount: number;
    hypothesisCount: number;
    requiredEvidenceCount: number;
    questionCoverage: number;
    antiLeakCount: number;
    proofReplayCoverage: number;
    alternativeCoverage: number;
    requiredEvidenceCoverage: number;
    ambiguityRate: number;
    duplicateQuestionRate: number;
    estimatedSolveTimeMinutes: { min: number; max: number };
    redHerringPresence: boolean;
    corpusCount: number;
    corpusMinimumMet: boolean;
  };
  passed: boolean;
}

function has<T extends { id: string }>(items: T[], id: string): boolean {
  return items.some((item) => item.id === id);
}

function issue(issues: QualityIssue[], severity: QualitySeverity, code: string, subjectId: string, message: string) {
  issues.push({ severity, code, subjectId, message });
}

function visibleFactsAtStart(caseFile: CaseFile): Set<string> {
  const opening = caseFile.visibilityRules
    .filter((rule) => rule.mode === "scene" && Object.values(rule.requires ?? {}).every((value) => Array.isArray(value) && value.length === 0));
  return new Set(opening.flatMap((rule) => rule.revealsFactIds));
}

export function analyzeCaseQuality(caseFile: CaseFile, corpus: QueryCorpusEntry[] = []): CaseQualityReport {
  const errors: QualityIssue[] = [];
  const warnings: QualityIssue[] = [];
  const infos: QualityIssue[] = [];
  const push = (severity: QualitySeverity, code: string, subjectId: string, message: string) => {
    issue(severity === "error" ? errors : severity === "warning" ? warnings : infos, severity, code, subjectId, message);
  };
  const factIds = new Set(caseFile.facts.map((fact) => fact.id));
  const eventIds = new Set(caseFile.events.map((event) => event.id));
  const evidenceIds = new Set(caseFile.evidenceItems.map((evidence) => evidence.id));
  const queryIds = new Set(caseFile.questionSemantics.map((query) => query.id));
  const hypothesisIds = new Set(caseFile.hypotheses.map((hypothesis) => hypothesis.id));
  const contradictionIds = new Set(caseFile.contradictions.map((contradiction) => contradiction.id));
  const visibleAtStart = visibleFactsAtStart(caseFile);

  for (const fact of caseFile.facts) {
    if (!(fact.sourceType || (fact.sourceEventIds ?? []).length)) push("error", "FACT_NO_SOURCE", fact.id, "事实没有来源事件或作者前提。");
    for (const eventId of fact.sourceEventIds ?? []) if (!eventIds.has(eventId)) push("error", "FACT_DANGLING_EVENT", fact.id, `引用了不存在的事件 ${eventId}。`);
    for (const ruleId of fact.visibilityRuleIds ?? []) if (!has(caseFile.visibilityRules, ruleId)) push("error", "FACT_DANGLING_RULE", fact.id, `引用了不存在的可见性规则 ${ruleId}。`);
    for (const evidenceId of fact.evidenceItemIds ?? []) if (!evidenceIds.has(evidenceId)) push("error", "FACT_DANGLING_EVIDENCE", fact.id, `引用了不存在的证据 ${evidenceId}。`);
  }

  for (const event of caseFile.events) {
    for (const factId of event.effectFactIds ?? []) if (!factIds.has(factId)) push("error", "EVENT_DANGLING_EFFECT", event.id, `引用了不存在的效果事实 ${factId}。`);
    for (const factId of event.preconditionFactIds ?? []) if (!factIds.has(factId)) push("error", "EVENT_DANGLING_PRECONDITION", event.id, `引用了不存在的前置事实 ${factId}。`);
  }

  for (const rule of caseFile.visibilityRules) {
    for (const factId of rule.revealsFactIds) if (!factIds.has(factId)) push("error", "RULE_DANGLING_FACT", rule.id, `揭示了不存在的事实 ${factId}。`);
    const hasRequirement = Object.values(rule.requires ?? {}).some((value) => Array.isArray(value) && value.length > 0);
    if (rule.mode === "evidence" && !hasRequirement) push("warning", "RULE_EARLY_EXPOSURE", rule.id, "证据规则没有前置条件，可能提前暴露事实。");
  }

  for (const query of caseFile.questionSemantics) {
    for (const factId of query.supportingFactIds ?? []) if (!factIds.has(factId)) push("error", "QUERY_DANGLING_FACT", query.id, `查询引用了不存在的事实 ${factId}。`);
    for (const ruleId of query.visibilityRuleIds ?? []) if (!has(caseFile.visibilityRules, ruleId)) push("error", "QUERY_DANGLING_RULE", query.id, `查询引用了不存在的规则 ${ruleId}。`);
    if (!(query.examplePhrases ?? []).length && !(query.matchRules ?? []).length) push("warning", "QUERY_NO_LANGUAGE_ROUTE", query.id, "查询没有示例短语或匹配规则。");
  }

  for (const evidence of caseFile.evidenceItems) {
    for (const factId of evidence.sourceFactIds ?? []) if (!factIds.has(factId)) push("error", "EVIDENCE_DANGLING_FACT", evidence.id, `证据引用了不存在的事实 ${factId}。`);
    for (const eventId of evidence.sourceEventIds ?? []) if (!eventIds.has(eventId)) push("error", "EVIDENCE_DANGLING_EVENT", evidence.id, `证据引用了不存在的事件 ${eventId}。`);
    if (evidence.defaultState === "discovered" && (evidence.sourceFactIds ?? []).some((factId) => !visibleAtStart.has(factId))) push("warning", "EVIDENCE_START_MISMATCH", evidence.id, "开场证据的来源事实并非开场可见。");
  }

  for (const hypothesis of caseFile.hypotheses) {
    for (const eventId of hypothesis.claim?.eventIds ?? []) if (!eventIds.has(eventId)) push("error", "HYPOTHESIS_DANGLING_EVENT", hypothesis.id, `理论引用了不存在的事件 ${eventId}。`);
    for (const evidenceId of hypothesis.requiredEvidenceIds ?? []) if (!evidenceIds.has(evidenceId)) push("error", "HYPOTHESIS_DANGLING_EVIDENCE", hypothesis.id, `理论引用了不存在的证据 ${evidenceId}。`);
    for (const contradictionId of hypothesis.requiredContradictionResolutionIds ?? []) if (!contradictionIds.has(contradictionId)) push("error", "HYPOTHESIS_DANGLING_CONTRADICTION", hypothesis.id, `理论引用了不存在的矛盾 ${contradictionId}。`);
  }

  const certificate = caseFile.solutionCertificate;
  if (!hypothesisIds.has(certificate.canonicalHypothesisId)) push("error", "CERTIFICATE_DANGLING_HYPOTHESIS", caseFile.id, "证明证书的 canonical hypothesis 不存在。");
  for (const factId of certificate.requiredFactIds) if (!factIds.has(factId)) push("error", "CERTIFICATE_DANGLING_FACT", caseFile.id, `证明证书引用了不存在的事实 ${factId}。`);
  for (const evidenceId of certificate.requiredEvidenceIds) if (!evidenceIds.has(evidenceId)) push("error", "CERTIFICATE_DANGLING_EVIDENCE", caseFile.id, `证明证书引用了不存在的证据 ${evidenceId}。`);
  for (const contradictionId of certificate.requiredContradictionResolutionIds) if (!contradictionIds.has(contradictionId)) push("error", "CERTIFICATE_DANGLING_CONTRADICTION", caseFile.id, `证明证书引用了不存在的矛盾 ${contradictionId}。`);

  const replayFactIds = new Set(caseFile.proofReplay.flatMap((beat) => beat.factIds));
  for (const factId of certificate.requiredFactIds) if (!replayFactIds.has(factId)) push("warning", "REQUIRED_FACT_NO_REPLAY", factId, "必要事实没有在证明回放中出现。");
  const normalizedCorpus = corpus.map((entry) => ({ entry, result: normalizeQuestion(caseFile, entry.rawQuestion) }));
  if (corpus.length > 0 && corpus.length < 150) push("error", "CORPUS_TOO_SHORT", caseFile.id, `问题语料只有 ${corpus.length} 条，发布候选至少需要 150 条。`);
  for (const { entry, result } of normalizedCorpus) {
    if (entry.expectedStatus && result.status !== entry.expectedStatus) push("error", "CORPUS_STATUS_MISMATCH", entry.id, `语料预期 ${entry.expectedStatus}，实际为 ${result.status}。`);
    if (entry.expectedQueryId && (result.status !== "matched" || result.queryId !== entry.expectedQueryId)) push("error", "CORPUS_QUERY_MISMATCH", entry.id, `语料没有稳定映射到 ${entry.expectedQueryId}。`);
  }
  const coveredQueries = new Set(normalizedCorpus.filter(({ result }) => result.status === "matched" && result.queryId && queryIds.has(result.queryId)).map(({ result }) => result.queryId as string));
  if (corpus.length > 0 && coveredQueries.size < queryIds.size) push("warning", "QUESTION_COVERAGE_GAP", caseFile.id, `问题语料只覆盖 ${coveredQueries.size}/${queryIds.size} 个查询语义。`);
  if (caseFile.hypotheses.filter((hypothesis) => hypothesis.kind === "alternative").length < 2) push("warning", "FEW_ALTERNATIVES", caseFile.id, "案件少于两个作者错误理论，盲测容易变成单路径猜谜。");
  const hasIrrelevantQuery = caseFile.questionSemantics.some((query) => query.answerCodeWhenVisible === "irrelevant");
  const redHerringPresence = hasIrrelevantQuery || caseFile.evidenceItems.some((evidence) => evidence.supports?.length === 0 || evidence.importance === "irrelevant");
  if (!redHerringPresence) push("warning", "NO_RED_HERRING", caseFile.id, "案件没有显式无关或红鲱鱼证据。 ");
  const alternativeHypotheses = caseFile.hypotheses.filter((hypothesis) => hypothesis.kind === "alternative");
  const alternativesCovered = alternativeHypotheses.filter((hypothesis) => {
    const contradiction = caseFile.contradictions.find((item) => (item.invalidatesHypothesisIds ?? []).includes(hypothesis.id));
    return Boolean(contradiction && (contradiction.resolutionEvidenceIds ?? []).length > 0 && (contradiction.requiresFactIds ?? []).length > 0);
  }).length;
  const requiredEvidenceIds = certificate.requiredEvidenceIds;
  const proofEvidenceIds = new Set(certificate.minimumProofSets.flatMap((set) => set.evidenceIds));
  const requiredEvidenceCovered = requiredEvidenceIds.filter((id) => proofEvidenceIds.has(id)).length;
  const normalizedTexts = corpus.map((entry) => entry.rawQuestion.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "")).filter(Boolean);
  const duplicateCount = normalizedTexts.length - new Set(normalizedTexts).size;
  const ambiguityCount = normalizedCorpus.filter(({ result }) => result.status === "ambiguous").length;
  const targetMinutes = caseFile.metadata?.targetMinutes ?? { min: 5, max: 20 };

  return {
    caseId: caseFile.id,
    errors,
    warnings,
    infos,
    metrics: {
      factCount: caseFile.facts.length,
      visibleAtStart: visibleAtStart.size,
      queryCount: caseFile.questionSemantics.length,
      evidenceCount: caseFile.evidenceItems.length,
      hypothesisCount: caseFile.hypotheses.length,
      requiredEvidenceCount: certificate.requiredEvidenceIds.length,
      questionCoverage: queryIds.size === 0 ? 100 : Math.round((coveredQueries.size / queryIds.size) * 100),
      antiLeakCount: warnings.filter((item) => item.code.includes("EARLY") || item.code.includes("START")).length,
      proofReplayCoverage: certificate.requiredFactIds.length === 0 ? 100 : Math.round((certificate.requiredFactIds.filter((id) => replayFactIds.has(id)).length / certificate.requiredFactIds.length) * 100),
      alternativeCoverage: alternativeHypotheses.length === 0 ? 100 : Math.round((alternativesCovered / alternativeHypotheses.length) * 100),
      requiredEvidenceCoverage: requiredEvidenceIds.length === 0 ? 100 : Math.round((requiredEvidenceCovered / requiredEvidenceIds.length) * 100),
      ambiguityRate: corpus.length === 0 ? 0 : Math.round((ambiguityCount / corpus.length) * 100),
      duplicateQuestionRate: corpus.length === 0 ? 0 : Math.round((duplicateCount / corpus.length) * 100),
      estimatedSolveTimeMinutes: { min: targetMinutes.min, max: targetMinutes.max },
      redHerringPresence,
      corpusCount: corpus.length,
      corpusMinimumMet: corpus.length >= 150,
    },
    passed: errors.length === 0,
  };
}
