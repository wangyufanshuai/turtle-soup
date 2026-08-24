import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reasoningBoardBehavior, type ReasoningBoardMode } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const writeJson = (path: string, value: unknown) => writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const readJson = <T>(path: string): T | undefined => { const absolute = resolve(root, path); return existsSync(absolute) ? JSON.parse(readFileSync(absolute, "utf8")) as T : undefined; };
const v14 = loadReleaseContent(root, "v1.4-internal-rc");
const v13 = loadReleaseContent(root, "v1.3-public-preview");
const v14Cases = v14.entries.map(loadCaseFile);
const v13ById = new Map(v13.entries.map((entry) => [entry.id, entry]));
const compatibility = v14.entries.map((entry) => {
  const old = v13ById.get(entry.id);
  const file = loadCaseFile(entry);
  const truthDigest = createHash("sha256").update(JSON.stringify({ events: file.events, facts: file.facts, evidenceRelations: file.evidenceItems.map((item) => ({ id: item.id, sourceFactIds: item.sourceFactIds, sourceEventIds: item.sourceEventIds, supports: item.supports, conflicts: item.conflicts })), certificate: file.solutionCertificate })).digest("hex");
  const actualFileSha256 = createHash("sha256").update(readFileSync(entry.casePath)).digest("hex");
  return { id: entry.id, presentInV13: Boolean(old), canonicalHashUnchanged: Boolean(old && old.canonicalHash === entry.canonicalHash), contentVersionUnchanged: Boolean(old && old.contentVersion === entry.contentVersion), manifestFileHashAvailable: Boolean(entry.fileSha256), manifestFileHashUnchanged: entry.fileSha256 ? actualFileSha256 === entry.fileSha256 : null, actualFileSha256, truthStructureDigest: truthDigest };
});
const frozenManifest = readJson<{ cases: Array<{ id: string; fileSha256?: string; file: string }> }>("content/zh/cases/manifest.v0.6.json");
const season1Hashes = (frozenManifest?.cases ?? []).map((entry) => { const path = resolve(root, "content/zh/cases", entry.file); const actual = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null; return { id: entry.id, expected: entry.fileSha256, actual, unchanged: Boolean(entry.fileSha256 && actual === entry.fileSha256) }; });
const previousArchives = [
  ["v1.0", "dist/turtle-soup-v1.0-internal-rc-web-pwa.zip", "83e2ee8e477ce9103735ea3d8eb0011ae6b72e257a286c7e009a2ef98cf7322b"],
  ["v1.1", "dist/turtle-soup-v1.1-internal-rc-web-pwa.zip", "0bc2b077317b6d32c2df10e14d35520917839a68d18b70d23fafa74991cb3f35"],
  ["v1.2", "dist/turtle-soup-v1.2-internal-rc-web-pwa.zip", "c3416a0ec807f9b94da8f00a0caab82b1b81e5745b6a5fd8b49c33e1279c7eb7"],
  ["v1.3", "dist/turtle-soup-v1.3-public-preview-web-pwa.zip", "f0dab2d4b0ce62897382e299da6aebb8655f572f106b89de12c855654002226e"],
] as const;
const preservedArtifacts = previousArchives.map(([version, path, expectedSha256]) => { const absolute = resolve(root, path); const actualSha256 = existsSync(absolute) ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : null; return { version, path, expectedSha256, actualSha256, exists: Boolean(actualSha256), unchanged: actualSha256 === expectedSha256 }; });
const authenticity = readJson<{ passed: boolean; caseCount: number; cases: Array<{ naturalFirstQuestion: boolean; issues: string[]; metrics: { placeholderCopyCount: number }; focusedReview?: { deepReviewComplete: boolean } }> }>("docs/v1.4-content-authenticity.json");
const synthetic = readJson<{ passed: boolean; caseCount: number; runCount: number; personas: string[]; cases: Array<{ personas: Array<{ persona: string; passed: boolean; challenges?: { allDefined: boolean } }> }> }>("docs/v1.4-synthetic-comprehension.json");
const paths = readJson<{ passed: boolean; cases: Array<{ passed: boolean; primaryExecution: { passed: boolean }; alternateExecution: { passed: boolean } }> }>("docs/v1.4-question-paths.json");
const proof = readJson<{ passed: boolean; cases: Array<{ passed: boolean; actualExecutionPathCount: number; proofExecutions: Array<{ solved: boolean }>; proofSets: Array<{ mutationResults: Array<{ solvedAfterRemoval: boolean }> }>; redHerringId?: string; redHerringDeletionExecuted: boolean; solvedAfterRedHerringDeletion: boolean }> }>("docs/v1.4-proof-necessity.json");
const browser = readJson<{ passed: boolean; caseCount: number; representativeCount: number }>("docs/v1.4-browser-matrix.json");
const performance = readJson<{ passed: boolean }>("docs/v1.4-static-performance.json");
const security = readJson<{ passed: boolean }>("docs/v1.4-security-scan.json");
const artifact = readJson<{ passed: boolean; artifact?: { archive?: { sha256?: string } } }>("docs/v1.4-release-artifacts.json");
const visual = readJson<{ passed: boolean; focusedCases?: unknown[] }>("docs/v1.4-visual-review.json");
const rootFiles = existsSync(resolve(root, "apps/web/out")) ? readdirSync(resolve(root, "apps/web/out")) : [];
const requiredReports = ["docs/v1.4-content-authenticity.json", "docs/v1.4-synthetic-comprehension.json", "docs/v1.4-question-paths.json", "docs/v1.4-proof-necessity.json", "docs/v1.4-browser-matrix.json", "docs/v1.4-static-performance.json", "docs/v1.4-security-scan.json", "docs/v1.4-visual-review.json", "docs/v1.4-release-artifacts.json"];
const reportPresence = requiredReports.map((path) => ({ path, exists: existsSync(resolve(root, path)) }));
const expectedBoardRoles: Partial<Record<ReasoningBoardMode, string[]>> = {
  "calibration-curve": ["端点", "中段", "误差带"],
  "control-loop": ["命令", "反馈", "执行"],
  "signal-chain": ["发送", "缓存", "显示"],
  "network-topology": ["路由", "去重", "确认"],
  "uncertainty-band": ["估计", "范围", "排除"],
  "reference-frame": ["基准", "投影", "对齐"],
  "queue-model": ["入队", "合并", "出队"],
};
const boardBehaviorVerified = Object.entries(expectedBoardRoles).every(([mode, roles]) => {
  const behavior = reasoningBoardBehavior(mode as ReasoningBoardMode);
  return roles.every((role, index) => behavior.slotRoles[index] === role) && behavior.connectionVerbs.length >= 3 && behavior.requiredDistinctRoles >= 3;
});
const report = {
  reportVersion: "1.4",
  verifiedAt: new Date().toISOString(),
  releaseProfile: "v1.4-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  caseCount: v14Cases.length,
  seasonCounts: Object.fromEntries([...new Set(v14.entries.map((entry) => entry.seasonId))].map((seasonId) => [seasonId, v14.entries.filter((entry) => entry.seasonId === seasonId).length])),
  frozenCompatibility: { firstSeasonFileHashes: season1Hashes, c01ToC60: compatibility, fileHashesVerified: compatibility.filter((item) => item.manifestFileHashAvailable).length, canonicalHashesVerified: compatibility.length, allUnchanged: season1Hashes.every((item) => item.unchanged) && compatibility.length === 60 && compatibility.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && (item.manifestFileHashUnchanged ?? true)) },
  preservedArtifacts,
  reports: { presence: reportPresence, authenticity, synthetic, paths, proof, browser, performance, security, visual, artifact },
  gates: {
    contentAuthenticity: Boolean(authenticity?.passed && authenticity.caseCount === 60 && authenticity.cases.every((item) => item.naturalFirstQuestion && item.metrics.placeholderCopyCount === 0 && item.issues.length === 0) && authenticity.cases.filter((item) => item.focusedReview?.deepReviewComplete).length === 6),
    syntheticComprehension: Boolean(synthetic?.passed && synthetic.caseCount === 60 && synthetic.runCount === 720 && synthetic.personas.length === 12 && synthetic.cases.every((item) => item.personas.length === 12 && item.personas.every((persona) => persona.passed) && item.personas.find((persona) => persona.persona === "challenge-mode")?.challenges?.allDefined === true)),
    questionPaths: Boolean(paths?.passed && paths.cases.length === 60 && paths.cases.every((item) => item.passed && item.primaryExecution.passed && item.alternateExecution.passed)),
    proofNecessity: Boolean(proof?.passed && proof.cases.length === 60 && proof.cases.every((item) => item.passed && item.actualExecutionPathCount === 2 && item.proofExecutions.every((execution) => execution.solved) && item.proofSets.every((set) => set.mutationResults.every((mutation) => !mutation.solvedAfterRemoval)) && (!item.redHerringId || (item.redHerringDeletionExecuted && item.solvedAfterRedHerringDeletion)))),
    boardBehavior: boardBehaviorVerified,
    browser: Boolean(browser?.passed && browser.caseCount === 60),
    performance: Boolean(performance?.passed),
    security: Boolean(security?.passed),
    visual: Boolean(visual?.passed && visual.focusedCases?.length === 6),
    package: Boolean(artifact?.passed),
    previousArtifacts: preservedArtifacts.every((item) => item.unchanged),
  },
  outputRootFiles: rootFiles.length,
  qualification: "This report proves deterministic consistency, compatibility, publication hygiene and automation coverage only. It does not establish human comprehension, fun, pacing, aesthetics or market fit.真人参与为 0，等待未来正式 Fun Gate。",
};
report.passed = v14Cases.length === 60 && Object.values(report.gates).every(Boolean);
writeJson("docs/v1.4-release-verification.json", report);
console.log(JSON.stringify({ releaseProfile: report.releaseProfile, cases: report.caseCount, passed: report.passed, gates: report.gates }, null, 2));
if (!report.passed) process.exitCode = 1;
