import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const failures: string[] = [];

const browser = read<any>("docs/v0.9-browser-matrix.json");
const visuals = read<any>("docs/v0.9-visual-regression.json");
const soundscapes = read<any>("docs/v0.9-soundscapes.json");
const devices = read<any>("docs/v0.9-device-availability.json");
const itch = read<any>("docs/v0.9-itch-subpath.json");
const staticAudit = read<any>("docs/v0.9-static-performance.json");
const security = read<any>("docs/v0.9-security-scan.json");
const artifacts = read<any>("docs/v0.9-release-artifacts.json");
const fairness = read<any>("docs/fairness-reports/v0.6-c02-c12.json");
const synthetic = read<any>("docs/v0.7-synthetic-players.json");
const stress = read<any>("docs/v0.7-question-stress.json");
const freeze = read<any>("content/zh/cases/manifest.v0.6.json");

const requireValue = (condition: boolean, message: string) => { if (!condition) failures.push(message); };
const reportVersion = (report: any, name: string) => requireValue(report.reportVersion === "0.9", `${name} report version is ${report.reportVersion}`);
for (const [name, report] of Object.entries({ browser, visuals, soundscapes, devices, itch, staticAudit, security, artifacts })) reportVersion(report, name);

requireValue(browser.passed === true && browser.failures.length === 0, "browser matrix is not green");
requireValue(browser.routeMatrix?.passed === 156 && browser.routeMatrix?.total === 156, "browser route matrix is not 156/156");
requireValue(browser.humanFunGate === "pending" && browser.humanParticipants === 0, "browser report human status is not pending with zero participants");
const interactionCases = Object.values<any>(browser.interactions ?? {}).flatMap((value: any) => value.cases ?? []);
requireValue(interactionCases.length === 36 && interactionCases.every((item: any) => item.passed && item.repeatedFeedback), "36 repeated-question interaction paths are not all green");
const audioCases = Object.values<any>(browser.soundscapes ?? {}).flatMap((value: any) => value.cases ?? []);
requireValue(audioCases.length === 36 && audioCases.every((item: any) => item.passed), "36 soundscape browser paths are not all green");
requireValue(browser.mutedCompletion?.cases?.length === 12 && browser.mutedCompletion?.passed === true, "12-case muted completion is not green");
requireValue(browser.audioLifecycle?.passed === true && browser.audioLifecycle?.suspendCalls >= 1 && browser.audioLifecycle?.resumeCalls >= 1, "background audio lifecycle is not proven");
requireValue(Object.values<any>(browser.accessibility ?? {}).every((value: any) => value.blockers === 0), "accessibility blockers remain");

requireValue(visuals.passed === true && visuals.capturedScreenshots === 74 && visuals.distinctCaseOpenings === 12, "visual baseline is not 74 screenshots with 12 distinct openings");
requireValue(visuals.humanFunGate === "pending" && visuals.humanParticipants === 0, "visual report human status is not pending");
requireValue(soundscapes.passed === true && soundscapes.soundscapeCount === 12 && soundscapes.noRequiredAudioInformation === true, "soundscape registry is incomplete or contains required information");
requireValue(soundscapes.lifecycleCoverage?.every((item: any) => item.visibilitychange && item.pagehide && item.pageshow && item.disposesAudio), "audio lifecycle source coverage is incomplete");
requireValue(devices.passed === true && devices.android?.attachedDeviceCount === 0 && devices.ios?.detectedAppleMobileDeviceCount === 0, "physical-device availability report changed; rerun real-device workflow");
requireValue(String(devices.android?.realChromeRunStatus).startsWith("pending") && String(devices.ios?.realSafariRunStatus).startsWith("pending") && String(devices.lowPerformanceHardware?.realHardwareRunStatus).startsWith("pending"), "unavailable real devices are not explicitly pending");
requireValue(itch.passed === true && itch.homeLoaded && itch.caseLoaded && itch.sceneLoaded && itch.questionRecorded && itch.backNavigation && itch.outsideBrowserRequests.length === 0, "itch nested-path flow is incomplete");
requireValue(staticAudit.passed === true && staticAudit.precacheCoverage?.percent === 100 && staticAudit.actual?.sourceMaps === 0 && staticAudit.updatePolicy?.playerConfirmedActivation, "static/PWA budget or update policy failed");
requireValue(security.passed === true && security.targets?.length === 4 && security.targets.every((item: any) => item.passed), "release security targets are not 4/4 green");
requireValue(artifacts.passed === true && artifacts.frozenCaseCount === 12 && artifacts.humanFunGate === "pending", "release artifact manifest is incomplete or misstates human status");
requireValue(fairness.passed === true && fairness.caseCount === 11, "C02-C12 fairness sweep is not 11/11");
requireValue(synthetic.passed === true && synthetic.caseCount === 12, "synthetic player report is not 12/12");
requireValue(stress.passed === true && stress.caseCount === 12, "question stress report is not 12/12");
requireValue(freeze.cases?.length === 12, "frozen manifest does not contain 12 cases");

for (const artifact of Object.values<any>(artifacts.artifacts ?? {})) {
  const archivePath = resolve(root, artifact.archive.path);
  requireValue(existsSync(archivePath), `archive missing: ${artifact.archive.path}`);
  if (existsSync(archivePath)) {
    const actualHash = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    requireValue(actualHash === artifact.archive.sha256, `archive hash mismatch: ${artifact.archive.path}`);
  }
}
requireValue(artifacts.artifacts?.c01FunGate?.includedCaseRoutes?.length === 1 && artifacts.artifacts.c01FunGate.includedCaseRoutes[0] === "c01-cold-room-knock", "C01 Fun Gate route boundary is incorrect");

const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "sensory-gold-cross-report-verification",
  frozenCases: 12,
  browserRoutes: `${browser.routeMatrix.passed}/${browser.routeMatrix.total}`,
  interactionPaths: interactionCases.length,
  soundscapeBrowserPaths: audioCases.length,
  mutedCompletionCases: browser.mutedCompletion.cases.length,
  visualScreenshots: visuals.capturedScreenshots,
  securityTargets: security.targets.length,
  physicalDevices: { android: 0, ios: 0, lowPerformance: 0 },
  humanParticipants: 0,
  humanFunGate: "pending",
  failures,
  passed: failures.length === 0,
};
const reportPath = resolve(root, "docs/v0.9-release-verification.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
if (!report.passed) process.exitCode = 1;
