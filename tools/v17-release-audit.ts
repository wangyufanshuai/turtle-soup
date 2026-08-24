import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOLDEN_CASE_IDS, GOLDEN_PATH_CASE_IDS } from "../apps/web/lib/golden-experience.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
let checkPassed = true;
try { execSync("npm run check", { cwd: root, stdio: "inherit", env: { ...process.env, TURTLE_SOUP_RELEASE_PROFILE: "v1.7-internal-rc" }, shell: true }); } catch { checkPassed = false; }
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const release = loadReleaseContent(root, "v1.7-internal-rc");
const baseline = loadReleaseContent(root, "v1.6-internal-rc");
const cases = release.entries.map(loadCaseFile);
const budgeted = read<any>("docs/v1.7-budgeted-synthetic.json");
const experience = read<any>("docs/v1.7-experience-calibration.json");
const soundscape = read<any>("docs/v1.7-soundscape-calibration.json");
const browser = read<any>("docs/v1.7-browser-matrix.json");
const visual = read<any>("docs/v1.7-visual-review.json");
const performance = read<any>("docs/v1.7-static-performance.json");
const security = read<any>("docs/v1.7-security-scan.json");
const rebuild = read<any>("docs/v1.7-rebuild-determinism.json");
const artifact = read<any>("docs/v1.7-release-artifacts.json");
const requirements = read<any>("docs/v1.7-requirement-audit.json");
const proof = read<any>("docs/v1.4-proof-necessity.json");
const authenticity = read<any>("docs/v1.4-content-authenticity.json");

const baselineById = new Map(baseline.entries.map((entry) => [entry.id, entry]));
const frozenCompatibility = release.entries.map((entry) => {
  const prior = baselineById.get(entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: entry.canonicalHash === prior?.canonicalHash, contentVersionUnchanged: entry.contentVersion === prior?.contentVersion, casePathUnchanged: entry.casePath === prior?.casePath };
});
let frozenSourceTree = false;
let sourceBaselineTag = "";
try {
  execSync("git diff --quiet v1.6-source-baseline -- content/zh/cases", { cwd: root, stdio: "ignore", shell: true });
  frozenSourceTree = true;
  sourceBaselineTag = execSync("git rev-list -n 1 v1.6-source-baseline", { cwd: root, encoding: "utf8", shell: true }).trim();
} catch { frozenSourceTree = false; }
const typesSource = readFileSync(resolve(root, "packages/mystery-core/src/types.ts"), "utf8");
const saveSchemaV1 = /interface SaveEnvelope[\s\S]*?schemaVersion:\s*1;/.test(typesSource);
const authoredBoardModes = new Set(cases.flatMap((caseFile) => (caseFile.reasoningBoards ?? []).map((board) => board.mode)));
const routeTraces = browser.routeSmoke.flatMap((group: any) => group.routes);
const flowTraces = browser.fullFlows.flatMap((group: any) => group.traces);
const browserBoardModes = new Set(flowTraces.flatMap((trace: any) => trace.board.modes));
const allCaseIds = new Set(release.entries.map((entry) => entry.id));
const goldenCoverageIds = new Set<string>(GOLDEN_CASE_IDS);
const expectedViewports = new Set(["1440x900", "390x844"]);
const validTrace = (trace: any) => trace.passed === true && trace.obstruction === 0 && trace.overflow <= 1 && trace.axeSeriousCritical === 0 && trace.consoleErrors.length === 0 && trace.board.operated === true && trace.board.operatedCount === trace.board.boardCount;
const validFlowSet = (flows: any[], browserName: string, scope: "all" | "golden", ids: Set<string>) => flows.length === 2
  && new Set(flows.map((flow) => flow.viewport)).size === 2
  && flows.every((flow) => flow.browser === browserName && flow.scope === scope && expectedViewports.has(flow.viewport) && flow.passed === true && flow.traces.length === ids.size && new Set(flow.traces.map((trace: any) => trace.caseId)).size === ids.size && flow.traces.every((trace: any) => ids.has(trace.caseId) && validTrace(trace)));
const chromiumFlows = browser.fullFlows.filter((flow: any) => flow.browser === "chromium");
const firefoxFlows = browser.fullFlows.filter((flow: any) => flow.browser === "firefox");
const webkitFlows = browser.fullFlows.filter((flow: any) => flow.browser === "webkit");
const proofMutationCases = proof.cases.filter((item: any) => item.passed && item.proofSets.every((set: any) => set.allRemovalsFail)).length;
const alternativeCount = authenticity.cases.reduce((sum: number, item: any) => sum + item.alternativeReview.length, 0);
const alternativesResolvable = authenticity.cases.every((item: any) => item.alternativeReview.every((alternative: any) => alternative.publiclyResolvable));
const focusById = new Map(experience.focusCases.map((item: any) => [item.caseId, item]));
const required = [
  "docs/v1.7-external-design-notes.md",
  "docs/v1.7-budgeted-synthetic.json",
  "docs/v1.7-soundscape-calibration.json",
  "docs/v1.7-browser-matrix.json",
  "docs/v1.7-experience-calibration.json",
  "docs/v1.7-visual-review.json",
  "docs/v1.7-static-performance.json",
  "docs/v1.7-security-scan.json",
  "docs/v1.7-rebuild-determinism.json",
  "docs/v1.7-release-artifacts.json",
  "docs/v1.7-requirement-audit.json",
  "docs/v1.7-internal-rc.md",
  "dist/turtle-soup-v1.7-internal-rc-web-pwa.zip",
];
const presence = required.map((path) => ({ path, exists: existsSync(resolve(root, path)) }));
const v17Reports = [budgeted, experience, soundscape, browser, visual, performance, security, rebuild, artifact];
const gates = {
  coreAndTypecheck: checkPassed,
  releaseProfile: release.entries.length === 60 && release.profile.status === "internal-rc" && release.profile.publishable === false && release.profile.humanEvaluation === "pending",
  frozenCompatibility: frozenCompatibility.length === 60 && frozenCompatibility.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
  frozenSourceTree: frozenSourceTree && sourceBaselineTag === "d1bab136ee8a2ea0b2d5426ca8f2d7a4a23dd4b4",
  saveSchemaV1,
  budgetedBlackBox: budgeted.passed === true && budgeted.caseCount === 60 && budgeted.personaCount === 12 && budgeted.runCount === 720 && budgeted.outcomes.solved > 0 && budgeted.outcomes.abandoned > 0 && budgeted.outcomes.budgetExhausted > 0 && budgeted.traces.every((trace: any) => trace.publicLeak === false && trace.publicSearchAttempts === 0 && trace.questionBudget >= 20 && trace.questionBudget <= 30 && trace.evidenceBudget >= 6 && trace.evidenceBudget <= 8 && trace.theoryBudget <= 3),
  honestOutcomeDistribution: budgeted.outcomes.solved + budgeted.outcomes.abandoned + budgeted.outcomes.budgetExhausted === 720 && budgeted.outcomes.solved < 720,
  focusCalibration: ["c25-silent-second-bell", "c37-zeroed-pressure-gauge"].every((caseId) => { const item: any = focusById.get(caseId); return item?.passed === true && item.averageValidQuestionRate >= .82 && item.naturalProgressPath === true && item.exhaustiveEvidenceRate < 1; }),
  goldenPath: experience.passed === true && experience.goldenPath.actualOrder.join("|") === [...GOLDEN_PATH_CASE_IDS].join("|") && experience.goldenPath.cases.length === 9 && experience.goldenPath.cases.every((item: any) => item.passed && item.hintSafe && item.naturalProgressPath && item.exhaustiveEvidenceRate < 1),
  chapterAndRedHerringTracking: experience.chapterTracking.entryFieldPresent && experience.chapterTracking.transitionFieldPresent && experience.chapterTracking.multiChapterTransitionsObserved.length > 0 && experience.redHerringTracking.discoveredFieldPresent && experience.redHerringTracking.exhaustiveFieldPresent && experience.redHerringTracking.discoveryWithoutExhaustion > 0,
  complexBoardUi: experience.uiContracts.mobileSingleTaskSelector && experience.uiContracts.collapsibleCompletedBoard && experience.uiContracts.collapsibleClosedChain && experience.uiContracts.localProofGapCategory && experience.uiContracts.nearbyMobileSubmit && experience.uiContracts.uiStateStaysInReact,
  proofNecessity: proof.passed === true && proofMutationCases === 60,
  wrongTheoriesRejected: authenticity.passed === true && authenticity.cases.length === 60 && alternativeCount >= 120 && alternativesResolvable,
  soundscapes: soundscape.passed === true && soundscape.caseCount === 60 && soundscape.soundscapeCount === 60 && soundscape.uniqueSignatures === 60 && soundscape.uniqueNumericIdentities === 60 && soundscape.noFallbacks && soundscape.noRequiredAudioInformation,
  browser: browser.passed === true && browser.partial === false && browser.caseCount === 60 && routeTraces.length === 360 && routeTraces.every((trace: any) => trace.passed) && flowTraces.length === 168 && browser.fullFlows.length === 6 && validFlowSet(chromiumFlows, "chromium", "all", allCaseIds) && validFlowSet(firefoxFlows, "firefox", "golden", goldenCoverageIds) && validFlowSet(webkitFlows, "webkit", "golden", goldenCoverageIds) && browser.consoleErrorCount === 0 && browser.offlineRecovery.passed && browser.screenshotCount === 110,
  boardModes: authoredBoardModes.size === 15 && [...authoredBoardModes].every((mode) => browserBoardModes.has(mode)),
  visual: visual.passed === true && visual.requiredScreenshotCount === 18 && visual.manualReview.every((item: any) => item.blockingIssue === false),
  performance: performance.passed === true && performance.actual.totalBytes <= 8_000_000 && performance.actual.initialJavaScriptBytes <= 1_400_000 && performance.actual.maximumAssetBytes <= 450_000 && performance.actual.sourceMaps === 0,
  security: security.passed === true && Object.values(security.boundaryChecks).every(Boolean) && security.targets.every((target: any) => target.publicHtmlLeaks.length === 0 && target.remoteReferences.length === 0),
  rebuild: rebuild.passed === true && Object.values(rebuild.checks).every(Boolean) && rebuild.runs.length === 2 && rebuild.runs[0].staticTree.sha256 === rebuild.runs[1].staticTree.sha256 && rebuild.runs[0].archive.sha256 === rebuild.runs[1].archive.sha256,
  artifact: artifact.passed === true && artifact.preservedArtifacts.length === 7 && artifact.preservedArtifacts.every((item: any) => item.unchanged) && existsSync(resolve(root, artifact.artifact.archive.path)),
  requirementAudit: requirements.passed === true && requirements.failedCount === 0 && requirements.requirements.length === 11,
  humanEvaluationPending: v17Reports.every((report: any) => report.humanParticipants === 0 && String(report.status).includes("human-evaluation-pending")),
  requiredOutputs: presence.every((item) => item.exists),
};
const report = {
  reportVersion: "1.7",
  verifiedAt: new Date().toISOString(),
  releaseProfile: "v1.7-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  humanFunGate: "pending",
  caseCount: release.entries.length,
  coreTests: 68,
  budgetedRuns: budgeted.runCount,
  budgetedOutcomes: budgeted.outcomes,
  goldenPath: [...GOLDEN_PATH_CASE_IDS],
  proofMutationCases,
  authoredAlternatives: alternativeCount,
  browserRoutes: routeTraces.length,
  browserFlows: flowTraces.length,
  screenshots: browser.screenshotCount,
  boardModes: { authored: [...authoredBoardModes].sort(), exercised: [...browserBoardModes].sort() },
  frozenSourceBaseline: { tag: "v1.6-source-baseline", commit: sourceBaselineTag, contentTreeUnchanged: frozenSourceTree },
  frozenCompatibility,
  performance: performance.actual,
  artifact: artifact.artifact,
  preservedArtifacts: artifact.preservedArtifacts,
  presence,
  gates,
  passed: Object.values(gates).every(Boolean),
  qualification: "自动化证明确定性一致性、公平性下界、有限公开操作下的可达性与卡点分布、语言安全关闭、浏览器可操作性、离线恢复、反泄漏和工程可重建性；真人参与为 0，不能证明乐趣、审美、理解率、留存或市场适配。",
};
writeFileSync(resolve(root, "docs/v1.7-release-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, gates }, null, 2));
if (!report.passed) process.exitCode = 1;
