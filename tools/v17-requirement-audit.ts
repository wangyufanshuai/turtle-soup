import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOLDEN_PATH_CASE_IDS } from "../apps/web/lib/golden-experience.ts";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const read = <T = any>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const release = loadReleaseContent(root, "v1.7-internal-rc");
const budgeted = read("docs/v1.7-budgeted-synthetic.json");
const experience = read("docs/v1.7-experience-calibration.json");
const soundscape = read("docs/v1.7-soundscape-calibration.json");
const browser = read("docs/v1.7-browser-matrix.json");
const visual = read("docs/v1.7-visual-review.json");
const performance = read("docs/v1.7-static-performance.json");
const security = read("docs/v1.7-security-scan.json");
const rebuild = read("docs/v1.7-rebuild-determinism.json");
const artifact = read("docs/v1.7-release-artifacts.json");
const routeCount = browser.routeSmoke.reduce((sum: number, group: any) => sum + group.routes.length, 0);
const flowCount = browser.fullFlows.reduce((sum: number, group: any) => sum + group.traces.length, 0);
const focus = new Map(experience.focusCases.map((item: any) => [item.caseId, item]));

const requirements = [
  { id: "golden-path", requirement: "无强制解锁墙的九案首玩路线，包含难度、时长和技能坡度。", evidence: ["apps/web/lib/golden-experience.ts", "apps/web/components/case-select.tsx", "docs/v1.7-experience-calibration.json"], passed: experience.goldenPath.actualOrder.join("|") === [...GOLDEN_PATH_CASE_IDS].join("|") && experience.goldenPath.unique && experience.goldenPath.optionalNoUnlockWall && experience.goldenPath.cases.every((item: any) => item.estimatedMinutes?.min > 0 && item.prerequisiteSkill && item.nextSkill) },
  { id: "bounded-blackbox", requirement: "有限提问、证据和理论预算；允许成功、放弃与耗尽，不使用公开搜索或组合穷举。", evidence: ["packages/mystery-core/src/budgeted-blackbox-runner.ts", "docs/v1.7-budgeted-synthetic.json"], passed: budgeted.runCount === 720 && budgeted.outcomes.solved > 0 && budgeted.outcomes.abandoned > 0 && budgeted.outcomes.budgetExhausted > 0 && budgeted.blackBoxBoundary.combinationSearch === false && budgeted.gates.bounded && budgeted.gates.noPublicSearch && budgeted.gates.honestDistribution },
  { id: "narrative-proxies", requirement: "真实记录多章节进入/切换，并区分红鲱鱼发现与穷举。", evidence: ["docs/v1.7-budgeted-synthetic.json", "docs/v1.7-experience-calibration.json"], passed: experience.chapterTracking.entryFieldPresent && experience.chapterTracking.transitionFieldPresent && experience.chapterTracking.multiChapterTransitionsObserved.length > 0 && experience.redHerringTracking.discoveredFieldPresent && experience.redHerringTracking.exhaustiveFieldPresent && experience.redHerringTracking.discoveryWithoutExhaustion > 0 },
  { id: "focus-c25-c37", requirement: "C25/C37 仅用表现/alias 修订，有效提问率≥0.82且存在非穷举自然推进路径。", evidence: ["content/zh/presentation/v1.7/patches.json", "content/zh/question-aliases/v1.7/packs.json", "docs/v1.7-experience-calibration.json"], passed: ["c25-silent-second-bell", "c37-zeroed-pressure-gauge"].every((caseId) => { const item: any = focus.get(caseId); return item?.passed && item.averageValidQuestionRate >= .82 && item.exhaustiveEvidenceRate < 1; }) && experience.frozenCompatibility.allUnchanged },
  { id: "complex-board-load", requirement: "C33/C36/C48/C60 手机单任务、完成板/闭合链折叠、缺口类别与就近提交；状态仅在 React 层。", evidence: ["apps/web/components/variant-shell.tsx", "docs/v1.7-experience-calibration.json", "docs/v1.7-browser-matrix.json"], passed: Object.values(experience.uiContracts).every(Boolean) && experience.complexBoards.every((item: any) => item.boardCount >= 2) && browser.calibration.every((item: any) => item.controlsVisible && item.boardSwitch && item.submitReachable && item.boardCollapse && item.chainCollapse) },
  { id: "safe-hint-ladder", requirement: "黄金路线三层主动提示，不含内部 ID、答案、事件顺序或下一条标准问题。", evidence: ["apps/web/components/hint-ladder.tsx", "apps/web/lib/golden-experience.test.ts", "docs/v1.7-experience-calibration.json"], passed: experience.goldenPath.cases.every((item: any) => item.hintLevels === 3 && item.hintSafe) && experience.uiContracts.hintIsPlayerInitiated },
  { id: "visual-sound-calibration", requirement: "黄金路线视觉审查与 60 案非必要音景；桌面/手机真实截图。", evidence: ["docs/v1.7-visual-review.json", "docs/v1.7-soundscape-calibration.json", "output/playwright/v17"], passed: visual.passed && visual.requiredScreenshotCount === 18 && soundscape.passed && soundscape.noFallbacks && soundscape.noRequiredAudioInformation && soundscape.uniqueSignatures === 60 },
  { id: "browser-exit-gates", requirement: "三浏览器路由、黄金流程、离线、焦点、无障碍、溢出和遮挡门禁。", evidence: ["docs/v1.7-browser-matrix.json"], passed: browser.passed && browser.partial === false && routeCount === 360 && flowCount === 168 && browser.consoleErrorCount === 0 && browser.offlineRecovery.passed && browser.fullFlows.flatMap((group: any) => group.traces).every((trace: any) => trace.axeSeriousCritical === 0 && trace.overflow === 0 && trace.obstruction === 0) },
  { id: "release-discipline", requirement: "v1.7 独立 profile/cache/report/ZIP；可重建；v1.0–v1.6 工件保持不变。", evidence: ["content/zh/releases/v1.7-internal-rc.json", "docs/v1.7-rebuild-determinism.json", "docs/v1.7-release-artifacts.json", "dist/turtle-soup-v1.7-internal-rc-web-pwa.zip"], passed: release.profile.id === "v1.7-internal-rc" && !release.profile.publishable && rebuild.passed && artifact.passed && artifact.preservedArtifacts.length === 7 && artifact.preservedArtifacts.every((item: any) => item.unchanged) && existsSync(resolve(root, artifact.artifact.archive.path)) },
  { id: "performance-security", requirement: "静态性能预算、Worker 反泄漏边界、无远程 AI/分析。", evidence: ["docs/v1.7-static-performance.json", "docs/v1.7-security-scan.json"], passed: performance.passed && security.passed && security.boundaries.remoteAnalytics === false && security.boundaries.remoteAI === false },
  { id: "human-evaluation-boundary", requirement: "humanParticipants=0，状态 internal-rc / human-evaluation-pending，自动化不冒充 Fun Gate。", evidence: ["docs/v1.7-internal-rc.md", "docs/v1.7-release-artifacts.json"], passed: [budgeted, experience, soundscape, browser, visual, performance, security, rebuild, artifact].every((report: any) => report.humanParticipants === 0 && String(report.status).includes("human-evaluation-pending")) },
];
const report = { reportVersion: "1.7", generatedAt: new Date().toISOString(), releaseProfile: "v1.7-internal-rc", status: "internal-rc / human-evaluation-pending", humanParticipants: 0, requirements, passedCount: requirements.filter((item) => item.passed).length, failedCount: requirements.filter((item) => !item.passed).length, passed: requirements.every((item) => item.passed), qualification: "逐条审计证明实现和机器门禁与 v1.7 目标一致；真人体验与市场结果仍待正式评测。" };
writeFileSync(resolve(root, "docs/v1.7-requirement-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requirements: requirements.length, passed: report.passedCount, failed: report.failedCount, status: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
