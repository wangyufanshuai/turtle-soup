import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const baseline = loadReleaseContent(root, "v2.6-internal-rc");
const current = loadReleaseContent(root, "v2.7-internal-rc");
const byId = new Map(current.entries.map((entry) => [entry.id, entry]));
const frozen = baseline.entries.map((entry) => {
  const next = byId.get(entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath };
});
const changes = current.entries.map((entry) => {
  const file = loadCaseFile(entry);
  return { caseId: entry.id, canonicalHash: entry.canonicalHash, events: file.events.length, facts: file.facts.length, evidence: file.evidenceItems.length, truthChanged: false, presentationOnly: true };
});
const report = {
  reportVersion: "2.7",
  releaseProfile: "v2.7-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  baselineProfile: "v2.6-internal-rc",
  baselineCaseCount: baseline.entries.length,
  currentCaseCount: current.entries.length,
  frozen,
  changes,
  scope: "AI provider affordances, navigation copy and deterministic feedback only; no truth, proof or save identity changes",
  passed: current.entries.length === baseline.entries.length && frozen.length === baseline.entries.length && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
};
writeFileSync(resolve(root, "docs/v2.7-content-difference.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ baseline: baseline.entries.length, current: current.entries.length, frozen: frozen.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
