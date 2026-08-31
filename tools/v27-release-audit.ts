import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const v28 = process.argv.includes("--v28");
const version = v28 ? "2.8" : "2.7";
const profileId = v28 ? "v2.8-internal-rc" : "v2.7-internal-rc";
const release = loadReleaseContent(root, profileId);
const required = [
  `docs/v${version}-precache.json`, `docs/v${version}-browser-matrix.json`, `docs/v${version}-visual-regression.json`,
  `docs/v${version}-static-performance.json`, `docs/v${version}-security-scan.json`, `docs/v${version}-save-compatibility.json`,
  `docs/v${version}-experience-audit.json`, `docs/v${version}-content-difference.json`, `docs/v${version}-release-artifacts.json`,
  `docs/v${version}-player-setup.json`,
  `docs/v${version}-internal-rc.md`, `dist/turtle-soup-${profileId}-web-pwa.zip`,
];
const presence = required.map((path) => ({ path, exists: existsSync(resolve(root, path)) }));
const reports = required.filter((path) => path.endsWith(".json") && path !== `docs/v${version}-precache.json`).map((path) => {
  try { const value = JSON.parse(readFileSync(resolve(root, path), "utf8")) as { passed?: boolean }; return { path, passed: value.passed === true }; } catch { return { path, passed: false }; }
});
const profile = release.profile;
const gates = {
  profile: profile.id === profileId && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending",
  participants: profile.formalFunGateParticipants === 0,
  caseCount: release.entries.length === 84,
  reports: presence.every((item) => item.exists) && reports.every((item) => item.passed),
};
const report = {
  reportVersion: version,
  releaseProfile: profileId,
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  caseCount: release.entries.length,
  gates,
  requiredOutputs: presence,
  reports,
  passed: Object.values(gates).every(Boolean),
  qualification: `v${version} validates guided investigation and player-facing setup contracts while preserving frozen case truth and schema-one saves. Automation cannot establish fun, comprehension, pacing or market fit.`,
};
writeFileSync(resolve(root, `docs/v${version}-release-verification.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: report.caseCount, gates, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
