import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const outputDir = resolve(root, "output/playwright/v14");
mkdirSync(outputDir, { recursive: true });
const entries = loadReleaseContent(root, "v1.4-internal-rc").entries;
const representativeIds = ["c01-cold-room-knock", "c13-second-waterline", "c25-silent-second-bell", "c37-zeroed-pressure-gauge", "c48-two-point-calibration", "c60-last-sample-before-stop"];
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function staticPath(url: string) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const candidate = resolve(outDir, `.${pathname}`);
  if (!candidate.toLowerCase().startsWith(outDir.toLowerCase())) return undefined;
  try { if (statSync(candidate).isDirectory()) { const index = resolve(candidate, "index.html"); return existsSync(index) ? index : undefined; } return candidate; } catch { return undefined; }
}
const server = createServer((request, response) => {
  const path = staticPath(request.url ?? "/");
  if (!path) { const notFound = resolve(outDir, "404.html"); response.writeHead(404, { "content-type": "text/html; charset=utf-8" }); response.end(existsSync(notFound) ? readFileSync(notFound) : "Not found"); return; }
  response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" }); response.end(readFileSync(path));
});
await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const address = server.address(); if (!address || typeof address === "string") throw new Error("browser_audit_server_failed");
const base = `http://127.0.0.1:${address.port}`;
async function visit(page: Page, path: string) { const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 15000 }); await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), { timeout: 15000 }).catch(() => undefined); return response; }
async function runBrowser(name: string, type: BrowserType) {
  const browser = await type.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors: string[] = [];
  const expected404Errors: string[] = [];
  let checkingUnknown = false;
  page.on("console", (message) => { if (message.type() === "error") (checkingUnknown ? expected404Errors : errors).push(message.text()); });
  const home = await visit(page, "/");
  const favicon = await page.request.get(`${base}/favicon.ico`);
  const routes = [];
  for (const entry of entries) {
    const response = await visit(page, `/case/${entry.id}/`);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const title = await page.locator("main h1:visible").first().textContent().catch(() => "");
    routes.push({ caseId: entry.id, status: response?.status(), title, overflow, passed: response?.status() === 200 && Boolean(title) && overflow <= 1 });
  }
  checkingUnknown = true; const unknown = await visit(page, "/case/not-a-real-case/"); checkingUnknown = false;
  await visit(page, "/");
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) { window.scrollTo(0, y); await new Promise((resolve) => setTimeout(resolve, 35)); } window.scrollTo(0, 0); });
  await page.screenshot({ path: resolve(outputDir, `${name}-home-desktop.png`), fullPage: true });
  await context.close(); await browser.close();
  return { browser: name, homeStatus: home?.status(), faviconStatus: favicon.status(), unknownStatus: unknown?.status(), consoleErrors: errors, expected404ConsoleErrors: expected404Errors, routes, passed: home?.status() === 200 && favicon.status() === 200 && unknown?.status() === 404 && errors.length === 0 && routes.every((item) => item.passed) };
}
async function runRepresentatives() {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
  const accessibilitySettings = { muted: true, ambient: false, reducedMotion: true, highContrast: true, effectsVolume: 0, ambientVolume: 0 };
  await desktop.addInitScript((settings) => localStorage.setItem("black-soup-settings", JSON.stringify(settings)), accessibilitySettings);
  await mobile.addInitScript((settings) => localStorage.setItem("black-soup-settings", JSON.stringify(settings)), accessibilitySettings);
  const traces = [];
  for (const caseId of representativeIds) {
    const page = await desktop.newPage(); const errors: string[] = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await visit(page, `/case/${caseId}/`); const input = page.locator('input[name="investigation-question"]');
    if (await input.count()) { const phrase = await input.getAttribute("placeholder"); await input.fill(phrase ? "请确认这条记录是否成立" : "这条记录是真的吗？"); await input.press("Enter").catch(() => undefined); }
    const boardCount = await page.locator('[aria-label$="推理板"]').count(); const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await page.screenshot({ path: resolve(outputDir, `${caseId}-desktop.png`), fullPage: true });
    traces.push({ caseId, queryAttempted: await input.count() > 0, boardCount, overflow, consoleErrors: errors, passed: await input.count() > 0 && overflow <= 1 && errors.length === 0 }); await page.close();
  }
  const mobilePage = await mobile.newPage(); await visit(mobilePage, "/case/c60-last-sample-before-stop/"); const mobileOverflow = await mobilePage.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)); await mobilePage.screenshot({ path: resolve(outputDir, "c60-mobile.png"), fullPage: true }); const axe = await new AxeBuilder({ page: mobilePage }).analyze(); const blockers = axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical").length;
  await mobilePage.close(); await desktop.close(); await mobile.close(); await browser.close();
  return { representativeIds, traces, mobileOverflow, axeSeriousCritical: blockers, passed: traces.every((item) => item.passed) && mobileOverflow <= 1 && blockers === 0 };
}
async function runOfflineRecovery() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "allow" });
  const page = await context.newPage();
  const failedRequests: Array<{ url: string; error: string }> = [];
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "request-failed" }));
  await visit(page, "/case/c37-zeroed-pressure-gauge/");
  const serviceWorkerReady = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return false;
    return await Promise.race([navigator.serviceWorker.ready.then((registration) => Boolean(registration.active)), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20000))]);
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => undefined);
    await page.locator("main h1:visible").first().waitFor({ timeout: 10000 }).catch(() => undefined);
  }
  const serviceWorkerState = await page.evaluate(async () => ({ controlled: Boolean(navigator.serviceWorker?.controller), registrations: await navigator.serviceWorker?.getRegistrations().then((items) => items.map((registration) => ({ installing: registration.installing?.state ?? null, waiting: registration.waiting?.state ?? null, active: registration.active?.state ?? null }))).catch(() => []) }));
  const controlledBefore = serviceWorkerState.controlled;
  await context.setOffline(true);
  const offlineState = await page.evaluate(() => ({ online: navigator.onLine, title: document.querySelector("main h1")?.textContent ?? "" }));
  let reloadRendered = false; let offlineReloadError: string | undefined;
  try { await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 }); await page.locator("main h1:visible").first().waitFor({ timeout: 10000 }); reloadRendered = Boolean(await page.locator("main h1:visible").first().textContent()); } catch (error) { reloadRendered = false; offlineReloadError = error instanceof Error ? error.message : String(error); }
  const offlineBody = await page.locator("body").innerText().catch(() => "");
  await context.setOffline(false); await context.close(); await browser.close();
  return { caseId: "c37-zeroed-pressure-gauge", serviceWorkerReady, serviceWorkerControlled: controlledBefore, serviceWorkerRegistrations: serviceWorkerState.registrations.length, serviceWorkerStates: serviceWorkerState.registrations, offlineState, reloadRendered, offlineReloadError, offlineBody: offlineBody.slice(0, 500), failedRequests, passed: serviceWorkerReady && controlledBefore && offlineState.online === false && Boolean(offlineState.title) && reloadRendered };
}
try {
  const browsers = []; for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const) browsers.push(await runBrowser(name, type));
  const representatives = await runRepresentatives();
  const offlineRecovery = await runOfflineRecovery();
  const screenshotNames = ["chromium-home-desktop.png", "firefox-home-desktop.png", "webkit-home-desktop.png", "c60-mobile.png", ...representativeIds.map((id) => `${id}-desktop.png`)];
  const report = { reportVersion: "1.4", generatedAt: new Date().toISOString(), releaseProfile: "v1.4-internal-rc", status: "internal-rc / human-evaluation-pending", humanParticipants: 0, engines: ["chromium", "firefox", "webkit"], viewports: ["1440x900", "390x844"], caseCount: entries.length, representativeCount: representativeIds.length, browsers, representatives, offlineRecovery, screenshots: screenshotNames, passed: browsers.every((item) => item.passed) && representatives.passed && offlineRecovery.passed, qualification: "Automation validates route, rendering, responsive, accessibility and a local offline recovery lower bound. Human comprehension, fun, pacing and market fit remain pending." };
  writeFileSync(resolve(root, "docs/v1.4-browser-matrix.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ passed: report.passed, routeCount: entries.length * 3, representativeCount: representativeIds.length }, null, 2)); if (!report.passed) process.exitCode = 1;
} finally { await new Promise<void>((done) => server.close(() => done())); }
