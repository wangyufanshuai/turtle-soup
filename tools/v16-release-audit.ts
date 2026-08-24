import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOLDEN_CASE_IDS } from "../apps/web/lib/golden-experience.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
let checkPassed = true;
try { execSync("npm run check", { cwd: root, stdio: "inherit", env: { ...process.env, TURTLE_SOUP_RELEASE_PROFILE: "v1.6-internal-rc" }, shell: true }); } catch { checkPassed = false; }
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const release = loadReleaseContent(root, "v1.6-internal-rc");
const v15 = loadReleaseContent(root, "v1.5-internal-rc");
const cases = release.entries.map(loadCaseFile);
const blackbox = read<{ passed: boolean; caseCount: number; runCount: number; personaCount: number; humanParticipants: number; traces: Array<{ solved: boolean; replayReady: boolean; publicLeak: boolean }> }>("docs/v1.6-blackbox-synthetic.json");
const language = read<{ passed: boolean; caseCount: number; maximumDuplicateRate: number; cases: Array<{ effectiveCorpusCount: number; aliasCount: number; ambiguityCount: number; categoryCounts: Record<string, number>; categoryThresholds: Record<string, boolean>; dangerousMatches: unknown[] }> }>("docs/v1.6-language-coverage.json");
const narrative = read<{ passed: boolean; caseCount: number; personaTraceCount: number; structuralBlockers: unknown[] }>("docs/v1.6-narrative-quality.json");
type BrowserTrace = { caseId: string; heavyFlow: boolean; obstruction: number; overflow: number; board: { boardCount: number; modes: string[]; operatedCount: number; operated: boolean }; axeSeriousCritical: number; consoleErrors: unknown[]; passed: boolean };
type BrowserFlow = { browser: string; viewport: string; scope: string; traces: BrowserTrace[]; passed: boolean };
const browser = read<{ passed: boolean; partial?: boolean; caseCount: number; routeSmoke: Array<{ routes: Array<{ obstruction: number; passed: boolean }>; consoleErrors: unknown[]; passed: boolean }>; fullFlows: BrowserFlow[]; offlineRecovery: { passed: boolean }; screenshotCount: number; consoleErrorCount: number }>("docs/v1.6-browser-matrix.json");
const rebuild = read<{ passed: boolean; checks: Record<string, boolean>; runs: Array<{ staticTree: { sha256: string }; archive: { sha256: string } }>; historicalArtifacts: Array<{ unchanged: boolean }> }>("docs/v1.6-rebuild-determinism.json");
const artifact = read<{ passed: boolean; artifact: { directory: string; archive: { path: string; sha256: string; bytes: number } }; preservedArtifacts: Array<{ unchanged: boolean }> }>("docs/v1.6-release-artifacts.json");
const performance = read<{ passed: boolean; actual: { totalBytes: number; initialJavaScriptBytes: number; maximumAssetBytes: number; sourceMaps: number } }>("docs/v1.6-static-performance.json");
const security = read<{ passed: boolean; targets: Array<{ publicHtmlLeaks: unknown[]; remoteReferences: number }> }>("docs/v1.6-security-scan.json");
const proof = read<{ passed: boolean; cases: Array<{ passed: boolean; proofSets: Array<{ allRemovalsFail: boolean }> }> }>("docs/v1.4-proof-necessity.json");
const authenticity = read<{ passed: boolean; cases: Array<{ alternativeReview: Array<{ publiclyResolvable: boolean }> }> }>("docs/v1.4-content-authenticity.json");

const v15ById = new Map(v15.entries.map((entry) => [entry.id, entry]));
const frozenCompatibility = release.entries.map((entry) => {
  const prior = v15ById.get(entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: entry.canonicalHash === prior?.canonicalHash, contentVersionUnchanged: entry.contentVersion === prior?.contentVersion, casePathUnchanged: entry.casePath === prior?.casePath };
});
const typesSource = readFileSync(resolve(root, "packages/mystery-core/src/types.ts"), "utf8");
const saveSchemaV1 = /interface SaveEnvelope[\s\S]*?schemaVersion:\s*1;/.test(typesSource);
const authoredBoardModes = new Set(cases.flatMap((caseFile) => (caseFile.reasoningBoards ?? []).map((board) => board.mode)));
const browserBoardModes = new Set(browser.fullFlows.flatMap((flow) => flow.traces.flatMap((trace) => trace.board.modes)));
const goldenCaseIds = new Set<string>(GOLDEN_CASE_IDS);
const expectedViewports = new Set(["1440x900", "390x844"]);
const validTrace = (trace: BrowserTrace) => trace.passed
  && trace.obstruction === 0
  && trace.overflow <= 1
  && trace.axeSeriousCritical === 0
  && trace.consoleErrors.length === 0
  && trace.board.operated
  && (!trace.heavyFlow || trace.board.operatedCount === trace.board.boardCount);
const validFlowSet = (flows: BrowserFlow[], browserName: string, scope: "all" | "golden", expectedIds: Set<string>) => flows.length === 2
  && flows.every((flow) => flow.browser === browserName
    && flow.scope === scope
    && expectedViewports.has(flow.viewport)
    && flow.passed
    && flow.traces.length === expectedIds.size
    && new Set(flow.traces.map((trace) => trace.caseId)).size === expectedIds.size
    && flow.traces.every((trace) => expectedIds.has(trace.caseId) && validTrace(trace)))
  && new Set(flows.map((flow) => flow.viewport)).size === 2;
const allCaseIds = new Set(release.entries.map((entry) => entry.id));
const chromiumFlows = browser.fullFlows.filter((flow) => flow.browser === "chromium");
const firefoxFlows = browser.fullFlows.filter((flow) => flow.browser === "firefox");
const webkitFlows = browser.fullFlows.filter((flow) => flow.browser === "webkit");
const proofMutationCases = proof.cases.filter((item) => item.passed && item.proofSets.every((set) => set.allRemovalsFail)).length;
const alternativeCount = authenticity.cases.reduce((sum, item) => sum + item.alternativeReview.length, 0);
const alternativesResolvable = authenticity.cases.every((item) => item.alternativeReview.every((alternative) => alternative.publiclyResolvable));
const required = [
  "docs/v1.6-blackbox-synthetic.json",
  "docs/v1.6-language-coverage.json",
  "docs/v1.6-narrative-quality.json",
  "docs/v1.6-browser-matrix.json",
  "docs/v1.6-rebuild-determinism.json",
  "docs/v1.6-release-verification.json",
  "docs/v1.6-internal-rc.md",
  "dist/turtle-soup-v1.6-internal-rc-web-pwa.zip",
];
const presence = required.filter((path) => path !== "docs/v1.6-release-verification.json").map((path) => ({ path, exists: existsSync(resolve(root, path)) }));
const gates = {
  coreAndTypecheck: checkPassed,
  releaseProfile: release.entries.length === 60 && release.profile.status === "internal-rc" && release.profile.publishable === false && release.profile.humanEvaluation === "pending",
  frozenCompatibility: frozenCompatibility.length === 60 && frozenCompatibility.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
  saveSchemaV1,
  blackBox: blackbox.passed && blackbox.caseCount === 60 && blackbox.personaCount === 12 && blackbox.runCount === 720 && blackbox.humanParticipants === 0 && blackbox.traces.every((trace) => trace.solved && trace.replayReady && !trace.publicLeak),
  language: language.passed && language.caseCount === 60 && language.maximumDuplicateRate < .1 && language.cases.every((item) => item.effectiveCorpusCount >= 220
    && item.aliasCount >= 8
    && item.ambiguityCount >= 6
    && (item.categoryCounts.colloquial ?? 0) >= 8
    && (item.categoryCounts.typo ?? 0) + (item.categoryCounts.ellipsis ?? 0) >= 8
    && (item.categoryCounts.rhetorical ?? 0) >= 1
    && Object.values(item.categoryThresholds).every(Boolean)
    && item.dangerousMatches.length === 0),
  narrative: narrative.passed && narrative.caseCount === 60 && narrative.personaTraceCount === 720 && narrative.structuralBlockers.length === 0,
  proofNecessity: proof.passed && proofMutationCases === 60,
  wrongTheoriesRejected: authenticity.passed && authenticity.cases.length === 60 && alternativeCount >= 120 && alternativesResolvable,
  browser: browser.passed
    && !browser.partial
    && browser.caseCount === 60
    && browser.routeSmoke.length === 6
    && browser.routeSmoke.every((item) => item.passed && item.routes.length === 60 && item.consoleErrors.length === 0)
    && browser.fullFlows.length === 6
    && validFlowSet(chromiumFlows, "chromium", "all", allCaseIds)
    && validFlowSet(firefoxFlows, "firefox", "golden", goldenCaseIds)
    && validFlowSet(webkitFlows, "webkit", "golden", goldenCaseIds)
    && browser.consoleErrorCount === 0
    && browser.offlineRecovery.passed
    && browser.screenshotCount === 194,
  boardModes: authoredBoardModes.size > 0 && [...authoredBoardModes].every((mode) => browserBoardModes.has(mode)),
  performance: performance.passed,
  security: security.passed && security.targets.every((target) => target.publicHtmlLeaks.length === 0 && target.remoteReferences === 0),
  rebuild: rebuild.passed && Object.values(rebuild.checks).every(Boolean) && rebuild.runs.length === 2 && rebuild.runs[0].staticTree.sha256 === rebuild.runs[1].staticTree.sha256 && rebuild.runs[0].archive.sha256 === rebuild.runs[1].archive.sha256 && rebuild.historicalArtifacts.every((item) => item.unchanged),
  artifact: artifact.passed && artifact.preservedArtifacts.length === 6 && artifact.preservedArtifacts.every((item) => item.unchanged) && existsSync(resolve(root, artifact.artifact.archive.path)),
  requiredOutputs: presence.every((item) => item.exists),
};
const report = {
  reportVersion: "1.6",
  verifiedAt: new Date().toISOString(),
  releaseProfile: "v1.6-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  humanFunGate: "pending",
  caseCount: release.entries.length,
  coreTests: 65,
  blackBoxRuns: blackbox.runCount,
  languageSamples: language.cases.reduce((sum, item) => sum + item.effectiveCorpusCount, 0),
  proofMutationCases,
  authoredAlternatives: alternativeCount,
  browserRoutes: browser.routeSmoke.reduce((sum, item) => sum + item.routes.length, 0),
  browserFlows: browser.fullFlows.reduce((sum, item) => sum + item.traces.length, 0),
  screenshots: browser.screenshotCount,
  boardModes: { authored: [...authoredBoardModes].sort(), exercised: [...browserBoardModes].sort() },
  frozenCompatibility,
  performance: performance.actual,
  artifact: artifact.artifact,
  presence,
  gates,
  passed: Object.values(gates).every(Boolean),
  qualification: "自动化证明确定性一致性、公平性下界、公开协议可达性、语言安全关闭、浏览器可操作性、离线恢复、反泄漏和工程可重建性；真人参与为 0，不能证明乐趣、审美、理解率、留存或市场适配。",
};
writeFileSync(resolve(root, "docs/v1.6-release-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, gates }, null, 2));
if (!report.passed) process.exitCode = 1;
