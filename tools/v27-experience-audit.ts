import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const v210 = process.argv.includes("--v210"), v29 = process.argv.includes("--v29"), v28 = process.argv.includes("--v28");
const version = v210 ? "2.10" : v29 ? "2.9" : v28 ? "2.8" : "2.7";
const profileId = v210 ? "v2.10-internal-rc" : v29 ? "v2.9-internal-rc" : v28 ? "v2.8-internal-rc" : "v2.7-internal-rc";
const shellPath = resolve(root, "apps/web/components/investigation-shell.tsx");
const homePath = resolve(root, "apps/web/components/case-select.tsx");
const homeStylesPath = resolve(root, "apps/web/components/case-select.module.css");
const routerPath = resolve(root, "apps/web/components/question-router-controls.tsx");
const shell = readFileSync(shellPath, "utf8");
const home = readFileSync(homePath, "utf8");
const homeStyles = readFileSync(homeStylesPath, "utf8");
const router = readFileSync(routerPath, "utf8");
const topbarSource = shell.slice(shell.indexOf("<header className={styles.topbar}"), shell.indexOf("<StorageRecovery"));
const contracts = {
  unifiedShell: shell.includes("export function InvestigationShell"),
  directChineseWorkspaces: ["现场", "提问", "证据", "推断"].every((label) => shell.includes(label)),
  settingsOnlyFunGate: shell.includes("<h3>测试与诊断</h3>") && shell.includes("<FunGateTools report={funGate.report}") && !topbarSource.includes("FunGateTools"),
  reversibleQuestion: shell.includes("上一轮问题已撤销"),
  explicitActionFeedback: ["证据状态已更新", "推理板已更新", "新的调查阶段已解锁", "现场位置已记录"].every((copy) => shell.includes(copy)),
  settingsFocusTrap: shell.includes("aria-modal=\"true\"") && shell.includes("handleKey"),
  aiPresets: router.includes("AI_PROVIDER_PRESETS") && router.includes("本机端点：允许 HTTP，不要求 Key"),
  aiFailureCopy: router.includes("没有 Key 仍可完整离线游玩"),
  homeRecentAndSeasonTabs: home.includes("最近调查") && home.includes("role=\"tablist\"") && home.includes("搜索当前季"),
  ...(v28 ? {
    compactGuidance: shell.includes("nextCueStatus") && !shell.includes("<div className={styles.feedback}"),
    settingsSections: ["settings-panel-experience", "settings-panel-ai", "settings-panel-data"].every((id) => shell.includes(id)),
    advancedHostRewriteCollapsed: shell.includes("主持措辞（高级，可选）") && shell.includes("settingsDisclosure"),
  } : {}),
  ...(v29 || v210 ? {
    compactGuidance: shell.includes("showFeedback") && !shell.includes("<div className={styles.feedback}"),
    settingsSections: ["settings-panel-experience", "settings-panel-ai", "settings-panel-data"].every((id) => shell.includes(id)),
    languageRecoveryEntry: shell.includes('openSettings("ai", trigger)') && shell.includes("questionSafety") && shell.includes("onConfigure={openAiSettings}"),
    limitedQuestionBudget: shell.includes("questionCountLabel") && shell.includes('projection.replayMode === "limited-questions"'),
  } : {}),
  ...(v210 ? {
    completedArchiveForeground: shell.includes('if (!uiStateReady || !projection.solved) return;') && shell.includes('setWorkspace("theory")'),
    distinctFirstChoices: home.includes('!latest && firstUnfinishedStep.caseId === "c01-cold-room-knock"'),
    fiveSeasonSingleRow: homeStyles.includes("grid-template-columns:repeat(5,minmax(0,1fr))"),
  } : {}),
};
const report = {
  reportVersion: version,
  releaseProfile: profileId,
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
    scope: v210 ? "completed-case foregrounding, five-season navigation and onboarding deduplication" : v29 ? "language recovery, reversible question reassurance and challenge budget visibility" : v28 ? "guided investigation hierarchy and progressive settings disclosure" : "player-first navigation, local AI setup clarity and deterministic action feedback",
  contracts,
  sourceArtifacts: [shellPath, homePath, homeStylesPath, routerPath].map((path) => ({ path: path.slice(root.length + 1), exists: existsSync(path) })),
  passed: Object.values(contracts).every(Boolean),
  qualification: "Static contracts verify intended interaction affordances. They do not establish fun, comprehension, pacing or market fit.",
};
writeFileSync(resolve(root, `docs/v${version}-experience-audit.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ contracts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
