import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectPlayerState, replayCommands, validateCompatibleSave } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const v24 = process.argv.includes("--v24"), v23 = process.argv.includes("--v23"), v22 = process.argv.includes("--v22"), version = v24 ? "2.4" : v23 ? "2.3" : v22 ? "2.2" : "2.1", profileId = `v${version}-internal-rc`, baselineProfile = v24 ? "v2.3-internal-rc" : v23 ? "v2.2-internal-rc" : v22 ? "v2.1-internal-rc" : "v2.0-internal-rc";
const root = resolve(process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "."), baseline = loadReleaseContent(root, baselineProfile), current = loadReleaseContent(root, profileId);
const currentById = new Map(current.entries.map((entry) => [entry.id, entry]));
const cases = baseline.entries.map((entry) => {
  const next = currentById.get(entry.id), caseFile = loadCaseFile(entry), save = createCanonicalSave(caseFile);
  const compatible = validateCompatibleSave(save, caseFile.id, { caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned" });
  const before = replayCommands(caseFile, save.commands), after = compatible.ok ? replayCommands(caseFile, compatible.value.commands) : undefined;
  const projectionReplayEqual = Boolean(after && JSON.stringify(projectPlayerState(caseFile, before.state)) === JSON.stringify(projectPlayerState(caseFile, after.state)));
  const wrongCase = validateCompatibleSave(save, "c99-unknown", { caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned" });
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath, schemaVersion: save.schemaVersion, compatible: compatible.ok, projectionReplayEqual, crossCaseRejected: !wrongCase.ok };
});
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, baselineProfile, saveSchemaVersion: 1, cases, passed: cases.length === 60 && cases.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged && item.schemaVersion === 1 && item.compatible && item.projectionReplayEqual && item.crossCaseRejected) };
writeFileSync(resolve(root, `docs/v${version}-save-compatibility.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: cases.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
