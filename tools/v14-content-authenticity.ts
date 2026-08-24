import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPresentationPatch, validatePresentationPatch, type CaseFile, type CasePresentationPatch, type QueryCorpusEntry } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.4-internal-rc");
const patches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as CasePresentationPatch[];
const patchByCase = new Map(patches.map((patch) => [patch.caseId, patch]));
const focusedIds = ["c01-cold-room-knock", "c13-second-waterline", "c25-silent-second-bell", "c37-zeroed-pressure-gauge", "c48-two-point-calibration", "c60-last-sample-before-stop"];
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
const templateNormalize = (value: string) => normalize(value.replace(/“[^”]+”/g, "对象").replace(/\d+(?:\.\d+)?/g, "数值"));
const placeholderCopyPattern = /(?:证据\s*\d+|只记录[“"].+?[”"]这个可核对的观察|来源记录显示[“"].+?[”"]在该阶段保持可复核|请核对[:：]|限定角度|回放\s*[·・]?\s*拍点|阶段\s*\d+[:：])/u;
const unnaturalQuestionPattern = /(?:请核对|限定角度|这条信息是否成立|是否成立[？?]?|能确认.+吗)/u;
const feedbackKeys = ["missing-time", "missing-space", "missing-source", "missing-identity", "missing-measurement", "missing-state", "missing-alternative"];
const grams = (value: string, size = 5) => { const text = value; const output = new Set<string>(); for (let index = 0; index + size <= text.length; index += 1) output.add(text.slice(index, index + size)); return output; };
const jaccard = (left: Set<string>, right: Set<string>) => { const union = new Set([...left, ...right]); if (!union.size) return 0; let intersection = 0; for (const item of left) if (right.has(item)) intersection += 1; return intersection / union.size; };
function copy(caseFile: CaseFile, key: unknown, fallback: string) { return typeof key === "string" ? (caseFile.localization?.["zh-CN"]?.[key] ?? fallback) : fallback; }
function matchedCorpus(corpus: QueryCorpusEntry[]) { return corpus.filter((item) => item.expectedStatus === "matched" || (!item.expectedStatus && Boolean(item.expectedQueryId))); }

function scoreCase(caseFile: CaseFile, corpus: QueryCorpusEntry[], seasonId: string) {
  const patch = patchByCase.get(caseFile.id);
  const validation = patch ? validatePresentationPatch(patch, caseFile) : undefined;
  const publicCase = applyPresentationPatch(caseFile, validation?.ok ? patch : undefined);
  const title = copy(publicCase, publicCase.surface?.titleKey ?? publicCase.metadata?.titleKey, caseFile.id);
  const surface = copy(publicCase, publicCase.surface?.textKey, "一件等待证明的异常事件。");
  const certificate = publicCase.solutionCertificate;
  const proofSets = certificate.minimumProofSets?.length ? certificate.minimumProofSets : [{ id: "legacy-required", evidenceIds: certificate.requiredEvidenceIds }];
  const requiredEvidence = new Set(certificate.requiredEvidenceIds);
  const proofUnion = new Set(proofSets.flatMap((set) => set.evidenceIds));
  const alternatives = publicCase.hypotheses.filter((item) => item.kind === "alternative");
  const alternativeReview = alternatives.map((hypothesis) => {
    const contradiction = publicCase.contradictions.find((item) => (item.invalidatesHypothesisIds ?? []).includes(hypothesis.id));
    return { label: copy(publicCase, hypothesis.labelKey, "备选路径"), hasConcreteClaim: Boolean((hypothesis.claim?.eventIds?.length ?? 0) || (hypothesis.claim?.assertedPropositions?.length ?? 0)), publiclyResolvable: Boolean(contradiction && (contradiction.resolutionEvidenceIds?.length ?? 0) > 0 && (contradiction.requiresFactIds?.length ?? 0) > 0) };
  });
  const redHerring = publicCase.evidenceItems.find((item) => item.importance === "irrelevant" || (item.supports ?? []).length === 0);
  const redHerringOptional = Boolean(redHerring && proofSets.every((set) => !set.evidenceIds.includes(redHerring.id)));
  const evidenceTexts = publicCase.evidenceItems.map((item) => `${copy(publicCase, item.titleKey, item.id)} ${copy(publicCase, item.observationKey, "")}`);
  const evidenceObservations = publicCase.evidenceItems.map((item) => copy(publicCase, item.observationKey, ""));
  const evidenceLiteralUniqueRate = new Set(evidenceTexts.map(normalize)).size / Math.max(1, evidenceTexts.length);
  const evidenceTemplateUniqueRate = new Set(evidenceObservations.map(templateNormalize)).size / Math.max(1, evidenceObservations.length);
  const evidenceUniqueRate = evidenceLiteralUniqueRate * .35 + evidenceTemplateUniqueRate * .65;
  const replayCaptions = publicCase.proofReplay.map((beat) => copy(publicCase, beat.captionKey, "事件成立"));
  const replayFactIds = new Set(publicCase.proofReplay.flatMap((beat) => beat.factIds));
  const requiredReplayRate = certificate.requiredFactIds.length ? certificate.requiredFactIds.filter((id) => replayFactIds.has(id)).length / certificate.requiredFactIds.length : 1;
  const matched = matchedCorpus(corpus);
  const queryPaths = [...new Set(matched.map((item) => item.expectedQueryId).filter((id): id is string => Boolean(id)))];
  const fallbackQueries = publicCase.questionSemantics.map((query) => query.id);
  const routedQueries = queryPaths.length ? queryPaths : fallbackQueries;
  const investigationPaths = [routedQueries.slice(0, 3), routedQueries.slice(Math.max(0, routedQueries.length - 3))].filter((path, index, all) => path.length >= 2 && (index === 0 || path.join("|") !== all[0].join("|")));
  const initialPromptId = publicCase.surface?.initialQuestionPrompts?.find((id) => publicCase.questionSemantics.some((query) => query.id === id));
  const initialQuery = publicCase.questionSemantics.find((query) => query.id === initialPromptId) ?? publicCase.questionSemantics[0];
  const firstQuestion = initialQuery ? copy(publicCase, initialQuery.labelKey, initialQuery.examplePhrases?.[0] ?? matched[0]?.rawQuestion ?? "") : matched[0]?.rawQuestion ?? null;
  const naturalFirstQuestion = Boolean(firstQuestion && firstQuestion.length >= 5 && firstQuestion.length <= 80 && !unnaturalQuestionPattern.test(firstQuestion));
  const mechanismOneLine = String(certificate.uniquenessClaim ?? `${title} 的最小因果机制`);
  const surfaceLeakage = mechanismOneLine ? jaccard(grams(normalize(surface)), grams(normalize(mechanismOneLine))) : 0;
  const publicCopy = [surface, ...evidenceTexts, ...replayCaptions, ...publicCase.questionSemantics.map((query) => copy(publicCase, query.labelKey, "")), ...publicCase.hypotheses.map((hypothesis) => copy(publicCase, hypothesis.labelKey, ""))];
  const placeholderCopy = publicCopy.filter((text) => placeholderCopyPattern.test(text));
  const focused = focusedIds.includes(caseFile.id);
  const focusedCoverage = {
    surface: Boolean(patch?.surface),
    answers: Object.keys(patch?.answerTemplates ?? {}).length >= 6,
    questions: Object.keys(patch?.questionLabels ?? {}).length === publicCase.questionSemantics.length,
    feedback: feedbackKeys.every((key) => Boolean(patch?.feedbackCopy?.[key])),
    evidence: Object.keys(patch?.evidenceCopy ?? {}).length === publicCase.evidenceItems.length,
    hypotheses: Object.keys(patch?.hypothesisLabels ?? {}).length === publicCase.hypotheses.length,
    chapters: Object.keys(patch?.chapterTitles ?? {}).length === (publicCase.chapters?.length ?? 0),
    replay: Object.keys(patch?.replayCaptions ?? {}).length === publicCase.proofReplay.length,
    visualLanguage: Boolean(publicCase.presentation?.sceneAsset && publicCase.presentation?.evidenceVisualMode),
  };
  const deepReviewComplete = !focused || (Object.values(focusedCoverage).every(Boolean) && naturalFirstQuestion && placeholderCopy.length === 0 && evidenceTemplateUniqueRate >= .85);
  const components = {
    mechanismClarity: mechanismOneLine.length >= 12 && mechanismOneLine.length <= 180 ? 100 : 70,
    evidenceNecessity: requiredEvidence.size > 0 && [...requiredEvidence].every((id) => proofUnion.has(id)) ? 100 : 50,
    alternativeCoverage: alternatives.length >= 2 && alternativeReview.every((item) => item.hasConcreteClaim && item.publiclyResolvable) ? 100 : 55,
    redHerring: redHerring && (redHerringOptional || seasonId === "season-1") ? 100 : 45,
    questionPaths: naturalFirstQuestion && investigationPaths.length >= 2 ? 100 : 55,
    evidenceDiversity: Math.round(evidenceUniqueRate * 100),
    replayCoherence: Math.round(requiredReplayRate * 100),
    spoilerDiscipline: surfaceLeakage < .65 ? 100 : 45,
    copyAuthenticity: placeholderCopy.length === 0 ? 100 : Math.max(0, 100 - placeholderCopy.length * 20),
  };
  const score = Math.round(components.mechanismClarity * .12 + components.evidenceNecessity * .17 + components.alternativeCoverage * .14 + components.redHerring * .08 + components.questionPaths * .12 + components.evidenceDiversity * .12 + components.replayCoherence * .08 + components.spoilerDiscipline * .08 + components.copyAuthenticity * .09);
  return {
    caseId: caseFile.id, title, seasonId, presentationRevision: patch?.presentationRevision ?? 0, patchValid: !patch || validation?.ok === true, score,
    mechanismOneLine, firstNaturalQuestion: firstQuestion, naturalFirstQuestion, investigationPaths, minimumProofPaths: proofSets.map((set) => ({ id: set.id, evidenceCount: set.evidenceIds.length })), alternativeReview,
    focusedReview: focused ? { deepReviewComplete, coverage: focusedCoverage } : undefined,
    components,
    metrics: { surfaceCharacters: surface.length, eventCount: publicCase.events.length, factCount: publicCase.facts.length, evidenceCount: publicCase.evidenceItems.length, queryCount: publicCase.questionSemantics.length, corpusCount: corpus.length, matchedCorpusCount: matched.length, proofSetCount: proofSets.length, requiredEvidenceCount: requiredEvidence.size, proofUnionCount: proofUnion.size, alternativeCount: alternatives.length, redHerringId: redHerring?.id ?? null, redHerringOptional, evidenceUniqueRate: Number(evidenceUniqueRate.toFixed(3)), evidenceLiteralUniqueRate: Number(evidenceLiteralUniqueRate.toFixed(3)), evidenceTemplateUniqueRate: Number(evidenceTemplateUniqueRate.toFixed(3)), placeholderCopyCount: placeholderCopy.length, requiredReplayRate: Number(requiredReplayRate.toFixed(3)), surfaceLeakage: Number(surfaceLeakage.toFixed(3)), replayBeatCount: publicCase.proofReplay.length },
    issues: [!patch || validation?.ok ? "" : "PRESENTATION_PATCH_INVALID", !naturalFirstQuestion ? "FIRST_QUESTION_AUTHORING_TEMPLATE" : "", placeholderCopy.length ? "PLACEHOLDER_PRESENTATION_COPY" : "", components.evidenceDiversity < 85 ? "EVIDENCE_COPY_SIMILARITY_REVIEW" : "", components.spoilerDiscipline < 100 ? "SURFACE_OVERLAP_REVIEW" : "", investigationPaths.length < 2 ? "SECOND_INVESTIGATION_PATH_REVIEW" : "", focused && !deepReviewComplete ? "FOCUSED_DEEP_REVIEW_INCOMPLETE" : ""].filter(Boolean),
    _comparison: { surface: normalize(surface), evidence: templateNormalize(evidenceTexts.join(" ")), replay: templateNormalize(replayCaptions.join(" ")), rhythm: publicCase.proofReplay.map((beat) => beat.factIds.length).join("-") },
  };
}

const loaded = [];
for (const entry of release.entries) loaded.push({ entry, caseFile: loadCaseFile(entry), corpus: await loadQuestionCorpus(entry) });
const scored = loaded.map(({ entry, caseFile, corpus }) => scoreCase(caseFile, corpus, entry.seasonId));
const similarities: Array<{ left: string; right: string; surface: number; evidenceTemplate: number; replayCopy: number; replayRhythmEqual: boolean; severity: "warning" | "blocker" }> = [];
for (let leftIndex = 0; leftIndex < scored.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < scored.length; rightIndex += 1) {
  const left = scored[leftIndex]; const right = scored[rightIndex];
  const surface = jaccard(grams(left._comparison.surface), grams(right._comparison.surface));
  const evidenceTemplate = jaccard(grams(left._comparison.evidence, 7), grams(right._comparison.evidence, 7));
  const replayCopy = jaccard(grams(left._comparison.replay, 6), grams(right._comparison.replay, 6));
  const blocker = surface >= .92 || evidenceTemplate >= .9 || replayCopy >= .92;
  const warning = surface >= .76 || evidenceTemplate >= .72 || replayCopy >= .78;
  if (blocker || warning) similarities.push({ left: left.caseId, right: right.caseId, surface: Number(surface.toFixed(3)), evidenceTemplate: Number(evidenceTemplate.toFixed(3)), replayCopy: Number(replayCopy.toFixed(3)), replayRhythmEqual: left._comparison.rhythm === right._comparison.rhythm, severity: blocker ? "blocker" : "warning" });
}
const caseReports = scored.map(({ _comparison, ...report }) => report);
const reviewDir = resolve(root, "docs/v1.4-content-reviews"); mkdirSync(reviewDir, { recursive: true });
for (const id of focusedIds) {
  const item = caseReports.find((report) => report.caseId === id); if (!item) continue;
  writeFileSync(resolve(reviewDir, `${id}.md`), `# ${item.title} · v1.4 内容真实性审查\n\n- 状态：internal-rc / human-evaluation-pending\n- presentation revision：${item.presentationRevision}\n- 自动质量分：${item.score}/100\n- 深修字段完整：${item.focusedReview?.deepReviewComplete ? "是" : "否"}\n- 核心机制：${item.mechanismOneLine}\n- 自然第一问：${item.firstNaturalQuestion ?? "待真人验证"}\n- 可行调查路径：${item.investigationPaths.length}\n- 最小证明路径：${item.minimumProofPaths.length}\n- 错误理论可排除：${item.alternativeReview.filter((path) => path.publiclyResolvable).length}/${item.alternativeReview.length}\n- 红鲱鱼非必要：${item.metrics.redHerringOptional ? "是" : "冻结基线例外"}\n- 证据语义多样性：${item.components.evidenceDiversity}\n- 占位式公开文案：${item.metrics.placeholderCopyCount}\n- 回放连贯性：${item.components.replayCoherence}\n- 场景与证据视觉语言：${item.focusedReview?.coverage.visualLanguage ? "已登记" : "缺失"}\n- 机器审查不修改真相图、事实关系或判定逻辑。\n- 真人参与：0；本报告不宣称案件已被证明好玩。\n`, "utf8");
}
const generatedAt = new Date().toISOString();
const report = { reportVersion: "1.4", generatedAt, releaseProfile: "v1.4-internal-rc", status: "internal-rc / human-evaluation-pending", humanParticipants: 0, caseCount: caseReports.length, thresholds: { minimumScore: 70, focusedMinimumScore: 90, surfaceWarning: .76, surfaceBlocker: .92, evidenceWarning: .72, evidenceBlocker: .9, replayWarning: .78, replayBlocker: .92 }, cases: caseReports, similarityPairs: similarities, passed: caseReports.length === 60 && caseReports.every((item) => item.patchValid && item.score >= 70 && item.investigationPaths.length >= 2 && item.naturalFirstQuestion) && focusedIds.every((id) => { const item = caseReports.find((candidate) => candidate.caseId === id); return Boolean(item && item.score >= 90 && item.focusedReview?.deepReviewComplete); }) && !similarities.some((item) => item.severity === "blocker"), qualification: "This is an automated content-authenticity lower bound. It does not establish human comprehension, fun, pacing, aesthetics or market fit." };
writeFileSync(resolve(root, "docs/v1.4-content-authenticity.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: report.caseCount, minimumScore: Math.min(...caseReports.map((item) => item.score)), similarityWarnings: similarities.filter((item) => item.severity === "warning").length, similarityBlockers: similarities.filter((item) => item.severity === "blocker").length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
