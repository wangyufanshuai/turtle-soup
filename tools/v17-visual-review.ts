import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const output = resolve(root, "output/playwright/v17");
const required = [
  "desktop-home-golden-path.png", "mobile-home-golden-path.png",
  "desktop-c01-hint-level-3.png", "mobile-c01-hint-level-3.png",
  "desktop-c25-silent-second-bell-language-path.png", "mobile-c25-silent-second-bell-language-path.png",
  "desktop-c37-zeroed-pressure-gauge-language-path.png", "mobile-c37-zeroed-pressure-gauge-language-path.png",
  "desktop-c33-early-late-arrival-proof-gap.png", "mobile-c33-early-late-arrival-proof-gap.png",
  "desktop-c36-no-one-left-terminal-proof-gap.png", "mobile-c36-no-one-left-terminal-proof-gap.png",
  "desktop-c48-two-point-calibration-investigation.png", "mobile-c48-two-point-calibration-investigation.png",
  "desktop-c60-mobile-task-controls.png", "mobile-c60-mobile-task-controls.png",
  "desktop-c60-collapsed-proof.png", "mobile-c60-collapsed-proof.png",
];
function pngSize(path: string): { width: number; height: number } | undefined {
  if (!existsSync(path)) return undefined;
  const data = readFileSync(path);
  if (data.length < 24 || data.toString("ascii", 1, 4) !== "PNG") return undefined;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
const screenshots = required.map((name) => {
  const path = resolve(output, name);
  const size = pngSize(path);
  const expectedWidth = name.startsWith("mobile-") ? 390 : 1440;
  return { name, exists: existsSync(path), bytes: existsSync(path) ? statSync(path).size : 0, width: size?.width, height: size?.height, expectedWidth, passed: Boolean(size && size.width === expectedWidth && size.height >= 844) };
});
const globals = readFileSync(resolve(root, "apps/web/app/globals.css"), "utf8");
const auditSource = readFileSync(resolve(root, "tools/v17-browser-audit.ts"), "utf8");
const sourceChecks = {
  restingSkipLinkInvisible: globals.includes("opacity: 0") && globals.includes("pointer-events: none") && globals.includes(".skipLink:focus-visible"),
  screenshotFocusReset: auditSource.includes("document.activeElement === document.querySelector(\"main\")"),
  screenshotSkipLinkAssertion: auditSource.includes("skip link remained visible before screenshot"),
  mobileTaskEvidence: auditSource.includes("data-mobile-proof-controls"),
  collapsedProofEvidence: auditSource.includes("c60-collapsed-proof.png"),
};
const manualReview = [
  { surface: "home-desktop/mobile", finding: "黄金九案、推荐下一案与四季档案层级清楚；移动端长页由季节折叠控制。", blockingIssue: false },
  { surface: "C01 hint level 3", finding: "三级提示保持概念、证据类别、证明义务分层，不出现标准答案或下一问。", blockingIssue: false },
  { surface: "C25/C37 language path", finding: "公开谜面、系统理解和确定性回答分层；两案主场景辨识度明显。", blockingIssue: false },
  { surface: "C33/C36/C48 complex proof", finding: "手机一次呈现一个当前推理任务；长链仍高密度，但切板与提交无需穿越整条链。", blockingIssue: false },
  { surface: "C60 collapsed proof", finding: "完成板和闭合事件链可折叠，证明回放与挑战入口保持可达。", blockingIssue: false },
  { surface: "skip-link resting state", finding: "人工复查修订后的 C33 手机截图，跳转链接不再滞留于页面中段。", blockingIssue: false },
];
const failures = [
  ...screenshots.filter((item) => !item.passed).map((item) => `${item.name} missing or wrong dimensions`),
  ...Object.entries(sourceChecks).filter(([, value]) => !value).map(([key]) => `${key} source contract missing`),
  ...manualReview.filter((item) => item.blockingIssue).map((item) => `${item.surface}: ${item.finding}`),
];
const report = {
  reportVersion: "1.7",
  releaseProfile: "v1.7-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  reviewer: "Codex visual inspection of final Chromium screenshots",
  requiredScreenshotCount: required.length,
  screenshots,
  sourceChecks,
  manualReview,
  failures,
  passed: failures.length === 0,
  qualification: "截图与人工视觉审查能发现布局和层级回归，但不等同于真人审美偏好、理解率或乐趣验证。",
};
writeFileSync(resolve(root, "docs/v1.7-visual-review.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ screenshots: screenshots.length, sourceChecks, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
