import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntimeState, projectPlayerState, replayCommands } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? "."), release = loadReleaseContent(root, "v2.0-internal-rc");
const forbidden = ["solutionCertificate", "canonicalHypothesis", "requiredFactIds", "alternativeHypothesisIds", "hiddenFacts", "truthGraph"];
const cases = release.entries.map((entry) => {
  const caseFile = loadCaseFile(entry), initial = projectPlayerState(caseFile, createRuntimeState(caseFile)), solvedRun = replayCommands(caseFile, createCanonicalSave(caseFile).commands), solved = projectPlayerState(caseFile, solvedRun.state);
  const initialSerialized = JSON.stringify(initial), solvedSerialized = JSON.stringify(solved);
  const initialCue = initial.transcript.length === 0 ? "questions" : "unexpected", solvedCue = solved.solved ? "theory" : "unexpected";
  return { caseId: entry.id, initialCue, solvedCue, standardSolveReached: solved.solved, replayAvailable: solved.replay.length > 0, publicInitialProjection: forbidden.every((token) => !initialSerialized.includes(token)), publicSolvedProjection: forbidden.slice(0, 4).every((token) => !solvedSerialized.includes(token)), reasoningBoardCount: initial.reasoningBoards.length, theoryDraftCount: initial.theoryDrafts.length, passed: initialCue === "questions" && solvedCue === "theory" && solved.solved && solved.replay.length > 0 && forbidden.every((token) => !initialSerialized.includes(token)) && forbidden.slice(0, 4).every((token) => !solvedSerialized.includes(token)) };
});
const report = { reportVersion: "2.0", releaseProfile: "v2.0-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", founderExploratorySessions: 1, formalFunGateParticipants: 0, scope: "deterministic first-minute cue, canonical completion, replay availability and public projection boundaries", limitations: ["不能证明乐趣", "不能证明审美质量", "不能证明玩家理解率", "不能证明留存或市场适配"], cases, passed: cases.length === 60 && cases.every((item) => item.passed) };
writeFileSync(resolve(root, "docs/v2.0-autonomous-experience.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify({ cases: cases.length, passed: report.passed }, null, 2)); if (!report.passed) process.exitCode = 1;
