import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { CaseFile } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const screenshotDir = resolve(root, "output/playwright/v09/states");
const reportPath = resolve(root, "docs/v0.9-visual-regression.json");
const port = Number(process.env.TURTLE_SOUP_VISUAL_PORT ?? 4181);
const origin = `http://127.0.0.1:${port}`;
mkdirSync(screenshotDir, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(root, "content/zh/cases/manifest.v0.6.json"), "utf8")) as { cases: Array<{ id: string; file: string }> };
const cases = manifest.cases.map((entry) => ({ ...entry, data: JSON.parse(readFileSync(resolve(root, "content/zh/cases", entry.file), "utf8")) as CaseFile }));
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

function statSafe(path: string) {
  try { return statSync(path).isFile(); } catch { return false; }
}

function startServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", origin).pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const path = resolve(outDir, relativePath);
    if (!path.toLowerCase().startsWith(outDir.toLowerCase()) || !statSafe(path)) { response.writeHead(404); response.end("not found"); return; }
    response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
    response.end(readFileSync(path));
  });
  return new Promise<typeof server>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });
}

async function waitForGame(page: Page) {
  await page.locator("main h1:visible").first().waitFor({ timeout: 8_000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), undefined, { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(120);
}

async function injectSave(page: Page, key: string, save: unknown) {
  await page.evaluate(async ({ key, save }) => {
    const database = await new Promise<IDBDatabase>((resolvePromise, reject) => {
      const request = indexedDB.open("turtle-soup", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("case-saves")) request.result.createObjectStore("case-saves"); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolvePromise(request.result);
    });
    await new Promise<void>((resolvePromise, reject) => {
      const transaction = database.transaction("case-saves", "readwrite");
      transaction.objectStore("case-saves").put(save, key);
      transaction.oncomplete = () => resolvePromise();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { key, save });
}

async function capture(page: Page, caseId: string, state: string, viewport: string) {
  const path = resolve(screenshotDir, `${caseId}-${state}-${viewport}.png`);
  const bytes = await page.screenshot({ path, animations: "disabled" });
  return { state, viewport, path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function visualState(context: BrowserContext, caseFile: CaseFile) {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(`${origin}/case/${caseFile.id}/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const screenshots = [await capture(page, caseFile.id, "opening", "1440x900")];
  const opening = await page.evaluate(() => {
    const scene = document.querySelector<HTMLImageElement>('main img[src*="scene-"]');
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, sceneLoaded: Boolean(scene?.complete && scene.naturalWidth > 0), title: document.querySelector("main h1")?.textContent?.trim() ?? "" };
  });

  const prompt = page.locator('[class*="quickQuestions"] button, [class*="prompts"] button').first();
  await prompt.click();
  await page.waitForFunction(() => document.querySelectorAll('[class*="transcript"] article, [class*="exchange"]').length > 0);
  screenshots.push(await capture(page, caseFile.id, "question", "1440x900"));

  const inspect = page.getByRole("button", { name: "检查证据" }).first();
  let evidenceExamined = false;
  if (await inspect.count()) { await inspect.click(); evidenceExamined = true; await page.waitForTimeout(80); }
  const link = page.getByRole("button", { name: /接入证明|关联当前理论/ }).first();
  if (await link.count()) await link.click();
  screenshots.push(await capture(page, caseFile.id, "evidence", "1440x900"));

  const hypothesis = page.locator('select[id*="hypothesis"]').first();
  if (await hypothesis.count()) {
    const options = await hypothesis.locator("option").count();
    if (options > 1) await hypothesis.selectOption({ index: options - 1 });
  }
  const addEvent = page.locator('[class*="eventBank"] button:not(:disabled), [class*="eventPalette"] button:not(:disabled)').first();
  if (await addEvent.count()) await addEvent.click();
  const motive = page.locator("label").filter({ hasText: "驱动条件" }).locator("select").first();
  if (await motive.count()) {
    const options = await motive.locator("option").count();
    if (options > 1) await motive.selectOption({ index: 1 });
  }
  const submit = page.getByRole("button", { name: /提交.*证明/ }).first();
  await page.waitForTimeout(160);
  const wrongTheorySubmitted = await submit.isEnabled().catch(() => false);
  if (wrongTheorySubmitted) { await submit.click(); await page.waitForTimeout(120); }
  screenshots.push(await capture(page, caseFile.id, "wrong-theory", "1440x900"));

  await injectSave(page, caseFile.id, createCanonicalSave(caseFile));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const closed = await page.getByText(/CASE CLOSED|CLOSED/).count() > 0;
  const replayBeats = await page.getByText(/证明：|证据：/).count();
  const replayPanel = page.getByText(/PROOF REPLAY READY|证据链闭合/).last();
  if (await replayPanel.count()) await replayPanel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  screenshots.push(await capture(page, caseFile.id, "replay", "1440x900"));
  await page.close();

  const parentBrowser = context.browser();
  if (!parentBrowser) throw new Error("visual context has no browser");
  const mobileContext = await parentBrowser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${origin}/case/${caseFile.id}/`, { waitUntil: "domcontentloaded" });
  await waitForGame(mobilePage);
  const mobileShot = await capture(mobilePage, caseFile.id, "opening", "390x844");
  const mobile = await mobilePage.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    visibleMain: Boolean(document.querySelector("main")),
    visibleNavigationButtons: [...document.querySelectorAll("nav button")].filter((button) => button.getBoundingClientRect().width > 0).length,
  }));
  await mobileContext.close();
  screenshots.push(mobileShot);

  const distinctDesktopStates = new Set(screenshots.filter((item) => item.viewport === "1440x900").map((item) => item.sha256)).size;
  const passed = opening.overflow <= 1 && opening.sceneLoaded && evidenceExamined && wrongTheorySubmitted && closed && replayBeats >= 5 && mobile.overflow <= 1 && mobile.visibleMain && mobile.visibleNavigationButtons >= 3 && distinctDesktopStates === 5 && consoleErrors.length === 0;
  return { caseId: caseFile.id, opening, evidenceExamined, wrongTheorySubmitted, closed, replayBeats, mobile, distinctDesktopStates, screenshots: screenshots.map(({ path, ...item }) => ({ ...item, path: path.replace(root, "").replaceAll("\\", "/") })), consoleErrors, passed };
}

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const results = [];
let home: unknown = {};
try {
  const homeContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const homePage = await homeContext.newPage();
  await homePage.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForGame(homePage);
  const desktop = await capture(homePage, "home", "opening", "1440x900");
  await homePage.setViewportSize({ width: 390, height: 844 });
  const mobile = await capture(homePage, "home", "opening", "390x844");
  const overflow = await homePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  home = { desktop: { ...desktop, path: desktop.path.replace(root, "").replaceAll("\\", "/") }, mobile: { ...mobile, path: mobile.path.replace(root, "").replaceAll("\\", "/") }, mobileOverflow: overflow, passed: overflow <= 1 && desktop.sha256 !== mobile.sha256 };
  await homeContext.close();
  for (const entry of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    try { results.push(await visualState(context, entry.data)); }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

const openingHashes = results.map((result) => result.screenshots.find((item) => item.state === "opening" && item.viewport === "1440x900")?.sha256).filter(Boolean);
const failures = [
  ...results.filter((result) => !result.passed).map((result) => `${result.caseId} visual state flow failed`),
  ...(new Set(openingHashes).size === 12 ? [] : [`only ${new Set(openingHashes).size}/12 desktop openings are visually distinct`]),
  ...((home as { passed?: boolean }).passed ? [] : ["home responsive baseline failed"]),
];
const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "representative-state-visual-regression",
  humanParticipants: 0,
  humanFunGate: "pending",
  expectedScreenshots: 74,
  capturedScreenshots: 2 + results.reduce((sum, result) => sum + result.screenshots.length, 0),
  distinctCaseOpenings: new Set(openingHashes).size,
  home,
  results,
  failures,
  passed: failures.length === 0,
  qualification: "Screenshot and DOM checks validate visual state reachability and layout integrity, not human aesthetic preference or fun.",
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, captured: report.capturedScreenshots, distinctCaseOpenings: report.distinctCaseOpenings, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
