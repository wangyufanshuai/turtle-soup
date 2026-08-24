import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import type { CaseFile } from "../packages/mystery-core/src/index.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.6-internal-rc");
const blackbox = JSON.parse(readFileSync(resolve(root, "docs/v1.6-blackbox-synthetic.json"), "utf8")) as {
  traces: Array<Record<string, unknown>>;
  passed: boolean;
};

function text(caseFile: CaseFile, key: unknown, fallback = ""): string {
  if (typeof key !== "string") return fallback;
  return caseFile.localization?.["zh-CN"]?.[key] ?? fallback;
}

function normalizeSurface(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function grams(value: string, size = 5): Set<string> {
  const normalized = normalizeSurface(value);
  const result = new Set<string>();
  for (let index = 0; index + size <= normalized.length; index += 1) result.add(normalized.slice(index, index + size));
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
}

function entropy(counts: Record<string, number>): number {
  const values = Object.values(counts).filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length <= 1 || total === 0) return 0;
  const raw = values.reduce((sum, value) => {
    const p = value / total;
    return sum - p * Math.log2(p);
  }, 0);
  return raw / Math.log2(values.length);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function proofSets(caseFile: CaseFile): Array<{ id: string; evidenceIds: string[] }> {
  const sets = caseFile.solutionCertificate.minimumProofSets ?? [];
  return sets.length ? sets.map((set) => ({ id: set.id, evidenceIds: [...set.evidenceIds] })) : [{ id: "certificate-required", evidenceIds: [...caseFile.solutionCertificate.requiredEvidenceIds] }];
}

function proofSetOverlap(sets: Array<{ evidenceIds: string[] }>): number | null {
  if (sets.length < 2) return null;
  const scores: number[] = [];
  for (let left = 0; left < sets.length; left += 1) for (let right = left + 1; right < sets.length; right += 1) {
    scores.push(jaccard(new Set(sets[left].evidenceIds), new Set(sets[right].evidenceIds)));
  }
  return Number(average(scores).toFixed(3));
}

function publicTexts(caseFile: CaseFile): { surface: string; evidence: string; replay: string } {
  const surface = text(caseFile, caseFile.surface?.textKey, caseFile.surface?.textKey ?? "");
  const evidence = caseFile.evidenceItems.map((item) => `${text(caseFile, item.titleKey, item.titleKey ?? item.id)} ${text(caseFile, item.observationKey, item.observationKey ?? "")}`).join(" ");
  const replay = caseFile.proofReplay.map((beat) => text(caseFile, beat.captionKey, beat.captionKey ?? beat.id)).join(" ");
  return { surface, evidence, replay };
}

function structureFingerprint(caseFile: CaseFile): string {
  const obligationSource = caseFile.solutionCertificate.proofObligations;
  const obligations = Array.isArray(obligationSource) ? obligationSource : obligationSource ? [obligationSource] : [];
  const structure = {
    boards: (caseFile.reasoningBoards ?? []).map((board) => board.mode),
    obligations: obligations.map((item) => String(item.kind ?? "unknown")),
    eventActions: caseFile.events.map((event) => String(event.action ?? "unknown")),
    requiredEvents: caseFile.hypotheses.find((item) => item.id === caseFile.solutionCertificate.canonicalHypothesisId)?.claim?.eventIds?.length ?? 0,
    factPredicates: caseFile.facts.map((fact) => String(fact.predicate ?? fact.kind ?? "unknown")).sort(),
    queryPredicates: caseFile.questionSemantics.map((query) => String(query.predicate ?? "unknown")).sort(),
    proofSizes: proofSets(caseFile).map((set) => set.evidenceIds.length).sort((a, b) => a - b),
    alternatives: caseFile.hypotheses.filter((item) => item.kind === "alternative").length,
    chapters: caseFile.chapters?.length ?? 0,
  };
  return createHash("sha256").update(JSON.stringify(structure)).digest("hex").slice(0, 16);
}

function redHerringEvidence(caseFile: CaseFile): Set<string> {
  const proofEvidence = new Set(proofSets(caseFile).flatMap((set) => set.evidenceIds));
  return new Set(caseFile.evidenceItems.filter((item) => item.importance === "irrelevant" || item.supports?.length === 0 || !proofEvidence.has(item.id)).map((item) => item.id));
}

const loaded = release.entries.map((entry) => ({ entry, caseFile: loadCaseFile(entry) }));
const tracesByCase = new Map<string, Array<Record<string, unknown>>>();
for (const trace of blackbox.traces) {
  const caseId = String(trace.caseId ?? "");
  const list = tracesByCase.get(caseId) ?? [];
  list.push(trace);
  tracesByCase.set(caseId, list);
}

const cases: Array<Record<string, unknown>> = [];
const comparison = new Map<string, { surface: Set<string>; evidence: Set<string>; replay: Set<string>; fingerprint: string }>();
for (const { entry, caseFile } of loaded) {
  const traces = tracesByCase.get(entry.id) ?? [];
  const proof = proofSets(caseFile);
  const redHerrings = redHerringEvidence(caseFile);
  const firstEffective = traces.map((trace) => Number(trace.firstEffectiveOperation ?? 0)).filter((value) => value > 0);
  const firstAnswered = traces.map((trace) => Number(trace.firstAnsweredQuestionOperation ?? 0)).filter((value) => value > 0);
  const questionAttempts = traces.map((trace) => Number(trace.questionAttempts ?? 0));
  const answeredQuestions = traces.map((trace) => Number(trace.answeredQuestions ?? 0));
  const ambiguityAttempts = traces.map((trace) => Number(trace.ambiguityAttempts ?? 0));
  const ambiguityRecoveries = traces.map((trace) => Number(trace.ambiguityRecoveries ?? 0));
  const theoryAttempts = traces.map((trace) => Number(trace.theoryAttempts ?? 0));
  const wrongTheoryAttempts = traces.map((trace) => Number(trace.wrongTheoryAttempts ?? 0));
  const duplicateRates = traces.map((trace) => {
    const questions = ((trace.finalSummary as { interpretedQuestions?: string[] } | undefined)?.interpretedQuestions ?? []).filter(Boolean);
    return questions.length ? 1 - new Set(questions).size / questions.length : 0;
  });
  const boardEntropies = traces.map((trace) => entropy(Object.fromEntries(Object.entries((trace.commandTypeCounts ?? {}) as Record<string, number>).filter(([key]) => key.includes("reasoning")))));
  const redHerringRatios = traces.map((trace) => {
    if (redHerrings.size === 0) return 0;
    const inspected = new Set((trace.inspectedEvidenceIds as string[] | undefined) ?? []);
    return [...redHerrings].filter((id) => inspected.has(id)).length / redHerrings.size;
  });
  const replayDensity = caseFile.events.length ? caseFile.proofReplay.length / caseFile.events.length : 0;
  const obligationSource = caseFile.solutionCertificate.proofObligations;
  const obligations = Array.isArray(obligationSource) ? obligationSource : obligationSource ? [obligationSource] : [];
  const factSupportCounts = new Map<string, number>();
  for (const fact of caseFile.solutionCertificate.requiredFactIds) {
    const count = caseFile.evidenceItems.filter((item) => (item.sourceFactIds ?? []).includes(fact) && proof.some((set) => set.evidenceIds.includes(item.id))).length;
    factSupportCounts.set(fact, count);
  }
  const maxFactObligation = Math.max(0, ...factSupportCounts.values());
  const texts = publicTexts(caseFile);
  const fingerprint = structureFingerprint(caseFile);
  comparison.set(entry.id, { surface: grams(texts.surface), evidence: grams(texts.evidence, 7), replay: grams(texts.replay, 6), fingerprint });
  const boardCount = caseFile.reasoningBoards?.length ?? 0;
  const missingBoardOperations = boardCount > 0 && traces.every((trace) => Number(trace.boardCommands ?? 0) === 0);
  const highRiskReasons: string[] = [];
  if (traces.length !== 12) highRiskReasons.push("BLACKBOX_TRACE_COUNT");
  if (firstEffective.length === 0) highRiskReasons.push("NO_FIRST_EFFECTIVE_OPERATION");
  if (average(questionAttempts) > 0 && average(answeredQuestions) / average(questionAttempts) < 0.8) highRiskReasons.push("LOW_QUESTION_EFFECTIVENESS");
  if (average(ambiguityAttempts) > 0 && average(ambiguityRecoveries) / average(ambiguityAttempts) < 0.8) highRiskReasons.push("LOW_AMBIGUITY_RECOVERY");
  if (maxFactObligation > 4) highRiskReasons.push("SINGLE_FACT_OVERLOADED");
  if (missingBoardOperations) highRiskReasons.push("BOARD_NOT_EXERCISED");
  if (replayDensity < 0.35) highRiskReasons.push("LOW_REPLAY_DENSITY");
  cases.push({
    caseId: entry.id,
    seasonId: entry.seasonId,
    traceCount: traces.length,
    solvedTraceCount: traces.filter((trace) => trace.solved === true).length,
    firstEffectiveOperation: Number(average(firstEffective).toFixed(2)),
    firstAnsweredQuestionOperation: Number(average(firstAnswered).toFixed(2)),
    averageValidQuestionRate: Number((average(questionAttempts) > 0 ? average(answeredQuestions) / average(questionAttempts) : 0).toFixed(3)),
    duplicateQuestionRate: Number(average(duplicateRates).toFixed(3)),
    ambiguityRecoveryRate: Number((average(ambiguityAttempts) > 0 ? average(ambiguityRecoveries) / average(ambiguityAttempts) : 1).toFixed(3)),
    wrongTheoryRatio: Number((average(theoryAttempts) > 0 ? average(wrongTheoryAttempts) / average(theoryAttempts) : 0).toFixed(3)),
    proofFailureCategories: traces.reduce((result, trace) => {
      for (const [key, value] of Object.entries((trace.proofFailureCategories ?? {}) as Record<string, number>)) result[key] = (result[key] ?? 0) + value;
      return result;
    }, {} as Record<string, number>),
    minimumProofSetCount: proof.length,
    minimumProofSetOverlap: proofSetOverlap(proof),
    redHerringCount: redHerrings.size,
    redHerringInvestigationRate: Number(average(redHerringRatios).toFixed(3)),
    singleFactProofSupportMax: maxFactObligation,
    proofObligationCount: obligations.length,
    boardCount,
    boardOperationEntropy: Number(average(boardEntropies).toFixed(3)),
    chapterSwitchAverage: Number(average(traces.map((trace) => Number(trace.chapterUnlocks ?? 0))).toFixed(2)),
    replayBeatDensity: Number(replayDensity.toFixed(3)),
    causalStructureFingerprint: fingerprint,
    highRiskReasons,
  });
}

const similarityPairs: Array<Record<string, unknown>> = [];
for (let left = 0; left < loaded.length; left += 1) for (let right = left + 1; right < loaded.length; right += 1) {
  const leftId = loaded[left].entry.id;
  const rightId = loaded[right].entry.id;
  const a = comparison.get(leftId)!;
  const b = comparison.get(rightId)!;
  const surface = jaccard(a.surface, b.surface);
  const evidence = jaccard(a.evidence, b.evidence);
  const replay = jaccard(a.replay, b.replay);
  const sameStructure = a.fingerprint === b.fingerprint;
  const severity = surface >= 0.92 || evidence >= 0.9 || replay >= 0.92 || sameStructure ? "blocker" : surface >= 0.76 || evidence >= 0.72 || replay >= 0.78 ? "warning" : undefined;
  if (severity) similarityPairs.push({ left: leftId, right: rightId, surface: Number(surface.toFixed(3)), evidence: Number(evidence.toFixed(3)), replay: Number(replay.toFixed(3)), sameCausalStructure: sameStructure, severity });
}

const highRiskCases = cases.filter((item) => (item.highRiskReasons as string[]).length > 0).map((item) => ({ caseId: item.caseId, reasons: item.highRiskReasons }));
const report = {
  reportVersion: "1.6",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.6-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  caseCount: cases.length,
  personaTraceCount: blackbox.traces.length,
  metricDefinitions: {
    firstEffectiveOperation: "accepted public command index before the first accepted investigation action",
    firstAnsweredQuestionOperation: "accepted public command index before the first question_answered event",
    averageValidQuestionRate: "answered question events divided by question attempts",
    proofSetOverlap: "pairwise evidence-set Jaccard; null when only one certified set exists",
    boardOperationEntropy: "normalized entropy of public reasoning-board command types",
    replayBeatDensity: "proof replay beat count divided by authored event count",
  },
  cases,
  similarityPairs,
  highRiskCases,
  structuralBlockers: similarityPairs.filter((item) => item.severity === "blocker"),
  passed: cases.length === 60 && blackbox.traces.length === 720 && blackbox.passed === true && cases.every((item) => Number(item.solvedTraceCount) === 12) && !similarityPairs.some((item) => item.severity === "blocker"),
  qualification: "这些是叙事结构、节奏和交互风险代理指标；它们不能证明真人乐趣、审美、理解率、留存或市场适配。",
};
writeFileSync(resolve(root, "docs/v1.6-narrative-quality.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: report.caseCount, traces: report.personaTraceCount, highRiskCases: report.highRiskCases.length, similarityWarnings: report.similarityPairs.length, blockers: report.structuralBlockers.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
