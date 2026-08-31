import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const shellPath = resolve(root, "apps/web/components/investigation-shell.tsx");
const homePath = resolve(root, "apps/web/components/case-select.tsx");
const routerPath = resolve(root, "apps/web/components/question-router-controls.tsx");
const shell = readFileSync(shellPath, "utf8");
const home = readFileSync(homePath, "utf8");
const router = readFileSync(routerPath, "utf8");
const topbarSource = shell.slice(shell.indexOf("<header className={styles.topbar}"), shell.indexOf("<StorageRecovery"));
const contracts = {
  unifiedShell: shell.includes("export function InvestigationShell"),
  directChineseWorkspaces: ["现场", "提问", "证据", "推断"].every((label) => shell.includes(label)),
  settingsOnlyFunGate: shell.includes("本地测试与诊断") && shell.includes("<FunGateTools report={funGate.report}") && !topbarSource.includes("FunGateTools"),
  reversibleQuestion: shell.includes("上一轮问题已撤销"),
  explicitActionFeedback: ["证据状态已更新", "推理板已更新", "新的调查阶段已解锁", "现场位置已记录"].every((copy) => shell.includes(copy)),
  settingsFocusTrap: shell.includes("aria-modal=\"true\"") && shell.includes("handleKey"),
  aiPresets: router.includes("AI_PROVIDER_PRESETS") && router.includes("本机端点：允许 HTTP，不要求 Key"),
  aiFailureCopy: router.includes("没有 Key 仍可完整离线游玩"),
  homeRecentAndSeasonTabs: home.includes("最近调查") && home.includes("role=\"tablist\"") && home.includes("搜索当前季"),
};
const report = {
  reportVersion: "2.7",
  releaseProfile: "v2.7-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  scope: "player-first navigation, local AI setup clarity and deterministic action feedback",
  contracts,
  sourceArtifacts: [shellPath, homePath, routerPath].map((path) => ({ path: path.slice(root.length + 1), exists: existsSync(path) })),
  passed: Object.values(contracts).every(Boolean),
  qualification: "Static contracts verify intended interaction affordances. They do not establish fun, comprehension, pacing or market fit.",
};
writeFileSync(resolve(root, "docs/v2.7-experience-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ contracts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
