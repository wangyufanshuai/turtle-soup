import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeCaseQuality, createRuntimeState, normalizeQuestion, projectPlayerState } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const reportPath = resolve(root, "docs/v1.1-automated-fairness.json");
const { entries } = loadReleaseContent(root, "v1.1-internal-rc");
const results = [];
for (const entry of entries) {
  const caseFile = loadCaseFile(entry);
  const corpus = await loadQuestionCorpus(entry);
  const quality = analyzeCaseQuality(caseFile, corpus);
  const mismatches = corpus.filter((vector) => { const result = normalizeQuestion(caseFile, vector.rawQuestion); return (vector.expectedStatus && result.status !== vector.expectedStatus) || (vector.expectedQueryId && result.queryId !== vector.expectedQueryId); });
  const opening = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile)));
  const leaks = ["solutionCertificate", "canonicalHypothesisId", ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id)].filter((value) => opening.includes(value));
  const newSeason = entry.seasonId === "season-3";
  const gates = !newSeason || (corpus.length >= 220 && quality.metrics.duplicateQuestionRate < 10 && quality.metrics.proofReplayCoverage === 100 && quality.metrics.requiredEvidenceCoverage === 100 && quality.metrics.alternativeCoverage === 100 && caseFile.solutionCertificate.minimumProofSets.length >= 2 && (caseFile.reasoningBoards?.length ?? 0) >= 2);
  results.push({ id: caseFile.id, seasonId: entry.seasonId, corpus: corpus.length, mismatches: mismatches.length, openingLeaks: leaks, quality: quality.metrics, proofSets: caseFile.solutionCertificate.minimumProofSets.length, boardModes: caseFile.reasoningBoards?.map((board) => board.mode) ?? [], gates, passed: quality.passed && mismatches.length === 0 && leaks.length === 0 && gates });
}
const report = { reportVersion: "1.1", generatedAt: new Date().toISOString(), releaseProfile: "v1.1-internal-rc", mode: "deterministic-automated-fairness", qualification: "验证确定性公平、可达性、证明覆盖和反泄漏；不能证明真人理解、乐趣、节奏或市场竞争力。", humanParticipants: 0, humanFunGate: "pending", caseCount: results.length, seasonTwoCorpus: results.filter((item) => item.seasonId === "season-2").reduce((sum, item) => sum + item.corpus, 0), seasonThreeCorpus: results.filter((item) => item.seasonId === "season-3").reduce((sum, item) => sum + item.corpus, 0), totalCorpus: results.reduce((sum, item) => sum + item.corpus, 0), results, passed: results.length === 36 && results.every((item) => item.passed) };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, cases: report.caseCount, totalCorpus: report.totalCorpus, failures: results.filter((item) => !item.passed).map((item) => item.id), passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
