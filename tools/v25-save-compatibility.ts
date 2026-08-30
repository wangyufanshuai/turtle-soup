import { projectPlayerState, replayCommands, validateCompatibleSave } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

const root = resolve(process.argv[2] ?? ".");
const baseline = loadReleaseContent(root, "v2.4-internal-rc");
const current = loadReleaseContent(root, "v2.5-internal-rc");
const currentById = new Map(current.entries.map((entry) => [entry.id, entry]));
const cases = current.entries.map((entry) => {
  const caseFile = loadCaseFile(entry);
  const save = createCanonicalSave(caseFile);
  const identity = { caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned" };
  const compatible = validateCompatibleSave(save, caseFile.id, identity);
  const live = replayCommands(caseFile, save.commands);
  const replayed = compatible.ok ? replayCommands(caseFile, compatible.value.commands) : undefined;
  const sameProjection = Boolean(replayed && JSON.stringify(projectPlayerState(caseFile, live.state)) === JSON.stringify(projectPlayerState(caseFile, replayed.state)));
  return { caseId: entry.id, schemaVersion: save.schemaVersion, compatible: compatible.ok, projectionReplayEqual: sameProjection, passed: save.schemaVersion === 1 && compatible.ok && sameProjection };
});
const frozen = baseline.entries.map((entry) => {
  const next = currentById.get(entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath };
});
const crossCaseRefusal = (() => {
  const source = loadCaseFile(baseline.entries[0]);
  const save = createCanonicalSave(source);
  const target = current.entries.find((entry) => entry.id !== source.id)!;
  return { from: source.id, to: target.id, rejected: !validateCompatibleSave(save, target.id, { caseVersion: target.contentVersion, contentHash: target.canonicalHash }).ok };
})();
const report = {
  reportVersion: "2.5",
  releaseProfile: "v2.5-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  saveSchemaVersion: 1,
  caseCount: cases.length,
  frozen,
  crossCaseRefusal,
  cases,
  passed: cases.length === 84 && frozen.length === 60 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged) && crossCaseRefusal.rejected && cases.every((item) => item.passed),
};
writeFileSync(resolve(root, "docs/v2.5-save-compatibility.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: cases.length, frozen: frozen.length, crossCaseRefusal: crossCaseRefusal.rejected, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
