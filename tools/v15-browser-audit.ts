import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import type { CaseFile, GameCommand, SaveEnvelope } from "../packages/mystery-core/src/index.ts";
import { GOLDEN_CASE_IDS } from "../apps/web/lib/golden-experience.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent, type ReleaseCaseEntry } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const outputDir = resolve(root, "output/playwright/v15");
mkdirSync(outputDir, { recursive: true });
const release = loadReleaseContent(root, "v1.5-internal-rc");
const entries = release.entries;
const byId = new Map(entries.map((entry) => [entry.id, { entry, caseFile: loadCaseFile(entry) }]));
const aliasPacks = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.5/packs.json"), "utf8")) as Array<{ caseId: string; ambiguousPhrases?: Array<{ text: string }> }>;
const aliasByCase = new Map(aliasPacks.map((pack) => [pack.caseId, pack]));
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function staticPath(url: string) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const candidate = resolve(outDir, `.${pathname}`);
  if (!candidate.toLowerCase().startsWith(outDir.toLowerCase())) return undefined;
  try {
    if (statSync(candidate).isDirectory()) {
      const index = resolve(candidate, "index.html");
      return existsSync(index) ? index : undefined;
    }
    return candidate;
  } catch { return undefined; }
}

const server = createServer((request, response) => {
  const path = staticPath(request.url ?? "/");
  if (!path) {
    const notFound = resolve(outDir, "404.html");
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(existsSync(notFound) ? readFileSync(notFound) : "Not found");
    return;
  }
  response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
  response.end(readFileSync(path));
});
await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const address = server.address();
if (!address || typeof address === "string") throw new Error("v15 browser audit server failed");
const base = `http://127.0.0.1:${address.port}`;

async function visit(page: Page, path: string) {
  const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), { timeout: 20_000 });
  return response;
}

async function injectSave(page: Page, key: string, save: SaveEnvelope) {
  await page.evaluate(async ({ key, save }) => {
    const database = await new Promise<IDBDatabase>((done, reject) => {
      const request = indexedDB.open("turtle-soup", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("case-saves")) request.result.createObjectStore("case-saves"); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => done(request.result);
    });
    await new Promise<void>((done, reject) => {
      const transaction = database.transaction("case-saves", "readwrite");
      transaction.objectStore("case-saves").put(save, key);
      transaction.oncomplete = () => done();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { key, save });
}

function publicAlternativeId(caseFile: CaseFile, id: string) {
  const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" };
  return aliases[id] ?? `path-${id.replace(/^hypothesis-/, "")}`;
}

function alternativeReadySave(caseFile: CaseFile): SaveEnvelope {
  const canonical = createCanonicalSave(caseFile);
  const alternative = caseFile.solutionCertificate.alternativeHypothesisIds[0];
  const commands = canonical.commands
    .filter((command) => command.type !== "submit_theory" && command.type !== "request_proof_replay")
    .map((command): GameCommand => command.type === "set_theory_hypothesis"
      ? { ...command, hypothesisId: publicAlternativeId(caseFile, alternative) }
      : command);
  return { ...canonical, commands, completed: false, updatedAt: new Date(0).toISOString() };
}

async function ambiguousPhrase(entry: ReleaseCaseEntry) {
  const explicit = aliasByCase.get(entry.id)?.ambiguousPhrases?.[0]?.text;
  if (explicit) return explicit;
  const corpus = await loadQuestionCorpus(entry);
  return corpus.find((item) => item.expectedStatus === "ambiguous")?.rawQuestion;
}

async function switchMobilePanel(page: Page, index: number) {
  const nav = page.locator('nav[aria-label="调查区域"]').last();
  if (await nav.isVisible().catch(() => false)) {
    const button = nav.locator("button").nth(index);
    if (await button.isEnabled().catch(() => false)) await button.click();
  }
}

async function ask(page: Page, text: string, mobile: boolean) {
  if (mobile) await switchMobilePanel(page, 1);
  const beforeTranscript = await page.locator('main [aria-label="主持问答记录，可滚动"] article').count();
  const beforeStatus = (await page.locator('main [role="status"]').allTextContents()).join("\u241e");
  const input = page.locator('input[name="investigation-question"]:visible');
  await input.fill(text);
  await input.press("Enter");
  // Worker commands are asynchronous. A fixed sleep is flaky in WebKit and
  // can let the next query overwrite the previous one before its projection
  // arrives. Wait for an observable projection change instead.
  await page.waitForFunction(({ before, beforeStatus }) => {
    const transcript = document.querySelectorAll('main [aria-label="主持问答记录，可滚动"] article').length;
    const chooser = Boolean(document.querySelector('[aria-label="确认问题解释"]'));
    const statusText = Array.from(document.querySelectorAll('main [role="status"]')).map((node) => node.textContent ?? "").join("\u241e");
    return transcript > before || chooser || statusText !== beforeStatus;
  }, { before: beforeTranscript, beforeStatus }, { timeout: 5_000 }).catch(() => undefined);
  await page.waitForFunction(({ before }) =>
    document.querySelectorAll("[data-transcript-entry]").length > before ||
    Boolean(document.querySelector('[aria-label="确认问题解释"]')),
  { before: beforeTranscript }, { timeout: 3_000 }).catch(() => undefined);
}

async function majorActionCount(page: Page) {
  return page.locator([
    'main input[name="investigation-question"]:visible',
    'main [class*="locationStrip"] button:visible',
    'main [class*="locations"] button:visible',
    'main [class*="quickQuestions"] button:visible',
    'main [class*="prompts"] button:visible',
    'main [class*="stageCue"] button:visible',
  ].join(",")).count();
}

async function runRouteSmoke(name: string, type: BrowserType) {
  const browser = await type.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors: string[] = [];
  let unknown = false;
  page.on("console", (message) => { if (message.type() === "error" && !unknown) errors.push(message.text()); });
  const home = await visit(page, "/");
  const favicon = await page.request.get(`${base}/favicon.ico`);
  const routes = [];
  for (const entry of entries) {
    const response = await visit(page, `/case/${entry.id}/`);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const title = await page.locator("main h1:visible").first().textContent().catch(() => "");
    routes.push({ caseId: entry.id, status: response?.status(), overflow, title, passed: response?.status() === 200 && overflow <= 1 && Boolean(title) });
  }
  unknown = true;
  const unknownResponse = await visit(page, "/case/not-a-real-case/");
  unknown = false;
  await context.close();
  await browser.close();
  return { browser: name, routes, homeStatus: home?.status(), faviconStatus: favicon.status(), unknownStatus: unknownResponse?.status(), consoleErrors: errors, passed: home?.status() === 200 && favicon.status() === 200 && unknownResponse?.status() === 404 && errors.length === 0 && routes.every((route) => route.passed) };
}

async function runGoldenFlow(browserName: string, type: BrowserType, mobile: boolean) {
  const browser = await type.launch();
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("black-soup-settings", JSON.stringify({ muted: true, ambient: false, reducedMotion: true, highContrast: false, effectsVolume: 0, ambientVolume: 0 })));
  const traces = [];
  for (const caseId of GOLDEN_CASE_IDS) {
    const source = byId.get(caseId);
    if (!source) throw new Error(`${caseId} missing from v1.5`);
    const { entry, caseFile } = source;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await visit(page, `/case/${caseId}/`);
    const prefix = `${browserName}-${mobile ? "mobile" : "desktop"}-${caseId}`;
    const capture = browserName === "chromium";
    if (capture) await page.screenshot({ path: resolve(outputDir, `${prefix}-opening.png`), fullPage: true });
    const openingMajorActions = await majorActionCount(page);
    const firstQuery = caseFile.questionSemantics[0]?.examplePhrases?.[0] ?? caseFile.questionSemantics[0]?.id ?? "请确认第一条记录";
    await ask(page, firstQuery, mobile);
    const firstAnswerVisible = await page.locator("[data-transcript-entry]").count() > 0;
    if (capture) await page.screenshot({ path: resolve(outputDir, `${prefix}-first-answer.png`), fullPage: true });
    if (mobile) await switchMobilePanel(page, 0);
    const shelf = page.locator('[aria-label="证据架"]').first();
    await shelf.waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    const shelfVisible = await shelf.isVisible().catch(() => false);
    let evidenceDialog = false;
    if (shelfVisible) {
      await shelf.getByRole("button").first().click();
      const dialog = page.locator('[role="dialog"]').first();
      await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
      evidenceDialog = await dialog.isVisible().catch(() => false);
      if (capture) await page.screenshot({ path: resolve(outputDir, `${prefix}-evidence-focus.png`), fullPage: true });
      await page.getByRole("button", { name: "关闭证据详情" }).click();
    }
    const secondQuery = caseFile.questionSemantics[1]?.examplePhrases?.[0] ?? firstQuery;
    await ask(page, secondQuery, mobile);
    const ambiguity = await ambiguousPhrase(entry);
    let ambiguityRecovered = false;
    if (ambiguity) {
      await ask(page, ambiguity, mobile);
      const chooser = page.locator('[aria-label="确认问题解释"]').first();
      await chooser.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
      if (await chooser.count() > 0) {
        await chooser.getByRole("button").first().click({ force: true });
        ambiguityRecovered = true;
      }
    }
    if (mobile) await switchMobilePanel(page, 2);
    const theorySurface = page.locator('main [data-reasoning-surface]').first();
    await theorySurface.waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
    if (await theorySurface.count() === 0) {
      const thirdQuery = caseFile.questionSemantics[2]?.examplePhrases?.[0] ?? secondQuery;
      await ask(page, thirdQuery, mobile);
      await theorySurface.waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    }
    const theoryVisible = await theorySurface.count() > 0 || await page.getByRole("button", { name: /提交.*证明|提交证明/ }).count() > 0;
    if (capture) await page.screenshot({ path: resolve(outputDir, `${prefix}-theory.png`), fullPage: true });

    await injectSave(page, caseId, alternativeReadySave(caseFile));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), { timeout: 20_000 });
    if (mobile) await switchMobilePanel(page, 2);
    const submit = page.getByRole("button", { name: /提交.*证明|提交证明/ }).last();
    await submit.waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    const submitEnabled = await submit.count() > 0;
    if (await submit.isEnabled().catch(() => false)) await submit.click();
    await page.waitForTimeout(40);
    const wrongTheoryRejected = !await page.getByText(/CASE CLOSED|证据链闭合/).count() && await page.getByText(/缺|排除|不足|矛盾|不成立|证据/).count() > 0;
    if (capture) await page.screenshot({ path: resolve(outputDir, `${prefix}-wrong-theory.png`), fullPage: true });

    const canonical = createCanonicalSave(caseFile);
    await injectSave(page, caseId, canonical);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), { timeout: 20_000 });
    if (mobile) await switchMobilePanel(page, 2);
    const solved = await page.getByText(/CASE CLOSED|证据链闭合|CLOSED/).count() > 0;
    const replay = await page.getByText(/证明：|证据：|PROOF REPLAY|回放/).count() > 0;
    const challenges = await page.getByRole("button", { name: /限定|最小证据|无快捷/ }).count();
    if (capture) await page.screenshot({ path: resolve(outputDir, `${prefix}-solved.png`), fullPage: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), { timeout: 20_000 });
    if (mobile) await switchMobilePanel(page, 2);
    const refreshRestored = await page.getByText(/CASE CLOSED|证据链闭合|CLOSED/).count() > 0;
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const axe = browserName === "chromium" ? await new AxeBuilder({ page }).analyze() : undefined;
    const axeIssues = axe?.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.flatMap((node) => node.target.map(String)) })) ?? [];
    const axeBlockers = axeIssues.length;
    const passed = openingMajorActions <= 5 && firstAnswerVisible && shelfVisible && evidenceDialog && theoryVisible && ambiguityRecovered && submitEnabled && wrongTheoryRejected && solved && replay && challenges >= 3 && refreshRestored && overflow <= 1 && axeBlockers === 0 && errors.length === 0;
    traces.push({ caseId, viewport: mobile ? "390x844" : "1440x900", openingMajorActions, firstEffectiveOperationCount: 1, firstAnswerVisible, shelfVisible, evidenceDialog, ambiguityRecovered, theoryVisible, submitEnabled, wrongTheoryRejected, solved, replay, challengeCount: challenges, refreshRestored, overflow, axeSeriousCritical: axeBlockers, axeIssues, consoleErrors: errors, passed });
    await page.close();
  }
  await context.close();
  await browser.close();
  return { browser: browserName, viewport: mobile ? "390x844" : "1440x900", traces, passed: traces.every((trace) => trace.passed) };
}

async function runOfflineRecovery() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" });
  const page = await context.newPage();
  await visit(page, "/case/c01-cold-room-knock/");
  const ready = await Promise.race([page.evaluate(() => navigator.serviceWorker.ready.then((registration) => Boolean(registration.active))), new Promise<boolean>((done) => setTimeout(() => done(false), 20_000))]);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload({ waitUntil: "domcontentloaded" });
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  let rendered = false;
  try { await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 }); await page.locator("main h1:visible").first().waitFor({ timeout: 20_000 }); rendered = await page.locator("main h1:visible").count() > 0; } catch { rendered = false; }
  await context.setOffline(false);
  await context.close();
  await browser.close();
  return { ready, controlled, offlineReloadRendered: rendered, passed: ready && controlled && rendered };
}

try {
  const browsers = [];
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const) browsers.push(await runRouteSmoke(name, type));
  const goldenFlows = [];
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const) {
    goldenFlows.push(await runGoldenFlow(name, type, false));
    goldenFlows.push(await runGoldenFlow(name, type, true));
  }
  const offlineRecovery = await runOfflineRecovery();
  const screenshots = existsSync(outputDir) ? (await import("node:fs")).readdirSync(outputDir).filter((name) => name.endsWith(".png")) : [];
  const report = {
    reportVersion: "1.5", generatedAt: new Date().toISOString(), releaseProfile: "v1.5-internal-rc", status: "internal-rc / human-evaluation-pending", humanParticipants: 0,
    caseCount: entries.length, goldenCaseCount: GOLDEN_CASE_IDS.length, engines: ["chromium", "firefox", "webkit"], viewports: ["1440x900", "390x844"],
    routeSmoke: browsers, goldenFlows, offlineRecovery, screenshots, screenshotCount: screenshots.length,
    passed: browsers.every((item) => item.passed) && goldenFlows.every((item) => item.passed) && offlineRecovery.passed,
    qualification: "Browser automation validates deterministic UI paths, responsive layout, accessibility, persistence and offline recovery. It does not establish human comprehension, fun, pacing, aesthetic preference or market fit.",
  };
  writeFileSync(resolve(root, "docs/v1.5-browser-matrix.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ passed: report.passed, routeCount: entries.length * 3, goldenFlowCount: GOLDEN_CASE_IDS.length * 6, screenshots: screenshots.length, offline: offlineRecovery.passed }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
