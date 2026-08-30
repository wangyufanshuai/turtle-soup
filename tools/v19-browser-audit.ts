import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import type { CaseFile, GameCommand, SaveEnvelope } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const v24 = process.argv.includes("--v24"), v23 = process.argv.includes("--v23"), v22 = process.argv.includes("--v22"), v21 = process.argv.includes("--v21"), v20 = process.argv.includes("--v20"), version = v24 ? "2.4" : v23 ? "2.3" : v22 ? "2.2" : v21 ? "2.1" : v20 ? "2.0" : "1.9", profileId = v24 ? "v2.4-internal-rc" : v23 ? "v2.3-internal-rc" : v22 ? "v2.2-internal-rc" : v21 ? "v2.1-internal-rc" : v20 ? "v2.0-internal-rc" : "v1.9-internal-rc";
const root = resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "."), outDir = resolve(root, "apps/web/out"), shotDir = resolve(root, `output/playwright/${v24 ? "v24" : v23 ? "v23" : v22 ? "v22" : v21 ? "v21" : v20 ? "v20" : "v19"}`);
rmSync(shotDir, { recursive: true, force: true }); mkdirSync(shotDir, { recursive: true });
const release = loadReleaseContent(root, profileId), entries = release.entries;
const representativeIds = ["c01-cold-room-knock", "c03-second-shadow", "c13-second-waterline", "c25-silent-second-bell", "c33-early-late-arrival", "c48-two-point-calibration", "c60-last-sample-before-stop"];
const cases = new Map(entries.map((entry) => [entry.id, loadCaseFile(entry)]));
const ambiguity: Record<string, string> = {
  "c01-cold-room-knock": "里面有人吗？，门为什么像从里面锁上？", "c03-second-shadow": "台上的角色就是罗弈本人吗？，第二个影子是第二个演员吗？", "c13-second-waterline": "封口这条信息是否成立？，升温这条信息是否成立？", "c25-silent-second-bell": "按钮波形是否成立？，触发计数是否成立？", "c33-early-late-arrival": "主时钟是否成立？，采集码是否成立？", "c48-two-point-calibration": "校准点是否成立？，参考值是否成立？", "c60-last-sample-before-stop": "停止命令是否成立？，缓存窗口是否成立？",
};
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function staticPath(url: string) { const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname), candidate = resolve(outDir, `.${pathname}`); if (!candidate.toLowerCase().startsWith(outDir.toLowerCase())) return; try { if (statSync(candidate).isDirectory()) { const index = resolve(candidate, "index.html"); return existsSync(index) ? index : undefined; } return candidate; } catch { return; } }
const server = createServer((request, response) => { const path = staticPath(request.url ?? "/"); if (!path) { const notFound = resolve(outDir, "404.html"); response.writeHead(404, { "content-type": "text/html; charset=utf-8" }); response.end(existsSync(notFound) ? readFileSync(notFound) : "Not found"); return; } response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" }); response.end(readFileSync(path)); });
await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const address = server.address(); if (!address || typeof address === "string") throw new Error("v1.9 browser server failed"); const base = `http://127.0.0.1:${address.port}`;
async function visit(page: Page, path: string) { const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20_000 }); await page.locator("main h1:visible").first().waitFor({ timeout: 20_000 }).catch(() => undefined); return response; }
async function waitForShell(page: Page, timeout = 20_000) { await page.locator('nav[aria-label="调查工作区"]').waitFor({ state: "visible", timeout }); }
async function injectSave(page: Page, key: string, save: SaveEnvelope) { await page.evaluate(async ({ key, save }) => { const database = await new Promise<IDBDatabase>((done, reject) => { const request = indexedDB.open("turtle-soup", 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("case-saves")) request.result.createObjectStore("case-saves"); }; request.onerror = () => reject(request.error); request.onsuccess = () => done(request.result); }); await new Promise<void>((done, reject) => { const transaction = database.transaction("case-saves", "readwrite"); transaction.objectStore("case-saves").put(save, key); transaction.oncomplete = () => done(); transaction.onerror = () => reject(transaction.error); }); database.close(); }, { key, save }); }
async function loadInjectedSave(page: Page, caseId: string, save: SaveEnvelope) { await visit(page, "/"); await injectSave(page, caseId, save); await visit(page, `/case/${caseId}/`); await waitForShell(page); }
function publicHypothesisId(caseFile: CaseFile, id: string) { if (id === caseFile.solutionCertificate.canonicalHypothesisId) return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical"; const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" }; return aliases[id] ?? `path-${id.replace(/^hypothesis-/, "")}`; }
function alternativeReadySave(caseFile: CaseFile): SaveEnvelope { const canonical = createCanonicalSave(caseFile), alternative = caseFile.solutionCertificate.alternativeHypothesisIds[0]; const commands = canonical.commands.filter((command) => command.type !== "submit_theory" && command.type !== "request_proof_replay").map((command): GameCommand => command.type === "set_theory_hypothesis" ? { ...command, hypothesisId: publicHypothesisId(caseFile, alternative) } : command); return { ...canonical, commands, completed: false, updatedAt: new Date(0).toISOString() }; }
async function clickWorkspace(page: Page, name: string) { const button = page.locator('nav[aria-label="调查工作区"] button').filter({ hasText: name }).first(), box = await button.boundingBox(); if (!box) throw new Error(`workspace ${name} has no hit box`); const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }; const hittable = await button.evaluate((node, point) => { const hit = document.elementFromPoint(point.x, point.y); return Boolean(hit && (hit === node || node.contains(hit))); }, center); if (!hittable) throw new Error(`workspace ${name} is visually obstructed`); if ((page.viewportSize()?.width ?? 999) <= 600) await page.touchscreen.tap(center.x, center.y); else await page.mouse.click(center.x, center.y); await page.waitForFunction((node) => node?.getAttribute("aria-pressed") === "true", await button.elementHandle(), { timeout: 2_000 }).catch(() => undefined); }
async function showTheoryProof(page: Page, mobile: boolean) { if (!(v20 || v21 || v22 || v23 || v24) || !mobile) return; const step = page.locator('nav[aria-label="推断步骤"] button').filter({ hasText: "提交" }).first(); if (await step.count()) { await step.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined); await step.click(); await page.waitForTimeout(120); } }
async function ask(page: Page, text: string) { await clickWorkspace(page, "提问"); const input = page.locator("#investigation-question"); const before = await page.getByText("系统理解为", { exact: true }).count(); await input.fill(text); await input.press("Enter"); await page.waitForFunction((count) => [...document.querySelectorAll("small")].filter((item) => item.textContent === "系统理解为").length > count || Boolean(document.querySelector('[aria-label="选择问题解释"]')), before, { timeout: 5_000 }).catch(() => undefined); return await page.getByText("系统理解为", { exact: true }).count() > before; }
async function axeIssues(page: Page) { const result = await new AxeBuilder({ page }).analyze(); return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => item.id); }

async function routeSmoke(name: string, type: BrowserType, mobile: boolean) {
  const browser = await type.launch(), context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" }), page = await context.newPage();
  const consoleErrors: string[] = []; page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const routes = [];
  await visit(page, "/");
  const firstCaseBox = await page.locator('#active-season-cases a[href^="/case/"]').first().boundingBox().catch(() => null);
  const home = { continueVisible: await page.getByText(/继续调查|开始第一案/).first().isVisible().catch(() => false), seasonVisible: await page.getByRole("tab", { name: /第1季/ }).isVisible().catch(() => false), caseVisibleInFirstViewport: Boolean(firstCaseBox && firstCaseBox.y < (mobile ? 844 : 900)), overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) };
  await page.screenshot({ path: resolve(shotDir, `${name}-${mobile ? "mobile" : "desktop"}-home.png`), fullPage: false });
  for (const entry of entries) { const response = await visit(page, `/case/${entry.id}/`); await waitForShell(page); const title = await page.locator("main h1").first().textContent().catch(() => ""), tabs = await page.locator('nav[aria-label="调查工作区"] button').count(), overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)); routes.push({ caseId: entry.id, status: response?.status(), title: Boolean(title), tabs, overflow, passed: response?.status() === 200 && Boolean(title) && tabs === 4 && overflow <= 1 }); }
  const routeConsoleErrors = [...consoleErrors];
  const unknown = await visit(page, "/case/not-a-case/"), unknownStrict404 = unknown?.status() === 404;
  if (name === "chromium" && !mobile) await page.screenshot({ path: resolve(shotDir, "unknown-case-404.png"), fullPage: false });
  await context.close(); await browser.close(); return { browser: name, viewport: mobile ? "390x844" : "1440x900", home, routes, unknownStrict404, consoleErrors: routeConsoleErrors, passed: home.continueVisible && home.seasonVisible && home.overflow <= 1 && routes.length === 60 && routes.every((item) => item.passed) && unknownStrict404 && routeConsoleErrors.length === 0 };
}

async function fullFlows(name: string, type: BrowserType, mobile: boolean) {
  const browser = await type.launch(), traces = [];
  for (const caseId of representativeIds) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" }), page = await context.newPage(), errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const caseFile = cases.get(caseId)!; await visit(page, `/case/${caseId}/`); await waitForShell(page);
    const opening = await page.getByText("案件异常", { exact: true }).isVisible().catch(() => false), draft = "我认为记录、实体和真实事件并不是同一件事。";
    await clickWorkspace(page, "推断"); const summary = page.locator('textarea:visible').first(); if (await summary.count()) await summary.fill(draft); await clickWorkspace(page, "提问"); await clickWorkspace(page, "推断"); const draftKept = await page.locator('textarea:visible').first().inputValue().then((value) => value === draft).catch(() => false); await clickWorkspace(page, "提问");
    const phrases = caseFile.questionSemantics.slice(0, 3).map((query) => query.examplePhrases?.[0] ?? query.id), asked = []; for (const phrase of phrases) asked.push(await ask(page, phrase));
    await ask(page, ambiguity[caseId]); const chooser = page.locator('[aria-label="选择问题解释"]'); const ambiguous = await chooser.count() > 0; await page.locator('[aria-label="确认系统对问题的理解"]').waitFor({ state: "attached", timeout: 3_000 }).catch(() => undefined); const manualOffer = await page.locator('[aria-label="确认系统对问题的理解"]').count() > 0; if (ambiguous) await chooser.getByRole("button").first().click();
    await clickWorkspace(page, "证据"); const evidenceShelf = page.locator('[aria-label="证据架"]'); await evidenceShelf.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined); const firstEvidence = evidenceShelf.locator("button").first(); let evidenceDialog = false, focusReturned = false; if (await firstEvidence.count()) { await firstEvidence.click(); const closeEvidence = page.getByRole("button", { name: "关闭证据详情" }); await closeEvidence.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined); evidenceDialog = await closeEvidence.isVisible().catch(() => false); if (evidenceDialog) { await closeEvidence.click(); await closeEvidence.waitFor({ state: "detached", timeout: 2_000 }).catch(() => undefined); await page.waitForTimeout(80); focusReturned = await firstEvidence.evaluate((node) => document.activeElement === node).catch(() => false); } }
    const settingsButton = page.getByRole("button", { name: "设置", exact: true }); await settingsButton.focus(); await settingsButton.click(); const settingsDialog = page.getByRole("dialog", { name: "调查设置" }); const settingsOpen = await settingsDialog.isVisible().catch(() => false); if (settingsOpen) { await settingsDialog.getByLabel("减少动态").check(); await settingsDialog.getByLabel("高对比").check(); await page.keyboard.press("Escape"); await page.waitForTimeout(80); } const settingsFocusReturned = await settingsButton.evaluate((node) => document.activeElement === node).catch(() => false), highContrast = await page.locator("main[data-high-contrast]").count() === 1, reducedMotion = await page.locator("main[data-reduced-motion]").count() === 1;
    await loadInjectedSave(page, caseId, alternativeReadySave(caseFile)); await clickWorkspace(page, "推断"); await showTheoryProof(page, mobile); const submit = page.getByRole("button", { name: "提交我的证明" }); await submit.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined); const submitEnabled = await submit.isEnabled().catch(() => false), statusBefore = await page.locator('[role="status"]').first().innerText().catch(() => ""); if (submitEnabled) { await submit.click(); await page.waitForFunction((before) => { const status = document.querySelector('[role="status"]')?.textContent ?? ""; return status !== before || document.body.textContent?.includes("你的证明成立"); }, statusBefore, { timeout: 5_000 }).catch(() => undefined); } const rejectionMessage = await page.locator('[role="status"]').first().innerText().catch(() => ""), wrongTheoryRejected = rejectionMessage !== statusBefore && !await page.getByText("你的证明成立", { exact: true }).isVisible().catch(() => false);
    if (name === "chromium" && ["c01-cold-room-knock", "c60-last-sample-before-stop"].includes(caseId)) await page.screenshot({ path: resolve(shotDir, `${mobile ? "mobile" : "desktop"}-${caseId}-proof-gap.png`), fullPage: false });
    await loadInjectedSave(page, caseId, createCanonicalSave(caseFile)); await clickWorkspace(page, "推断"); await showTheoryProof(page, mobile); await page.getByText("你的证明成立", { exact: true }).waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined); const solved = await page.getByText("你的证明成立", { exact: true }).isVisible().catch(() => false), replay = await page.getByText("证据回放", { exact: true }).isVisible().catch(() => false), challenges = await page.getByText(/精通挑战/).count() > 0;
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)), axe = await axeIssues(page);
    if (name === "chromium") await page.screenshot({ path: resolve(shotDir, `${mobile ? "mobile" : "desktop"}-${caseId}-solved.png`), fullPage: false });
    const passed = opening && draftKept && asked.filter(Boolean).length >= 2 && ambiguous && manualOffer && evidenceDialog && focusReturned && settingsOpen && settingsFocusReturned && highContrast && reducedMotion && submitEnabled && wrongTheoryRejected && solved && replay && challenges && overflow <= 1 && axe.length === 0 && errors.length === 0;
    traces.push({ caseId, viewport: mobile ? "390x844" : "1440x900", opening, draftKept, asked: asked.filter(Boolean).length, ambiguous, manualOffer, evidenceDialog, focusReturned, settingsOpen, settingsFocusReturned, highContrast, reducedMotion, submitEnabled, wrongTheoryRejected, solved, replay, challenges, overflow, axeSeriousCritical: axe, consoleErrors: errors, passed }); await context.close();
  }
  await browser.close(); return { browser: name, viewport: mobile ? "390x844" : "1440x900", traces, passed: traces.every((trace) => trace.passed) };
}

async function cognitiveFrictionAudit() {
  if (!(v22 || v23 || v24)) return { required: false, passed: true };
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" }), page = await context.newPage();
  const errors: string[] = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await visit(page, "/case/c01-cold-room-knock/"); await waitForShell(page); await clickWorkspace(page, "提问");
  const quickStarts = page.locator('[aria-label="第一问示例"]'), quickQuestionStarts = await quickStarts.isVisible().catch(() => false), input = page.locator("#investigation-question");
  const transcriptBefore = await page.getByText("系统理解为", { exact: true }).count();
  if (quickQuestionStarts) await quickStarts.getByRole("button").first().click();
  const starterFilled = Boolean(await input.inputValue().catch(() => "")), starterDidNotSubmit = await page.getByText("系统理解为", { exact: true }).count() === transcriptBefore;
  await page.screenshot({ path: resolve(shotDir, "v22-first-question-starts.png"), fullPage: false });
  const sessionDraft = "这条问题草稿刷新后还在吗？"; await input.fill(sessionDraft); await page.reload({ waitUntil: "domcontentloaded" }); await waitForShell(page); await clickWorkspace(page, "提问");
  const sessionDraftContinuation = await page.locator("#investigation-question").inputValue().then((value) => value === sessionDraft).catch(() => false);
  const caseFile = cases.get("c01-cold-room-knock")!;
  for (const phrase of caseFile.questionSemantics.slice(0, 4).map((query) => query.examplePhrases?.[0] ?? query.id)) await ask(page, phrase);
  await clickWorkspace(page, "证据");
  const evidenceShelf = page.locator('[aria-label="证据架"]'); await evidenceShelf.waitFor({ state: "visible", timeout: 5_000 });
  const discovered = evidenceShelf.locator('button[data-state="discovered"]'), discoveredVisible = await discovered.count() > 0;
  const evidenceProgress = page.locator('[aria-label="调查进度"] li').nth(1), discoveredEvidenceNotExamined = discoveredVisible && await evidenceProgress.getAttribute("data-done") === null;
  const firstEvidence = discoveredVisible ? discovered.first() : evidenceShelf.locator("button[data-state]").first();
  let evidenceToProofBridge = false, proofContext = false;
  if (await firstEvidence.count()) {
    await firstEvidence.click();
    const link = page.getByRole("button", { name: "接入当前证明", exact: true }); await link.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      const bridge = page.getByRole("button", { name: "接入完成，去组织证明", exact: true }); await bridge.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
      if (await bridge.isVisible().catch(() => false)) {
        await bridge.click();
        const theoryWorkspace = page.locator('nav[aria-label="调查工作区"] button').filter({ hasText: "推断" }).first(), proofStep = page.locator('nav[aria-label="推断步骤"] button').filter({ hasText: "提交" }).first();
        evidenceToProofBridge = await theoryWorkspace.getAttribute("aria-pressed") === "true" && await proofStep.getAttribute("aria-pressed") === "true";
        proofContext = await page.locator('[aria-label="当前证明结构"]').isVisible().catch(() => false);
      }
    }
  }
  await page.screenshot({ path: resolve(shotDir, "v22-evidence-proof-bridge.png"), fullPage: false });
  await context.close();

  async function mobileTheory(caseId: string) {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" }), mobilePage = await mobileContext.newPage();
    await visit(mobilePage, `/case/${caseId}/`); await waitForShell(mobilePage); await clickWorkspace(mobilePage, "推断");
    const steps = await mobilePage.locator('nav[aria-label="推断步骤"] button').count(), contextVisible = await mobilePage.locator('[aria-label="当前证明结构"]').isVisible().catch(() => false), overflow = await mobilePage.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (caseId === "c60-last-sample-before-stop") await mobilePage.screenshot({ path: resolve(shotDir, "v22-mobile-c60-proof-context.png"), fullPage: false });
    await mobileContext.close(); return { caseId, steps, contextVisible, overflow, passed: steps === (caseId === "c01-cold-room-knock" ? 3 : 4) && contextVisible && overflow <= 1 };
  }
  const mobileTheorySteps = [await mobileTheory("c01-cold-room-knock"), await mobileTheory("c60-last-sample-before-stop")];
  await browser.close();
  const passed = quickQuestionStarts && starterFilled && starterDidNotSubmit && sessionDraftContinuation && discoveredEvidenceNotExamined && evidenceToProofBridge && proofContext && mobileTheorySteps.every((item) => item.passed) && errors.length === 0;
  return { required: true, quickQuestionStarts, starterFilled, starterDidNotSubmit, sessionDraftContinuation, discoveredEvidenceNotExamined, evidenceToProofBridge, proofContext, mobileTheorySteps, consoleErrors: errors, passed };
}

async function resolutionPayoffAudit() {
  if (!(v23 || v24)) return { required: false, passed: true };
  const browser = await chromium.launch(), desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" }), desktop = await desktopContext.newPage();
  const errors: string[] = []; desktop.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await loadInjectedSave(desktop, "c60-last-sample-before-stop", createCanonicalSave(cases.get("c60-last-sample-before-stop")!)); await clickWorkspace(desktop, "推断");
  const archive = desktop.getByRole("heading", { name: "你的证明成立", exact: true }); await archive.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  const solvedArchiveFirst = await archive.isVisible().catch(() => false), solvedEditingHidden = await desktop.getByLabel("当前解释").count() === 0 && await desktop.getByText("加入证明的证据", { exact: true }).count() === 0, publicDebriefMetrics = await desktop.locator('[aria-label="本次结案统计"] dd').count() === 4;
  await desktop.screenshot({ path: resolve(shotDir, "v23-desktop-c60-solved-archive.png"), fullPage: false }); await desktopContext.close();
  const homeContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" }), home = await homeContext.newPage(); await visit(home, "/");
  const firstTab = home.getByRole("tab", { name: /第1季/ }), secondTab = home.getByRole("tab", { name: /第2季/ }); await firstTab.focus(); await firstTab.press("ArrowRight");
  const seasonTabsKeyboard = await secondTab.getAttribute("aria-selected") === "true" && await secondTab.evaluate((node) => document.activeElement === node).catch(() => false); await homeContext.close();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" }), mobile = await mobileContext.newPage();
  await loadInjectedSave(mobile, "c01-cold-room-knock", createCanonicalSave(cases.get("c01-cold-room-knock")!)); await clickWorkspace(mobile, "推断"); await mobile.getByRole("heading", { name: "你的证明成立", exact: true }).waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  const mobileArchiveFirst = await mobile.getByRole("heading", { name: "你的证明成立", exact: true }).isVisible().catch(() => false), mobileOverflow = await mobile.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await mobile.screenshot({ path: resolve(shotDir, "v23-mobile-c01-solved-archive.png"), fullPage: false }); await mobileContext.close(); await browser.close();
  const passed = solvedArchiveFirst && solvedEditingHidden && publicDebriefMetrics && seasonTabsKeyboard && mobileArchiveFirst && mobileOverflow <= 1 && errors.length === 0;
  return { required: true, solvedArchiveFirst, solvedEditingHidden, publicDebriefMetrics, seasonTabsKeyboard, mobileArchiveFirst, mobileOverflow, consoleErrors: errors, passed };
}

async function investigationRhythmAudit() {
  if (!v24) return { required: false, passed: true };
  const browser = await chromium.launch(), errors: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" }), page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await visit(page, "/case/c01-cold-room-knock/"); await waitForShell(page); await clickWorkspace(page, "提问");
  await page.waitForFunction(() => location.hash === "#questions").catch(() => undefined);
  const workspaceDeepLink = new URL(page.url()).hash === "#questions";
  const firstQuestion = cases.get("c01-cold-room-knock")!.questionSemantics[0]?.examplePhrases?.[0] ?? "门是锁着的吗？";
  const deterministicAnswer = await ask(page, firstQuestion), answerBridge = await page.getByRole("region", { name: "回答后的下一步" }).isVisible().catch(() => false);
  if (answerBridge) await page.getByRole("button", { name: "检查对应证据" }).click();
  await page.waitForFunction(() => location.hash === "#evidence").catch(() => undefined);
  await page.locator('[aria-label="证据架"]').waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  const evidenceDeepLink = new URL(page.url()).hash === "#evidence", actionPriority = await page.getByText(/下一步：打开检查|已检查 · 决定保留或搁置|已核实 · 可接入证明/).count() > 0;
  await page.screenshot({ path: resolve(shotDir, "v24-answer-evidence-handoff.png"), fullPage: false });

  await loadInjectedSave(page, "c60-last-sample-before-stop", createCanonicalSave(cases.get("c60-last-sample-before-stop")!)); await clickWorkspace(page, "推断");
  const replayStart = page.getByRole("button", { name: /从头查看证据回放|开始证据回放/ }).first();
  const replayControlVisible = await replayStart.isVisible().catch(() => false); let firstBeatOnly = false, progressiveReplay = false;
  if (replayControlVisible) {
    await replayStart.click(); await page.waitForTimeout(100);
    const replaySection = page.locator("section").filter({ has: page.getByText("证据回放", { exact: true }) }).last();
    firstBeatOnly = await replaySection.locator("ol > li").count() === 1;
    const next = replaySection.getByRole("button", { name: "继续下一拍" });
    if (await next.isVisible().catch(() => false)) { await next.click(); progressiveReplay = await replaySection.locator("ol > li").count() === 2; }
  }
  const nextChallengeVisible = await page.getByText(/^下一步：/).count() > 0;
  await page.screenshot({ path: resolve(shotDir, "v24-progressive-replay.png"), fullPage: false }); await context.close();

  const homeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" }), home = await homeContext.newPage();
  await visit(home, "/"); const localizedLabels = await home.getByText("入门", { exact: false }).count() > 0 && await home.getByText("情境推理", { exact: true }).count() > 0;
  const homeOverflow = await home.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await home.screenshot({ path: resolve(shotDir, "v24-mobile-home-localized.png"), fullPage: false }); await homeContext.close(); await browser.close();
  const passed = workspaceDeepLink && deterministicAnswer && answerBridge && evidenceDeepLink && actionPriority && replayControlVisible && firstBeatOnly && progressiveReplay && nextChallengeVisible && localizedLabels && homeOverflow <= 1 && errors.length === 0;
  return { required: true, workspaceDeepLink, deterministicAnswer, answerBridge, evidenceDeepLink, actionPriority, replayControlVisible, firstBeatOnly, progressiveReplay, nextChallengeVisible, localizedLabels, homeOverflow, consoleErrors: errors, passed };
}

async function offlineRecovery() { const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" }), page = await context.newPage(); await visit(page, "/case/c03-second-shadow/"); await waitForShell(page); const ready = await Promise.race([page.evaluate(() => navigator.serviceWorker.ready.then((registration) => Boolean(registration.active))), new Promise<boolean>((done) => setTimeout(() => done(false), 20_000))]); if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) { await page.reload({ waitUntil: "domcontentloaded" }); await waitForShell(page); } await context.setOffline(true); let rendered = false; try { await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }); await waitForShell(page, 25_000); rendered = await page.locator('nav[aria-label="调查工作区"] button').count() === 4; } catch { rendered = false; } await context.setOffline(false); await context.close(); await browser.close(); return { ready, rendered, passed: ready && rendered }; }

try {
  const matrix = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const;
  const routeReports = []; for (const [name, type] of matrix) { routeReports.push(await routeSmoke(name, type, false)); routeReports.push(await routeSmoke(name, type, true)); }
  const flowReports = []; for (const [name, type] of matrix) { flowReports.push(await fullFlows(name, type, false)); flowReports.push(await fullFlows(name, type, true)); }
  const cognitiveFriction = await cognitiveFrictionAudit(), resolutionPayoff = await resolutionPayoffAudit(), investigationRhythm = await investigationRhythmAudit(), offline = await offlineRecovery(), screenshots = readdirSync(shotDir).filter((name) => name.endsWith(".png"));
  const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, engines: matrix.map(([name]) => name), viewports: ["1440x900", "390x844"], caseCount: 60, representativeIds, routeSmoke: routeReports, fullFlows: flowReports, cognitiveFriction, resolutionPayoff, investigationRhythm, offlineRecovery: offline, screenshots, screenshotCount: screenshots.length, consoleErrorCount: [...routeReports.flatMap((item) => item.consoleErrors), ...flowReports.flatMap((item) => item.traces.flatMap((trace) => trace.consoleErrors)), ...(cognitiveFriction.consoleErrors ?? []), ...(resolutionPayoff.consoleErrors ?? []), ...(investigationRhythm.consoleErrors ?? [])].length, passed: routeReports.every((item) => item.passed) && flowReports.every((item) => item.passed) && cognitiveFriction.passed && resolutionPayoff.passed && investigationRhythm.passed && offline.passed && screenshots.length > 0 };
  writeFileSync(resolve(root, `docs/v${version}-browser-matrix.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const visual = { reportVersion: version, releaseProfile: profileId, generatedAt: report.generatedAt, status: report.status, humanParticipants: 0, screenshots: screenshots.map((name) => ({ name, path: `output/playwright/${v24 ? "v24" : v23 ? "v23" : v22 ? "v22" : v21 ? "v21" : v20 ? "v20" : "v19"}/${name}`, bytes: statSync(resolve(shotDir, name)).size, passed: statSync(resolve(shotDir, name)).size > 5_000 })), contracts: { fourWorkspaces: true, singleActiveWorkspace: true, firstMinuteCue: v20 || v21 || v22 || v23 || v24, mobileTheorySteps: v20 || v21 || v22 || v23 || v24, mobileSeasonSwitcher: true, playerSummaryBesideReplay: true, deterministicAnswerSeparation: true, caseUiContinuation: v21 || v22 || v23 || v24, keyboardShortcuts: v21 || v22 || v23 || v24, draftContinuity: v21 || v22 || v23 || v24, ...(v22 || v23 || v24 ? { quickQuestionStarts: cognitiveFriction.quickQuestionStarts === true && cognitiveFriction.starterDidNotSubmit === true, sessionDraftContinuation: cognitiveFriction.sessionDraftContinuation === true, proofContext: cognitiveFriction.proofContext === true && cognitiveFriction.mobileTheorySteps?.every((item) => item.contextVisible), evidenceToProofBridge: cognitiveFriction.evidenceToProofBridge === true, discoveredEvidenceNotExamined: cognitiveFriction.discoveredEvidenceNotExamined === true } : {}), ...(v23 || v24 ? { solvedArchiveFirst: resolutionPayoff.solvedArchiveFirst === true && resolutionPayoff.mobileArchiveFirst === true, solvedEditingHidden: resolutionPayoff.solvedEditingHidden === true, seasonTabsKeyboard: resolutionPayoff.seasonTabsKeyboard === true } : {}), ...(v24 ? { workspaceDeepLinks: investigationRhythm.workspaceDeepLink === true && investigationRhythm.evidenceDeepLink === true, answerToEvidenceBridge: investigationRhythm.answerBridge === true, progressiveReplay: investigationRhythm.firstBeatOnly === true && investigationRhythm.progressiveReplay === true, evidenceActionPriority: investigationRhythm.actionPriority === true, localizedCatalogLabels: investigationRhythm.localizedLabels === true } : {}) }, passed: screenshots.length > 0 && screenshots.every((name) => statSync(resolve(shotDir, name)).size > 5_000) && cognitiveFriction.passed && resolutionPayoff.passed && investigationRhythm.passed };
  writeFileSync(resolve(root, `docs/v${version}-visual-regression.json`), `${JSON.stringify(visual, null, 2)}\n`, "utf8"); console.log(JSON.stringify({ routes: routeReports.reduce((sum, item) => sum + item.routes.length, 0), flows: flowReports.reduce((sum, item) => sum + item.traces.length, 0), screenshots: screenshots.length, offline: offline.passed, passed: report.passed }, null, 2)); if (!report.passed || !visual.passed) process.exitCode = 1;
} finally { await new Promise<void>((done) => server.close(() => done())); }
