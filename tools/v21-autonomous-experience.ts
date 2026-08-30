import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { challengeRotation, createRuntimeState, emptyMasteryRecord, projectPlayerState, recordMasterySolve, replayCommands } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const v24 = process.argv.includes("--v24"), v23 = process.argv.includes("--v23"), v22 = process.argv.includes("--v22"), version = v24 ? "2.4" : v23 ? "2.3" : v22 ? "2.2" : "2.1", profileId = `v${version}-internal-rc`;
const root = resolve(process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "."), release = loadReleaseContent(root, profileId), shellPath = resolve(root, "apps/web/components/investigation-shell.tsx"), shell = existsSync(shellPath) ? readFileSync(shellPath, "utf8") : "", caseSelectPath = resolve(root, "apps/web/components/case-select.tsx"), caseSelect = existsSync(caseSelectPath) ? readFileSync(caseSelectPath, "utf8") : "", inspectorPath = resolve(root, "apps/web/components/evidence-inspector.tsx"), inspector = existsSync(inspectorPath) ? readFileSync(inspectorPath, "utf8") : "", readinessPath = resolve(root, "apps/web/lib/proof-readiness.ts"), readiness = existsSync(readinessPath) ? readFileSync(readinessPath, "utf8") : "";
const forbidden = ["solutionCertificate", "canonicalHypothesis", "requiredFactIds", "alternativeHypothesisIds", "hiddenFacts", "truthGraph", "internalEventId"];
const cases = release.entries.map((entry) => {
  const caseFile = loadCaseFile(entry), initialState = createRuntimeState(caseFile), initial = projectPlayerState(caseFile, initialState), solvedState = replayCommands(caseFile, createCanonicalSave(caseFile).commands).state, solved = projectPlayerState(caseFile, solvedState);
  const initialSerialized = JSON.stringify(initial), solvedSerialized = JSON.stringify(solved);
  const record = emptyMasteryRecord(solved.case);
  const standard = recordMasterySolve(record, { case: solved.case, replayMode: "standard", solved: true, debrief: solved.debrief });
  const limited = recordMasterySolve(standard, { case: solved.case, replayMode: "limited-questions", solved: true, debrief: solved.debrief });
  const minimal = recordMasterySolve(limited, { case: solved.case, replayMode: "minimal-proof", solved: true, debrief: solved.debrief });
  const complete = recordMasterySolve(minimal, { case: solved.case, replayMode: "no-scaffolds", solved: true, debrief: solved.debrief });
  const rotation = challengeRotation(complete);
  const masteryRotationComplete = rotation.nextChallenge === "complete" && rotation.completedCount === 3;
  const publicProjection = forbidden.every((token) => !initialSerialized.includes(token) && !solvedSerialized.includes(token));
  return { caseId: entry.id, firstMinuteCue: initial.transcript.length === 0, solved: solved.solved, replayAvailable: solved.replay.length > 0, boardCount: initial.reasoningBoards.length, theoryDraftCount: initial.theoryDrafts.length, masteryRotationComplete: rotation.nextChallenge === "complete" && rotation.completedCount === 3, publicProjection, passed: initial.transcript.length === 0 && solved.solved && solved.replay.length > 0 && masteryRotationComplete && publicProjection };
});
const uiContracts = {
  unifiedShell: shell.includes("export function InvestigationShell"),
  caseScopedContinuation: shell.includes(`black-soup:case-ui:v${v24 ? "24" : v23 ? "23" : v22 ? "22" : "21"}:`),
  keyboardShortcuts: shell.includes('"1": "scene"') && shell.includes('event.key === "/"'),
  draftContinuity: shell.includes("submittedQuestionRef") && shell.includes("questionDraftRef"),
  solvedProofStep: shell.includes("if (projection.solved) setTheoryStep(\"proof\")"),
  directChineseLabels: shell.includes("查看现场") && shell.includes("问一个事实") && shell.includes("还缺："),
  ...(v22 || v23 || v24 ? {
    quickQuestionStarts: shell.includes('aria-label="第一问示例"') && shell.includes("按钮只会把问题放入输入框"),
    sessionDraftContinuation: shell.includes(`black-soup:question-draft:v${v24 ? "24" : v23 ? "23" : "22"}:`),
    proofContext: shell.includes('aria-label="当前证明结构"') && shell.includes("当前结构，不代表答案正确"),
    evidenceToProofBridge: inspector.includes("接入完成，去组织证明") && shell.includes("去组织证明"),
    discoveredEvidenceNotExamined: readiness.includes('["examined", "connected", "verified"]') && !readiness.includes('["discovered", "examined", "connected", "verified"]'),
  } : {}),
  ...(v23 || v24 ? {
    solvedArchiveFirst: shell.includes("if (projection.solved) return") && shell.includes("CASE CLOSED · 这是你亲手还原的真相"),
    solvedEditingHidden: shell.includes("<SolvedArchive") && !shell.includes("projection.solved && <section className={styles.solved}"),
    publicDebriefMetrics: shell.includes('aria-label="本次结案统计"') && shell.includes("proofCompleteness") && shell.includes("repeatedQuestionCount"),
    investigationToolWarmup: shell.includes('void import("./evidence-inspector")') && shell.includes('void import("./legacy-theory-workbench")'),
    seasonTabsKeyboard: caseSelect.includes('event.key === "ArrowRight"') && caseSelect.includes('event.key === "Home"') && caseSelect.includes("tabIndex={selected ? 0 : -1}"),
  } : {}),
  ...(v24 ? {
    workspaceDeepLinks: shell.includes("window.history.replaceState") && shell.includes("window.location.hash"),
    answerToEvidenceBridge: shell.includes('aria-label="回答后的下一步"') && shell.includes("检查对应证据"),
    progressiveReplay: shell.includes("继续下一拍") && shell.includes("展开全部") && shell.includes("visibleReplayBeats"),
    evidenceActionPriority: inspector.includes("recommendedAction") && inspector.includes("下一步：打开检查"),
    localizedCatalogLabels: caseSelect.includes("DIFFICULTY_LABELS") && caseSelect.includes("TAG_LABELS"),
  } : {}),
};
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, scope: v24 ? "investigation rhythm, answer-to-evidence handoff, progressive replay, workspace deep links, evidence action priority and frozen public projection safety" : v23 ? "resolution payoff, read-only solved archive, public debrief, tool warmup, season keyboard navigation and frozen public projection safety" : v22 ? "cognitive friction, session draft continuity, proof context, evidence handoff, deterministic mastery and public projection safety" : "experience continuity, deterministic mastery rotation, public projection safety and reversible navigation", uiContracts, cases, passed: cases.length === 60 && cases.every((item) => item.passed) && Object.values(uiContracts).every(Boolean) };
writeFileSync(resolve(root, `docs/v${version}-autonomous-experience.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: cases.length, uiContracts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
