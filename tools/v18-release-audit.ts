import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
let checkPassed = true;
try { execSync("npm run check", { cwd: root, stdio: "inherit", env: { ...process.env, TURTLE_SOUP_RELEASE_PROFILE: "v1.8-internal-rc" }, shell: true }); } catch { checkPassed = false; }
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const current = loadReleaseContent(root, "v1.8-internal-rc"), prior = loadReleaseContent(root, "v1.7-internal-rc");
const priorById = new Map(prior.entries.map((entry) => [entry.id, entry]));
const frozen = current.entries.map((entry) => { const old = priorById.get(entry.id); return { caseId: entry.id, canonicalHashUnchanged: old?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: old?.contentVersion === entry.contentVersion, casePathUnchanged: old?.casePath === entry.casePath }; });
const momentum = read<any>("docs/v1.8-momentum-proxy.json"), browser = read<any>("docs/v1.8-browser-matrix.json"), performance = read<any>("docs/v1.8-static-performance.json"), security = read<any>("docs/v1.8-security-scan.json"), visual = read<any>("docs/v1.8-visual-regression.json"), artifact = read<any>("docs/v1.8-release-artifacts.json");
const required = ["content/zh/releases/v1.8-internal-rc.json", "docs/v1.8-internal-rc.md", "docs/v1.8-momentum-proxy.json", "docs/v1.8-browser-matrix.json", "docs/v1.8-static-performance.json", "docs/v1.8-security-scan.json", "docs/v1.8-visual-regression.json", "docs/v1.8-release-artifacts.json", "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip"];
const gates = {
  coreAndTypecheck: checkPassed,
  releaseProfile: current.entries.length === 60 && current.profile.id === "v1.8-internal-rc" && current.profile.publishable === false && current.profile.humanEvaluation === "pending",
  frozenCompatibility: frozen.length === 60 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
  momentum: momentum.passed === true && momentum.runCount === 720 && momentum.gates.noHiddenLeak && momentum.goldenReports.length === 9,
  browser: browser.passed === true && browser.caseCount === 60 && browser.screenshotCount === 110 && browser.consoleErrorCount === 0 && browser.offlineRecovery.passed,
  visual: visual.passed === true && visual.requiredScreenshotCount === 18,
  performance: performance.passed === true && performance.actual.totalBytes <= 8_000_000 && performance.actual.initialJavaScriptBytes <= 1_400_000,
  security: security.passed === true && security.boundaryChecks.momentumAcceptsPublicProjectionOnly && security.boundaryChecks.noPublicHtmlLeaks,
  artifact: artifact.passed === true && artifact.preservedArtifacts.length === 8 && artifact.preservedArtifacts.every((item: any) => item.unchanged),
  requiredOutputs: required.every((path) => existsSync(resolve(root, path))),
};
const report = { reportVersion: "1.8", verifiedAt: new Date().toISOString(), releaseProfile: "v1.8-internal-rc", status: "internal-rc / human-evaluation-pending", humanParticipants: 0, humanFunGate: "pending", caseCount: current.entries.length, goldenPath: ["c01-cold-room-knock", "c03-second-shadow", "c13-second-waterline", "c06-nonexistent-ticket", "c17-twelve-strikes", "c24-turned-painting", "c33-early-late-arrival", "c48-two-point-calibration", "c60-last-sample-before-stop"], frozen, reports: { momentum: "docs/v1.8-momentum-proxy.json", browser: "docs/v1.8-browser-matrix.json", visual: "docs/v1.8-visual-regression.json", performance: "docs/v1.8-static-performance.json", security: "docs/v1.8-security-scan.json", artifact: "docs/v1.8-release-artifacts.json" }, gates, passed: Object.values(gates).every(Boolean), qualification: "v1.8 自动化证明冻结兼容、公开投影推进代理、证据取舍 UI、复杂板移动端、浏览器可操作性、离线恢复、性能与反泄漏；真人参与为 0，不能证明乐趣、审美、理解率、留存或市场适配。" };
writeFileSync(resolve(root, "docs/v1.8-release-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify({ passed: report.passed, gates }, null, 2)); if (!report.passed) process.exitCode = 1;
