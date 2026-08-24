import { analyzeCaseQuality, validateCaseShape } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = process.argv[2] ?? ".";
const profileId = process.argv[3] ?? process.env.TURTLE_SOUP_RELEASE_PROFILE;
const { profile, entries } = loadReleaseContent(root, profileId);
const loaded = await Promise.all(entries.map(async (entry) => ({ entry, caseFile: loadCaseFile(entry), corpus: await loadQuestionCorpus(entry) })));
const reports = loaded.map(({ entry, caseFile, corpus }) => {
  validateCaseShape(caseFile);
  const report = analyzeCaseQuality(caseFile, corpus);
    if (entry.seasonId === "season-2" || entry.seasonId === "season-4") {
    if (corpus.length < 220) report.errors.push({ severity: "error", code: "S2_CORPUS_TOO_SHORT", subjectId: caseFile.id, message: `第二季语料只有 ${corpus.length} 条，至少需要 220 条。` });
    if (report.metrics.duplicateQuestionRate >= 10) report.errors.push({ severity: "error", code: "S2_DUPLICATE_RATE", subjectId: caseFile.id, message: `第二季归一化重复率 ${report.metrics.duplicateQuestionRate}% 超过 10% 门槛。` });
    const intentionalAmbiguity = corpus.filter((item) => item.expectedStatus === "ambiguous").length;
    if (intentionalAmbiguity < 6 || intentionalAmbiguity > 12) report.errors.push({ severity: "error", code: "S2_AMBIGUITY_VECTORS", subjectId: caseFile.id, message: `第二季预期歧义语料为 ${intentionalAmbiguity}，要求 6–12 条。` });
    if ((caseFile.reasoningBoards?.length ?? 0) === 0 || (caseFile.solutionCertificate.proofObligations?.length ?? 0) === 0) report.errors.push({ severity: "error", code: "S2_REASONING_BOARD", subjectId: caseFile.id, message: "第二季案件必须定义推理板和证明义务。" });
    if (caseFile.solutionCertificate.minimumProofSets.length < 2) report.errors.push({ severity: "error", code: "S2_ALTERNATE_PROOF", subjectId: caseFile.id, message: "第二季案件必须定义两个最小证明集合。" });
    if (entry.seasonId === "season-4") {
      const count = Number(caseFile.id.match(/^c(\d+)/)?.[1] ?? 0);
      if (caseFile.events.length < 10 || caseFile.events.length > 14) report.errors.push({ severity: "error", code: "S4_EVENT_COUNT", subjectId: caseFile.id, message: `第四季事件数 ${caseFile.events.length} 不在 10–14 范围。` });
      if (caseFile.facts.length < 16 || caseFile.facts.length > 22) report.errors.push({ severity: "error", code: "S4_FACT_COUNT", subjectId: caseFile.id, message: `第四季事实数 ${caseFile.facts.length} 不在 16–22 范围。` });
      if (caseFile.evidenceItems.length < 10 || caseFile.evidenceItems.length > 14) report.errors.push({ severity: "error", code: "S4_EVIDENCE_COUNT", subjectId: caseFile.id, message: `第四季证据数 ${caseFile.evidenceItems.length} 不在 10–14 范围。` });
      if (caseFile.proofReplay.length < 6 || (count === 60 && (caseFile.chapters?.length ?? 0) < 2)) report.errors.push({ severity: "error", code: "S4_REPLAY_OR_CHAPTER", subjectId: caseFile.id, message: "第四季回放或 C60 章节门槛未满足。" });
      if (report.metrics.duplicateQuestionRate >= 10 || report.metrics.ambiguityRate < 2) report.errors.push({ severity: "error", code: "S4_LANGUAGE_GATE", subjectId: caseFile.id, message: "第四季语言覆盖或安全歧义门槛未满足。" });
    }
    report.passed = report.errors.length === 0;
  }
  return report;
});

const crossErrors: Array<{ severity: "error"; code: string; subjectId: string; message: string }> = [];
const seenHashes = new Map<string, string>();
const fingerprints = new Map<string, string>();
for (const { entry, caseFile } of loaded) {
  const hash = caseFile.metadata?.canonicalHash;
  if (hash && seenHashes.has(hash)) crossErrors.push({ severity: "error", code: "DUPLICATE_CONTENT_HASH", subjectId: caseFile.id, message: `内容哈希与 ${seenHashes.get(hash)} 重复。` });
  if (hash) seenHashes.set(hash, caseFile.id);
    if (entry.seasonId === "season-2" || entry.seasonId === "season-4") {
    const mode = (caseFile.reasoningBoards ?? []).map((board) => board.mode).join("+") || "none";
    const kind = caseFile.solutionCertificate.proofObligations?.[0]?.kind ?? "none";
    const fingerprint = `${mode}:${kind}:${caseFile.events.length}:${caseFile.evidenceItems.length}:${caseFile.metadata?.contentTags?.[0] ?? "none"}`;
    if (fingerprints.has(fingerprint)) crossErrors.push({ severity: "error", code: "DUPLICATE_PROOF_FINGERPRINT", subjectId: caseFile.id, message: `证明结构指纹与 ${fingerprints.get(fingerprint)} 重复。` });
    fingerprints.set(fingerprint, caseFile.id);
  }
}
if (crossErrors.length) reports.push({ caseId: "__cross-case__", errors: crossErrors, warnings: [], infos: [], metrics: { factCount: 0, visibleAtStart: 0, queryCount: 0, evidenceCount: 0, hypothesisCount: 0, requiredEvidenceCount: 0, questionCoverage: 100, antiLeakCount: 0, proofReplayCoverage: 100, alternativeCoverage: 100, requiredEvidenceCoverage: 100, ambiguityRate: 0, duplicateQuestionRate: 0, estimatedSolveTimeMinutes: { min: 0, max: 0 }, redHerringPresence: true, corpusCount: 0, corpusMinimumMet: true }, passed: false });
console.log(JSON.stringify({ profile: profile.id, caseCount: loaded.length, reports }, null, 2));
if (reports.some((report) => !report.passed)) process.exitCode = 1;
