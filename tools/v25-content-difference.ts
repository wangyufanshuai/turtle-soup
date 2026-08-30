import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const previous = loadReleaseContent(root, "v2.4-internal-rc");
const current = loadReleaseContent(root, "v2.5-internal-rc");
const previousIds = new Set(previous.entries.map((entry) => entry.id));
const added = current.entries.filter((entry) => !previousIds.has(entry.id));
const frozen = previous.entries.map((entry) => {
  const next = current.entries.find((item) => item.id === entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath };
});
const newCaseDetails = added.map((entry) => {
  const caseFile = loadCaseFile(entry);
  return {
    caseId: entry.id,
    title: entry.public?.title ?? caseFile.localization?.["zh-CN"]?.[caseFile.surface?.titleKey ?? ""] ?? entry.id,
    canonicalHash: entry.canonicalHash,
    events: caseFile.events.length,
    facts: caseFile.facts.length,
    evidence: caseFile.evidenceItems.length,
    proofReplayBeats: caseFile.proofReplay.length,
    chapters: caseFile.chapters?.length ?? 0,
    boardModes: caseFile.reasoningBoards?.map((board) => board.mode) ?? [],
    contentTags: caseFile.metadata?.contentTags ?? [],
  };
});
const boardModes = [...new Set(newCaseDetails.flatMap((item) => item.boardModes))];
const skills = [...new Set(newCaseDetails.flatMap((item) => item.contentTags))];
const report = {
  reportVersion: "2.5",
  releaseProfile: "v2.5-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  baselineProfile: "v2.4-internal-rc",
  previousCaseCount: previous.entries.length,
  currentCaseCount: current.entries.length,
  addedCaseCount: added.length,
  addedCaseIds: added.map((entry) => entry.id),
  newCaseDetails,
  newBoardModes: boardModes,
  newSkills: skills,
  frozen,
  passed: previous.entries.length === 60 && current.entries.length === 84 && added.length === 24 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged) && newCaseDetails.every((item) => item.events >= 10 && item.facts >= 16 && item.evidence >= 10 && item.proofReplayBeats >= 6 && item.boardModes.length >= 2),
};
writeFileSync(resolve(root, "docs/v2.5-content-difference.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ previousCaseCount: previous.entries.length, currentCaseCount: current.entries.length, addedCaseCount: added.length, boardModes, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
