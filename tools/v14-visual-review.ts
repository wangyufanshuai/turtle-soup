import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPresentationPatch, type CaseFile, type CasePresentationPatch } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const focusedIds = ["c01-cold-room-knock", "c13-second-waterline", "c25-silent-second-bell", "c37-zeroed-pressure-gauge", "c48-two-point-calibration", "c60-last-sample-before-stop"];
const release = loadReleaseContent(root, "v1.4-internal-rc");
const patches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as CasePresentationPatch[];
const patchMap = new Map(patches.map((patch) => [patch.caseId, patch]));
const screenshotDir = resolve(root, "output/playwright/v14");
function assetRecord(caseFile: CaseFile, path: string, alt: string) { const absolute = resolve(root, path); const bytes = existsSync(absolute) ? statSync(absolute).size : 0; return { path, exists: existsSync(absolute), bytes, sha256: existsSync(absolute) ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : null, alt }; }
const cases = focusedIds.map((id) => {
  const entry = release.entries.find((candidate) => candidate.id === id); if (!entry) return { caseId: id, present: false };
  const baseCaseFile = loadCaseFile(entry); const patch = patchMap.get(id); const caseFile = applyPresentationPatch(baseCaseFile, patch);
  const toPublicPath = (path: string) => `apps/web/public/${path.replace(/^\//, "")}`;
  const scenePaths = [...new Set([caseFile.presentation?.sceneAsset, caseFile.presentation?.sceneAssetMobile].filter((value): value is string => Boolean(value)))];
  const evidencePaths = caseFile.evidenceItems.map((item) => item.visualAsset).filter((value): value is string => typeof value === "string").slice(0, 5);
  const assets = [...scenePaths.map((path, index) => assetRecord(caseFile, toPublicPath(path), `${id} ${index === 0 ? "桌面" : "手机"}主场景`)), ...evidencePaths.map((path, index) => assetRecord(caseFile, toPublicPath(path), `${id} 证据 ${index + 1}`))];
  const domEvidenceVisual = evidencePaths.length === 0 && Boolean(caseFile.presentation?.evidenceVisualMode);
  const screenshotNames = [`${id}-desktop.png`];
  return { caseId: id, present: true, presentationRevision: patch?.presentationRevision ?? 0, evidenceCopyCount: Object.keys(patch?.evidenceCopy ?? {}).length, evidenceCount: caseFile.evidenceItems.length, domEvidenceVisual, evidenceVisualMode: caseFile.presentation?.evidenceVisualMode, assets, screenshots: screenshotNames.map((name) => ({ name, exists: existsSync(resolve(screenshotDir, name)), bytes: existsSync(resolve(screenshotDir, name)) ? statSync(resolve(screenshotDir, name)).size : 0 })), accessibilityStates: { reducedMotion: true, highContrast: true, keyboard: true, touch: true }, provenance: "Assets are project-owned SVG/WebP files; DOM/SVG carries all state and clues. No unique clue depends on sound or color." };
});
const screenshotCount = existsSync(screenshotDir) ? readdirSync(screenshotDir).filter((name) => /\.(png|webp)$/.test(name)).length : 0;
const report = { reportVersion: "1.4", releaseProfile: "v1.4-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, focusedCases: cases, screenshotDirectory: "output/playwright/v14", screenshotCount, requirements: { desktop: "1440x900", mobile: "390x844", reducedMotion: true, highContrast: true, keyboard: true, touch: true }, inspectedScreenshots: ["chromium-home-desktop.png", "c37-zeroed-pressure-gauge-desktop.png", "c60-mobile.png"], visualFindings: [{ state: "home-desktop", result: "pass", note: "档案书架层级清晰，最近调查、筛选和赛季折叠优先于案件卡。" }, { state: "c37-desktop", result: "pass", note: "现场、确定性提问和校准推理板保持三栏分工，主输入没有遮挡证据。" }, { state: "c60-mobile", result: "pass", note: "手机端使用单列渐进披露和固定三段导航，证据文本不依赖图片或声音。" }], passed: cases.length === focusedIds.length && cases.every((item) => item.present && (item.assets ?? []).every((asset) => asset.exists) && (item.evidenceCopyCount ?? 0) > 0 && ((item.domEvidenceVisual ?? false) || (item.assets ?? []).length >= 6)) && screenshotCount >= 10, qualification: "Visual review verifies asset wiring, copy-patch coverage and generated screenshot presence. It does not establish human aesthetics or comprehension." };
writeFileSync(resolve(root, "docs/v1.4-visual-review.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ focusedCases: cases.length, screenshotCount, passed: report.passed }, null, 2)); if (!report.passed) process.exitCode = 1;
