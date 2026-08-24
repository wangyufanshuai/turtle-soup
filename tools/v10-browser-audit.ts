import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const outputDir = resolve(root, "output/playwright/v10");
const reportPath = resolve(root, "docs/v1.0-browser-matrix.json");
const { entries } = loadReleaseContent(root, "v1.0-internal-rc");
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

function pathFor(url: string) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const candidate = resolve(outDir, `.${pathname}`);
  if (!candidate.startsWith(outDir)) return undefined;
  try { return statSync(candidate).isDirectory() ? resolve(candidate, "index.html") : candidate; } catch { return pathname.endsWith("/") ? resolve(candidate, "index.html") : candidate; }
}

const server = createServer((request, response) => {
  const path = pathFor(request.url ?? "/");
  if (!path) { response.writeHead(403).end("Forbidden"); return; }
  try { const body = readFileSync(path); response.writeHead(200, { "content-type": mime[extname(path)] ?? "application/octet-stream", "cache-control": "no-cache" }); response.end(body); }
  catch { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Not found"); }
});
await new Promise<void>((resolveReady) => server.listen(4178, "127.0.0.1", resolveReady));
mkdirSync(outputDir, { recursive: true });
const base = "http://127.0.0.1:4178";

async function waitForCase(page: Page, id: string) {
  const response = await page.goto(`${base}/case/${id}/`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`${id}: route status ${response?.status()}`);
  await page.locator("main").waitFor();
  if (await page.getByText("档案无法打开").count()) throw new Error(`${id}: worker failed to load`);
  await page.locator('input[name="investigation-question"]').waitFor({ state: "attached" });
}

async function desktopAudit(name: string, browserType: BrowserType) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(base, { waitUntil: "networkidle" });
  const homeLinks = await page.locator('a[href*="/case/"]').count();
  const seasonHeadings = await page.locator("section h2").count();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const seriousAxe = axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  if (name === "chromium") await page.screenshot({ path: resolve(outputDir, "home-desktop.png"), fullPage: true });
  const cases = [];
  for (const [index, entry] of entries.entries()) {
    await waitForCase(page, entry.id);
    const input = page.locator('input[name="investigation-question"]');
    const prompt = page.locator("button").filter({ hasText: /是否|吗|？/ }).first();
    if (await prompt.count()) await prompt.click();
    else { await input.fill("请核对现场记录"); await input.press("Enter"); }
    await page.waitForTimeout(30);
    const secondSeason = entry.seasonId === "season-2";
    const boardCount = await page.locator('[aria-label$="推理板"]').count();
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const errorText = await page.getByText("档案无法打开").count();
    if (name === "chromium" && secondSeason) await page.screenshot({ path: resolve(outputDir, `${entry.id}-desktop.png`), fullPage: true });
    cases.push({ id: entry.id, secondSeason, boardCount, overflow, errorText, passed: errorText === 0 && overflow <= 1 && (!secondSeason || boardCount === 1) });
    if ((index + 1) % 8 === 0) await page.goto(base, { waitUntil: "domcontentloaded" });
  }
  const unknown = await page.goto(`${base}/case/not-a-real-case/`, { waitUntil: "domcontentloaded" });
  const unknownFailedClosed = unknown?.status() === 404 && (await page.getByText("冷藏室的敲门声").count()) === 0;
  await browser.close();
  return { name, homeLinks, seasonHeadings, seriousAxe: seriousAxe.map((item) => item.id), consoleErrors, unknownFailedClosed, cases, passed: homeLinks === 24 && seasonHeadings >= 2 && seriousAxe.length === 0 && unknownFailedClosed && cases.every((item) => item.passed) };
}

async function mobileAudit() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const results = [];
  for (const entry of entries.filter((item) => item.seasonId === "season-2")) {
    await waitForCase(page, entry.id);
    const nav = page.getByRole("navigation", { name: "调查区域" });
    const buttons = nav.getByRole("button");
    await buttons.last().click();
    const boardVisible = await page.locator('[aria-label$="推理板"]').isVisible();
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    results.push({ id: entry.id, boardVisible, overflow, passed: boardVisible && overflow <= 1 });
  }
  await page.goto(base, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await context.setOffline(true);
  let offlineReady = true;
  try { await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }); offlineReady = (await page.locator("main").count()) === 1; } catch { offlineReady = false; }
  await context.setOffline(false);
  await page.screenshot({ path: resolve(outputDir, "home-mobile.png"), fullPage: true });
  await browser.close();
  return { viewport: "390x844", cases: results, offlineReady, passed: offlineReady && results.every((item) => item.passed) };
}

try {
  const desktop = [];
  for (const [name, browserType] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const) desktop.push(await desktopAudit(name, browserType));
  const mobile = await mobileAudit();
  const report = { reportVersion: "1.0", generatedAt: new Date().toISOString(), releaseProfile: "v1.0-internal-rc", humanParticipants: 0, cases: entries.length, desktop, mobile, screenshots: entries.filter((item) => item.seasonId === "season-2").length + 2, passed: desktop.every((item) => item.passed) && mobile.passed };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ reportPath, passed: report.passed, desktop: desktop.map((item) => ({ name: item.name, passed: item.passed, routes: item.cases.length })), mobile: { passed: mobile.passed, routes: mobile.cases.length }, screenshots: report.screenshots }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
}
