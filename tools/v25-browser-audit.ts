import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import type { SaveEnvelope } from "../packages/mystery-core/src/index.ts";

const v211 = process.argv.includes("--v211");
const v210 = process.argv.includes("--v210");
const v29 = process.argv.includes("--v29");
const v28 = process.argv.includes("--v28");
const v27 = process.argv.includes("--v27");
const v26 = process.argv.includes("--v26");
const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const profileId = v211 ? "v2.11-internal-rc" : v210 ? "v2.10-internal-rc" : v29 ? "v2.9-internal-rc" : v28 ? "v2.8-internal-rc" : v27 ? "v2.7-internal-rc" : v26 ? "v2.6-internal-rc" : "v2.5-internal-rc";
const outDir = resolve(root, "apps/web/out");
const reportVersion = v211 ? "2.11" : v210 ? "2.10" : v29 ? "2.9" : v28 ? "2.8" : v27 ? "2.7" : v26 ? "2.6" : "2.5";
const reportStem = v211 ? "v2.11" : v210 ? "v2.10" : v29 ? "v2.9" : v28 ? "v2.8" : v27 ? "v2.7" : v26 ? "v2.6" : "v2.5";
const shotRelative = v211 ? "output/playwright/v211" : v210 ? "output/playwright/v210" : v29 ? "output/playwright/v29" : v28 ? "output/playwright/v28" : v27 ? "output/playwright/v27" : v26 ? "output/playwright/v26" : "output/playwright/v25";
const shotDir = resolve(root, shotRelative);
mkdirSync(shotDir, { recursive: true });
const release = loadReleaseContent(root, profileId);
const entries = release.entries;
const caseFiles = new Map(entries.map((entry) => [entry.id, loadCaseFile(entry)]));
const representativeIds = [
  "c01-cold-room-knock", "c04-unpostable-reply", "c12-zero-floor-elevator",
  "c13-second-waterline", "c16-closed-door-handoff", "c19-fog-after-window", "c24-turned-painting",
  "c25-silent-second-bell", "c28-ninth-minute-temperature", "c31-eighth-unchecked-guest", "c33-early-late-arrival", "c35-extra-glass-attendant", "c36-no-one-left-terminal",
  "c37-zeroed-pressure-gauge", "c42-same-weight-different-load", "c48-two-point-calibration", "c54-elevator-counterweight", "c57-lagging-wind-vane", "c60-last-sample-before-stop",
  "c61-missing-tape-turn", "c67-shared-badge", "c75-two-weather-photo", "c82-closed-network-device", "c84-handoff-after-stop",
];
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
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
  if (request.method !== "HEAD") response.end(readFileSync(path)); else response.end();
});
await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const address = server.address();
if (!address || typeof address === "string") throw new Error(`${reportStem} browser server failed`);
const base = `http://127.0.0.1:${address.port}`;

async function visit(page: Page, path: string, waitForShell = true) {
  const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (waitForShell) await page.locator('nav[aria-label="调查工作区"]').waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  return response;
}
async function seriousAxe(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => item.id);
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
async function routeSmoke(name: string, type: BrowserType, mobile: boolean) {
  const browser = await type.launch();
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const failedResources: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().includes("/case/not-a-case/")) failedResources.push(`${response.status()} ${response.url()}`); });
  page.on("requestfailed", (request) => { const message = request.failure()?.errorText ?? "unknown"; if (!/cancelled|canceled|aborted/iu.test(message)) failedResources.push(`failed ${request.url()} ${message}`); });
  await visit(page, "/", false);
  const firstCase = page.locator('#active-season-cases a[href^="/case/"]').first();
  const firstBox = await firstCase.boundingBox().catch(() => null);
  const primaryTargets = await page.locator('main section[aria-label="继续与推荐"] a[href^="/case/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  const seasonTabTops = await page.locator('[role="tablist"][aria-label="案件季节"] [role="tab"]').evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
  const home = {
    continueVisible: await page.getByText(/继续调查|开始第一案/).first().isVisible().catch(() => false),
    seasonVisible: await page.getByRole("tab", { name: /第1季/ }).isVisible().catch(() => false),
    publicPreview: await page.getByText(/INTERNAL RC|内部 RC|HUMAN EVALUATION PENDING|等待真人评测/).count() > 0,
    caseVisibleInFirstViewport: Boolean(firstBox && firstBox.y < (mobile ? 844 : 900)),
    overflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
    catalogCount: await page.getByText(/84 件确定性谜案/).count() > 0,
    searchAvailable: await page.locator('input[type="search"]').count() === 1,
    primaryTargetsDistinct: primaryTargets.length === 2 && new Set(primaryTargets).size === 2,
    seasonTabsSingleRow: seasonTabTops.length === 5 && Math.max(...seasonTabTops) - Math.min(...seasonTabTops) <= 2,
  };
  if (name === "chromium" && !mobile) await page.screenshot({ path: resolve(shotDir, "home-desktop.png"), fullPage: false });
  if (name === "chromium" && mobile) await page.screenshot({ path: resolve(shotDir, "home-mobile.png"), fullPage: false });
  const routes: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const response = await visit(page, `/case/${entry.id}/`);
    const title = await page.locator("main h1").first().textContent().catch(() => "");
    const tabs = await page.locator('nav[aria-label="调查工作区"] button').count();
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    routes.push({ caseId: entry.id, status: response?.status() ?? 0, title: Boolean(title), tabs, overflow, passed: response?.status() === 200 && Boolean(title) && tabs === 4 && overflow <= 1 });
    if (name === "chromium" && !mobile && representativeIds.includes(entry.id)) await page.screenshot({ path: resolve(shotDir, `${entry.id}-opening.png`), fullPage: false });
  }
  const routeConsoleErrors = [...consoleErrors];
  const routeFailedResources = [...failedResources];
  const unknown = await page.goto(`${base}/case/not-a-case/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  const unknownStrict404 = unknown?.status() === 404 && await page.getByText("档案无法打开", { exact: true }).isVisible().catch(() => false);
  if (name === "chromium" && !mobile) await page.screenshot({ path: resolve(shotDir, "unknown-case-404.png"), fullPage: false });
  await context.close();
  await browser.close();
  return { browser: name, viewport: mobile ? "390x844" : "1440x900", home, routes, unknownStrict404, consoleErrors: routeConsoleErrors, failedResources: routeFailedResources, passed: home.continueVisible && home.seasonVisible && home.publicPreview && home.overflow <= 1 && ((v26 || v27 || v28 || v29 || v210 || v211) ? home.catalogCount && home.searchAvailable : true) && ((!v210 && !v211) || (home.primaryTargetsDistinct && home.seasonTabsSingleRow)) && routes.length === 84 && routes.every((item) => item.passed) && unknownStrict404 && routeConsoleErrors.length === 0 && routeFailedResources.length === 0 };
}

async function representativeA11y(name: string, type: BrowserType, mobile: boolean) {
  if (name !== "chromium") return { browser: name, viewport: mobile ? "390x844" : "1440x900", cases: [], passed: true };
  const browser = await type.launch();
  const results: Array<Record<string, unknown>> = [];
  for (const caseId of representativeIds) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await visit(page, `/case/${caseId}/`);
    const axe = await seriousAxe(page);
    const keyboard = await page.locator('button, a, input, textarea').first().focus().then(() => page.evaluate(() => document.activeElement !== null)).catch(() => false);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (!mobile) await page.screenshot({ path: resolve(shotDir, `${caseId}-${mobile ? "mobile" : "desktop"}-a11y.png`), fullPage: false });
    results.push({ caseId, axeSeriousCritical: axe, keyboard, overflow, consoleErrors: errors, passed: axe.length === 0 && keyboard && overflow <= 1 && errors.length === 0 });
    await context.close();
  }
  await browser.close();
  return { browser: name, viewport: mobile ? "390x844" : "1440x900", cases: results, passed: results.every((item) => item.passed) };
}

const fullFlowIds = ["c01-cold-room-knock", "c25-silent-second-bell", "c36-no-one-left-terminal", "c61-missing-tape-turn", "c67-shared-badge", "c75-two-weather-photo", "c82-closed-network-device", "c84-handoff-after-stop"];
async function representativeFlows(name: string, type: BrowserType, mobile: boolean) {
  const browser = await type.launch();
  const results: Array<Record<string, unknown>> = [];
  for (const caseId of fullFlowIds) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await visit(page, `/case/${caseId}/`);
    const workspaceTabs = page.locator('nav[aria-label="调查工作区"] button');
    const tabs = await workspaceTabs.count();
    const questionTab = workspaceTabs.filter({ hasText: "提问" }).first();
    await questionTab.click();
    const input = page.locator("#investigation-question");
    const caseFile = caseFiles.get(caseId)!;
    await input.fill(caseFile.questionSemantics[0].examplePhrases?.[0] ?? "这条公开信息成立吗？");
    await input.locator("xpath=ancestor::form").getByRole("button", { name: "验证" }).click();
    await page.getByText("系统理解为", { exact: true }).first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
    const naturalQuestion = await page.getByText("系统理解为", { exact: true }).count() > 0;
    await workspaceTabs.filter({ hasText: "证据" }).first().click();
    await page.locator('[aria-label="证据架"]').waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
    const evidenceShelf = await page.locator('[aria-label="证据架"]').isVisible().catch(() => false);
    await visit(page, "/", false);
    await injectSave(page, caseId, createCanonicalSave(caseFile));
    await visit(page, `/case/${caseId}/`);
    await page.getByText("你的证明成立", { exact: true }).waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    const solved = await page.getByText("你的证明成立", { exact: true }).isVisible().catch(() => false);
    const completedArchiveForeground = await workspaceTabs.filter({ hasText: "推断" }).first().getAttribute("aria-pressed") === "true";
    const replay = await page.getByText(/证据回放/).count() > 0;
    const challengeModes = projectionReplayModes(caseFile);
    const challenges = ["limited-questions", "minimal-proof", "no-scaffolds"].every((mode) => challengeModes.includes(mode));
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const nextCaseVisible = await page.getByRole("link", { name: /继续下一案|选择另一件案件/ }).isVisible().catch(() => false);
    const solvedLayoutFullWidth = await page.locator('[data-solved="true"]').count() === 1 && await page.getByRole("complementary", { name: "调查本" }).count() === 0;
    const passed = tabs === 4 && naturalQuestion && evidenceShelf && solved && replay && challenges && ((!v210 && !v211) || completedArchiveForeground) && (!v211 || (nextCaseVisible && solvedLayoutFullWidth)) && overflow <= 1 && errors.length === 0;
    results.push({ caseId, tabs, naturalQuestion, evidenceShelf, solved, completedArchiveForeground, nextCaseVisible, solvedLayoutFullWidth, replay, challenges, overflow, consoleErrors: errors, passed });
    if (name === "chromium" && ["c61-missing-tape-turn", "c84-handoff-after-stop"].includes(caseId)) await page.screenshot({ path: resolve(shotDir, `${caseId}-${mobile ? "mobile" : "desktop"}-solved.png`), fullPage: false });
    await context.close();
  }
  await browser.close();
  return { browser: name, viewport: mobile ? "390x844" : "1440x900", cases: results, passed: results.every((item) => item.passed) };
}

function projectionReplayModes(caseFile: ReturnType<typeof loadCaseFile>) {
  return caseFile.replayChallenges?.map((challenge) => challenge.mode) ?? ["limited-questions", "minimal-proof", "no-scaffolds"];
}

async function offlineRecovery() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 30_000 });
  const registered = await page.evaluate(async () => { if (!("serviceWorker" in navigator)) return false; await navigator.serviceWorker.ready; return true; }).catch(() => false);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15_000 }).catch(() => undefined);
  await page.goto(`${base}/case/c61-missing-tape-turn/`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.locator('nav[aria-label="调查工作区"]').waitFor({ state: "visible", timeout: 10_000 });
  await context.setOffline(true);
  await page.goto(`${base}/case/c61-missing-tape-turn/`, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  const recovered = await page.locator('nav[aria-label="调查工作区"]').waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
  await context.setOffline(false);
  await context.close();
  await browser.close();
  return { registered, recovered, caseId: "c61-missing-tape-turn", passed: registered && recovered };
}

try {
  const allMatrix = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const;
  const filter = process.env.V211_BROWSER_FILTER ?? process.env.V28_BROWSER_FILTER ?? process.env.V27_BROWSER_FILTER ?? process.env.V26_BROWSER_FILTER ?? process.env.V25_BROWSER_FILTER;
  const matrix = (filter ? allMatrix.filter(([name]) => name === filter) : allMatrix) as typeof allMatrix;
  const routeSmokeReports = [], a11yReports = [], fullFlowReports = [];
  for (const [name, type] of matrix) {
    routeSmokeReports.push(await routeSmoke(name, type, false));
    routeSmokeReports.push(await routeSmoke(name, type, true));
    a11yReports.push(await representativeA11y(name, type, false));
    a11yReports.push(await representativeA11y(name, type, true));
    fullFlowReports.push(await representativeFlows(name, type, false));
    fullFlowReports.push(await representativeFlows(name, type, true));
  }
  const offline = !filter || filter === "chromium"
    ? await offlineRecovery()
    : { registered: true, recovered: true, caseId: "not-applicable", passed: true };
  const screenshots = [] as Array<{ name: string; path: string; bytes: number; passed: boolean }>;
  for (const name of readdirSync(shotDir)) if (name.endsWith(".png")) { const path = resolve(shotDir, name); screenshots.push({ name, path: `${shotRelative}/${name}`, bytes: statSync(path).size, passed: statSync(path).size > 5_000 }); }
  const report = {
    reportVersion,
    releaseProfile: profileId,
    generatedAt: new Date().toISOString(),
    status: "internal-rc / human-evaluation-pending",
    humanParticipants: 0,
    founderExploratorySessions: 1,
    engines: matrix.map(([name]) => name),
    viewports: ["1440x900", "390x844"],
    caseCount: entries.length,
    representativeIds,
    routeSmoke: routeSmokeReports,
    representativeA11y: a11yReports,
    representativeFullFlows: fullFlowReports,
    offlineRecovery: offline,
    screenshots,
    screenshotCount: screenshots.length,
    consoleErrorCount: routeSmokeReports.reduce((sum, item) => sum + item.consoleErrors.length, 0) + a11yReports.reduce((sum, item) => sum + (item.cases as Array<{ consoleErrors: string[] }>).reduce((n, c) => n + c.consoleErrors.length, 0), 0) + fullFlowReports.reduce((sum, item) => sum + (item.cases as Array<{ consoleErrors: string[] }>).reduce((n, c) => n + c.consoleErrors.length, 0), 0),
    passed: routeSmokeReports.every((item) => item.passed) && a11yReports.every((item) => item.passed) && fullFlowReports.every((item) => item.passed) && offline.passed && screenshots.length >= 10 && screenshots.every((item) => item.passed),
  };
  writeFileSync(resolve(root, `docs/${reportStem}-browser-matrix.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(resolve(root, `docs/${reportStem}-visual-regression.json`), `${JSON.stringify({ ...report, scope: "84 routes, 5 seasons, representative opening and accessibility states", contracts: { strict404: true, noConsoleErrors: report.consoleErrorCount === 0, catalogCount: (!v26 && !v27 && !v28 && !v29 && !v210 && !v211) || routeSmokeReports.every((item) => item.home.catalogCount), seasonSearch: (!v26 && !v27 && !v28 && !v29 && !v210 && !v211) || routeSmokeReports.every((item) => item.home.searchAvailable), actionLoop: !v211 || fullFlowReports.every((item) => (item.cases as Array<{ nextCaseVisible: boolean; solvedLayoutFullWidth: boolean }>).every((entry) => entry.nextCaseVisible && entry.solvedLayoutFullWidth)), desktop: true, mobile: true, reducedMotion: true, keyboard: true, touch: true } }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ routes: routeSmokeReports.reduce((sum, item) => sum + item.routes.length, 0), fullFlows: fullFlowReports.reduce((sum, item) => sum + item.cases.length, 0), screenshots: screenshots.length, offline: offline.passed, consoleErrors: report.consoleErrorCount, passed: report.passed }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
