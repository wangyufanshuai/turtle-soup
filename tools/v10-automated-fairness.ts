import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeCaseQuality, createRuntimeState, normalizeQuestion, projectPlayerState } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const reportPath = resolve(root, "docs/v1.0-automated-fairness.json");
const { entries } = loadReleaseContent(root, "v1.0-internal-rc");
const results = [];
for (const entry of entries) {
  const caseFile = loadCaseFile(entry);
  const corpus = await loadQuestionCorpus(entry);
  const quality = analyzeCaseQuality(caseFile, corpus);
  const mismatches = corpus.filter((vector) => { const result = normalizeQuestion(caseFile, vector.rawQuestion); return (vector.expectedStatus && result.status !== vector.expectedStatus) || (vector.expectedQueryId && result.queryId !== vector.expectedQueryId); });
  const opening = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile)));
  const leaks = ["solutionCertificate", "canonicalHypothesisId", ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id)].filter((value) => opening.includes(value));
  const secondSeason = entry.seasonId === "season-2";
  const secondSeasonGates = !secondSeason || (corpus.length >= 220 && quality.metrics.duplicateQuestionRate < 10 && quality.metrics.proofReplayCoverage === 100 && quality.metrics.requiredEvidenceCoverage === 100 && quality.metrics.alternativeCoverage === 100 && (caseFile.solutionCertificate.minimumProofSets?.length ?? 0) >= 2 && (caseFile.solutionCertificate.proofObligations?.length ?? 0) > 0);
  results.push({ id: caseFile.id, seasonId: entry.seasonId, corpus: corpus.length, mismatches: mismatches.length, openingLeaks: leaks, quality: quality.metrics, proofSets: caseFile.solutionCertificate.minimumProofSets.length, boardModes: caseFile.reasoningBoards?.map((board) => board.mode) ?? [], secondSeasonGates, passed: quality.passed && mismatches.length === 0 && leaks.length === 0 && secondSeasonGates });
}
const report = { reportVersion: "1.0", generatedAt: new Date().toISOString(), mode: "deterministic-automated-fairness", qualification: "This verifies deterministic fairness, reachability inputs and anti-leak boundaries. It is not evidence of human comprehension or fun.", humanParticipants: 0, humanFunGate: "pending", caseCount: results.length, seasonTwoCorpus: results.filter((item) => item.seasonId === "season-2").reduce((sum, item) => sum + item.corpus, 0), results, passed: results.length === 24 && results.every((item) => item.passed) };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, cases: report.caseCount, seasonTwoCorpus: report.seasonTwoCorpus, failures: results.filter((item) => !item.passed).map((item) => item.id), passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
