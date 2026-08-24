import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const failures: string[] = [];
const requireGate = (condition: boolean, message: string) => { if (!condition) failures.push(message); };
const s1 = read<{ cases: Array<{ id: string; file: string; fileSha256: string }> }>("content/zh/cases/manifest.v0.6.json");
for (const entry of s1.cases) {
  const raw = readFileSync(resolve(root, "content/zh/cases", entry.file));
  requireGate(createHash("sha256").update(raw).digest("hex") === entry.fileSha256, `${entry.id}: frozen hash changed`);
}
const s2 = read<{ status: string; publishable: boolean; humanEvaluation: { status: string; participants: number }; cases: unknown[] }>("content/zh/cases/manifest.season2.v1.0.json");
const fairness = read<{ passed: boolean; caseCount: number; seasonTwoCorpus: number; humanParticipants: number }>("docs/v1.0-automated-fairness.json");
const browser = read<{ passed: boolean; cases: number; desktop: Array<{ cases: unknown[] }>; mobile: { cases: unknown[]; offlineReady: boolean } }>("docs/v1.0-browser-matrix.json");
const performance = read<{ passed: boolean; actual: { totalBytes: number; initialJavaScriptBytes: number }; precacheCoverage: { percent: number } }>("docs/v1.0-static-performance.json");
const security = read<{ passed: boolean; targets: unknown[] }>("docs/v1.0-security-scan.json");
const synthetic = read<{ passed: boolean; caseCount: number; runCount: number; humanParticipants: number }>("docs/v1.0-synthetic-players.json");
const artifacts = read<{ passed: boolean; caseCount: number; humanParticipants: number; humanFunGate: string; artifact: { archive: { path: string; sha256: string } } }>("docs/v1.0-release-artifacts.json");
requireGate(s1.cases.length === 12, "Season 1 freeze does not contain 12 cases");
requireGate(s2.cases.length === 12 && s2.status === "internal-rc" && s2.publishable === false, "Season 2 manifest status is invalid");
requireGate(s2.humanEvaluation.status === "pending" && s2.humanEvaluation.participants === 0, "Season 2 human status is misstated");
requireGate(fairness.passed && fairness.caseCount === 24 && fairness.seasonTwoCorpus >= 2640 && fairness.humanParticipants === 0, "automated fairness gate failed");
requireGate(browser.passed && browser.cases === 24 && browser.desktop.every((item) => item.cases.length === 24) && browser.mobile.cases.length === 12 && browser.mobile.offlineReady, "browser matrix gate failed");
requireGate(performance.passed && performance.actual.totalBytes <= 5_000_000 && performance.actual.initialJavaScriptBytes <= 1_400_000 && performance.precacheCoverage.percent === 100, "performance or offline gate failed");
requireGate(security.passed && security.targets.length === 2, "release security gate failed");
requireGate(synthetic.passed && synthetic.caseCount === 12 && synthetic.runCount === 96 && synthetic.humanParticipants === 0, "synthetic player gate failed");
requireGate(artifacts.passed && artifacts.caseCount === 24 && artifacts.humanParticipants === 0 && artifacts.humanFunGate === "pending", "artifact status is invalid");
const report = { reportVersion: "1.0", verifiedAt: new Date().toISOString(), releaseProfile: "v1.0-internal-rc", status: failures.length ? "failed" : "internal-rc", humanParticipants: 0, humanFunGate: "pending", firstSeasonFrozen: failures.every((item) => !item.includes("frozen")), caseCount: 24, coreTests: 43, seasonTwoCorpus: fairness.seasonTwoCorpus, syntheticRuns: synthetic.runCount, browserRoutes: { desktop: 72, mobileSeasonTwo: 12 }, offline: browser.mobile.offlineReady, artifact: artifacts.artifact.archive, limitations: ["No human comprehension, fun, pacing, audio preference or market validation.", "Physical Android, iOS and low-end hardware remain pending.", "Offline truth can be reverse-engineered; Worker isolation is not DRM."], failures, passed: failures.length === 0 };
writeFileSync(resolve(root, "docs/v1.0-release-verification.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
