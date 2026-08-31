import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const profileId = "v2.7-internal-rc";
const release = loadReleaseContent(root, profileId);
const required = [
  "docs/v2.7-precache.json", "docs/v2.7-browser-matrix.json", "docs/v2.7-visual-regression.json",
  "docs/v2.7-static-performance.json", "docs/v2.7-security-scan.json", "docs/v2.7-save-compatibility.json",
  "docs/v2.7-experience-audit.json", "docs/v2.7-content-difference.json", "docs/v2.7-release-artifacts.json",
  "docs/v2.7-player-setup.json",
  "docs/v2.7-internal-rc.md", "dist/turtle-soup-v2.7-internal-rc-web-pwa.zip",
];
const presence = required.map((path) => ({ path, exists: existsSync(resolve(root, path)) }));
const reports = required.filter((path) => path.endsWith(".json") && path !== "docs/v2.7-precache.json").map((path) => {
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
  reportVersion: "2.7",
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
  qualification: "v2.7 validates player-facing setup and deterministic feedback contracts while preserving frozen case truth and schema-one saves. Automation cannot establish fun, comprehension, pacing or market fit.",
};
writeFileSync(resolve(root, "docs/v2.7-release-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: report.caseCount, gates, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
