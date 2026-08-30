import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectPlayerState, replayCommands, validateCompatibleSave } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const oldRelease = loadReleaseContent(root, "v1.8-internal-rc"), current = loadReleaseContent(root, "v1.9-internal-rc");
const currentById = new Map(current.entries.map((entry) => [entry.id, entry]));
const cases = oldRelease.entries.map((entry) => {
  const next = currentById.get(entry.id);
  const caseFile = loadCaseFile(entry);
  const save = createCanonicalSave(caseFile);
  const compatible = validateCompatibleSave(save, caseFile.id, { caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned" });
  const live = replayCommands(caseFile, save.commands);
  const replayed = compatible.ok ? replayCommands(caseFile, compatible.value.commands) : undefined;
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath, schemaVersion: save.schemaVersion, compatible: compatible.ok, projectionReplayEqual: Boolean(replayed && JSON.stringify(projectPlayerState(caseFile, live.state)) === JSON.stringify(projectPlayerState(caseFile, replayed.state))) };
});
const aiSaveContract = { schemaVersion: 1, commandType: "ask_resolved_text", fields: ["rawText", "queryId", "resolutionSource", "contextHash"], replayRequiresContextHash: true, secretFields: [] };
const report = { reportVersion: "1.9", releaseProfile: "v1.9-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, baselineHead: "bb4c81b7d399037693c059d1ada481ca898cf368", saveSchemaVersion: 1, cases, aiSaveContract, passed: cases.length === 60 && cases.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged && item.schemaVersion === 1 && item.compatible && item.projectionReplayEqual) };
writeFileSync(resolve(root, "docs/v1.9-save-compatibility.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify({ cases: cases.length, passed: report.passed }, null, 2)); if (!report.passed) process.exitCode = 1;
