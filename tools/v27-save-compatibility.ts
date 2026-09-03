import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { projectPlayerState, replayCommands, validateCompatibleSave } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const v29 = process.argv.includes("--v29"), v28 = process.argv.includes("--v28");
const version = v29 ? "2.9" : v28 ? "2.8" : "2.7";
const profileId = v29 ? "v2.9-internal-rc" : v28 ? "v2.8-internal-rc" : "v2.7-internal-rc";
const baseline = loadReleaseContent(root, v29 ? "v2.8-internal-rc" : v28 ? "v2.7-internal-rc" : "v2.6-internal-rc");
const current = loadReleaseContent(root, profileId);
const cases = current.entries.map((entry) => {
  const file = loadCaseFile(entry);
  const save = createCanonicalSave(file);
  const identity = { caseVersion: file.metadata?.contentVersion ?? 1, contentHash: file.metadata?.canonicalHash ?? "" };
  const compatible = validateCompatibleSave(save, file.id, identity);
  const live = replayCommands(file, save.commands);
  const replayed = compatible.ok ? replayCommands(file, compatible.value.commands) : undefined;
  const projectionReplayEqual = Boolean(replayed && JSON.stringify(projectPlayerState(file, live.state)) === JSON.stringify(projectPlayerState(file, replayed.state)));
  return { caseId: entry.id, schemaVersion: save.schemaVersion, compatible: compatible.ok, projectionReplayEqual, passed: save.schemaVersion === 1 && compatible.ok && projectionReplayEqual };
});
const frozen = baseline.entries.map((entry) => {
  const next = current.entries.find((item) => item.id === entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath };
});
const source = loadCaseFile(baseline.entries[0]);
const target = current.entries.find((entry) => entry.id !== source.id)!;
const crossCaseRefusal = !validateCompatibleSave(createCanonicalSave(source), target.id, { caseVersion: target.contentVersion, contentHash: target.canonicalHash }).ok;
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, saveSchemaVersion: 1, caseCount: cases.length, frozen, crossCaseRefusal, cases, passed: cases.length === 84 && frozen.length === 84 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged) && crossCaseRefusal && cases.every((item) => item.passed) };
writeFileSync(resolve(root, `docs/v${version}-save-compatibility.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: cases.length, frozen: frozen.length, crossCaseRefusal, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
