import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, devices, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page } from "playwright";
import type { CaseFile, SaveEnvelope } from "../packages/mystery-core/src/index.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { getSoundscapeProfile } from "../apps/web/lib/audio-profiles.ts";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const reportPath = resolve(root, "docs/v0.9-browser-matrix.json");
const screenshotDir = resolve(root, "output/playwright/v09");
const port = Number(process.env.TURTLE_SOUP_AUDIT_PORT ?? 4180);
const origin = `http://127.0.0.1:${port}`;
mkdirSync(screenshotDir, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(root, "content/zh/cases/manifest.v0.6.json"), "utf8")) as { cases: Array<{ id: string; file: string }> };
const cases = manifest.cases.map((entry) => ({ ...entry, data: JSON.parse(readFileSync(resolve(root, "content/zh/cases", entry.file), "utf8")) as CaseFile }));
const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
];

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

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

function statSafe(path: string) {
  try { return statSync(path).isFile(); } catch { return false; }
}

async function waitForGame(page: Page) {
  await page.locator("main h1:visible").first().waitFor({ timeout: 8_000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"), undefined, { timeout: 8_000 }).catch(() => undefined);
}

async function stopServer(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
}

async function injectSave(page: Page, key: string, save: unknown) {
  await page.evaluate(async ({ key, save }) => {
    const database = await new Promise<IDBDatabase>((resolvePromise, reject) => {
      const request = indexedDB.open("turtle-soup", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("case-saves")) request.result.createObjectStore("case-saves");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolvePromise(request.result);
    });
    await new Promise<void>((resolvePromise, reject) => {
      const transaction = database.transaction("case-saves", "readwrite");
      const request = transaction.objectStore("case-saves").put(save, key);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolvePromise();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { key, save });
}

async function addMetricsObserver(page: Page) {
  await page.addInitScript(() => {
    const metrics = { cls: 0, lcp: 0, longTasks: [] as number[] };
    Object.defineProperty(window, "__goldMasterMetrics", { value: metrics, configurable: true });
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.lcp = Math.max(metrics.lcp, entry.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* unsupported */ }
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries() as PerformanceEntry[]) if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) metrics.cls += (entry as PerformanceEntry & { value?: number }).value ?? 0; }).observe({ type: "layout-shift", buffered: true }); } catch { /* unsupported */ }
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true }); } catch { /* unsupported */ }
  });
}

async function routeMatrix(browserName: string, browser: Browser, failures: string[]) {
  const results: Array<Record<string, unknown>> = [];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "allow" });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    for (const route of ["/", ...cases.map((entry) => `/case/${entry.id}/`)]) {
      const beforeErrors = consoleErrors.length;
      const started = Date.now();
      let response;
      let navigationError = "";
      try {
        response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await waitForGame(page);
      } catch (error) {
        navigationError = error instanceof Error ? error.message.split("\n")[0] : String(error);
      }
      const layout = await page.evaluate(() => ({
        title: [...document.querySelectorAll("main h1")].find((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })?.textContent?.trim() ?? "",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        main: Boolean(document.querySelector("main")),
      }));
      const newErrors = consoleErrors.slice(beforeErrors);
      const passed = !navigationError && response?.ok() === true && layout.main && layout.title.length > 0 && layout.overflow <= 1 && newErrors.length === 0;
      if (!passed) failures.push(`${browserName} ${viewport.name} ${route}: status=${response?.status()} overflow=${layout.overflow} navigation=${navigationError} errors=${newErrors.join(" | ")}`);
      results.push({ browser: browserName, viewport: viewport.name, route, status: response?.status(), title: layout.title, horizontalOverflowPx: layout.overflow, navigationError, consoleErrors: newErrors, domReadyMs: Date.now() - started, passed });
    }
    await context.close();
  }
  return results;
}

async function exerciseCase(context: BrowserContext, caseId: string) {
  const page = await context.newPage();
  await page.goto(`${origin}/case/${caseId}/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const prompt = page.locator('[class*="quickQuestions"] button, [class*="prompts"] button').first();
  await prompt.click();
  await page.waitForFunction(() => document.querySelectorAll('[class*="transcript"] article, [class*="exchange"]').length > 0, undefined, { timeout: 5_000 });
  await page.waitForTimeout(100);
  const firstQuestionCount = await page.locator('[class*="transcript"] article, [class*="exchange"]').count();
  await prompt.click();
  await page.waitForFunction((count) => document.querySelectorAll('[class*="transcript"] article, [class*="exchange"]').length > Number(count), firstQuestionCount, { timeout: 5_000 });
  const repeatedFeedback = await page.getByText(/已验证|REPEATED|没有消耗额外线索/).count() > 0;
  const transcriptBeforeRefresh = await page.locator('[class*="transcript"] article, [class*="exchange"]').count();
  const inspect = page.getByRole("button", { name: "检查证据" }).first();
  if (await inspect.count()) {
    await inspect.click({ timeout: 5_000 });
    await page.waitForTimeout(100);
  }
  const addEvent = page.locator('[class*="eventBank"] button:not(:disabled), [class*="eventPalette"] button:not(:disabled)').first();
  if (await addEvent.count()) await addEvent.click();
  const link = page.getByRole("button", { name: /关联当前理论|接入证明/ }).first();
  if (await link.count()) await link.click();
  const eventCount = await page.locator('[class*="causalChain"] li:not([class*="empty"]), [class*="chain"] li').count();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const transcriptAfterRefresh = await page.locator('[class*="transcript"] article, [class*="exchange"]').count();
  const evidencePersisted = await page.getByText(/已检查|已关联|已核实/, { exact: false }).count() > 0;
  await page.close();
  return { caseId, questionRecorded: transcriptBeforeRefresh > 0, repeatedFeedback, evidenceExamined: evidencePersisted, theoryEventAdded: eventCount > 0, refreshRestored: transcriptAfterRefresh >= transcriptBeforeRefresh && evidencePersisted, passed: transcriptBeforeRefresh > 0 && repeatedFeedback && evidencePersisted && eventCount > 0 && transcriptAfterRefresh >= transcriptBeforeRefresh };
}

async function ambiguityCheck(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${origin}/case/c03-second-shadow/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const before = await page.locator('[class*="transcript"] article, [class*="exchange"]').count();
  const input = page.locator('input[name="investigation-question"]');
  await input.fill("第二个影子是光造成的吗？");
  await input.press("Enter");
  const interpretation = page.getByRole("group", { name: "确认问题解释" });
  await interpretation.waitFor();
  await page.waitForTimeout(100);
  const candidates = await interpretation.getByRole("button").count();
  const after = await page.locator('[class*="transcript"] article, [class*="exchange"]').count();
  const candidateFocused = await page.evaluate(() => document.activeElement?.closest('[role="group"]')?.getAttribute("aria-label") === "确认问题解释");
  await interpretation.getByRole("button").first().click();
  await page.waitForTimeout(100);
  const inputFocusReturned = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name === "investigation-question");
  await page.close();
  return { candidates, transcriptUnchanged: after === before, candidateFocused, inputFocusReturned, passed: candidates === 2 && after === before && candidateFocused && inputFocusReturned };
}

async function replayCheck(context: BrowserContext) {
  const page = await context.newPage();
  const caseFile = cases.find((entry) => entry.id === "c02-snow-route")?.data;
  if (!caseFile) throw new Error("C02 missing");
  await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  await injectSave(page, caseFile.id, createCanonicalSave(caseFile));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const replayText = await page.getByText(/证明：|证据：/).allTextContents();
  const closed = await page.getByText(/CASE CLOSED|CLOSED/).count() > 0;
  await page.close();
  return { closed, sourceBeatCount: replayText.length, passed: closed && replayText.length >= 5 };
}

async function offlineCheck(context: BrowserContext, browserName: string) {
  let page = await context.newPage();
  await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  const controlledBeforeOffline = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  let offlineTitle = "";
  let fallbackUsed = false;
  let error = "";
  let originStopped = false;
  try {
    if (browserName === "webkit") {
      await stopServer(server);
      originStopped = true;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
      offlineTitle = await page.locator("main h1:visible").first().textContent({ timeout: 5_000 }) ?? "";
    } else {
      await context.setOffline(true);
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
        offlineTitle = await page.locator("main h1:visible").first().textContent({ timeout: 5_000 }) ?? "";
      } catch (reloadError) {
        fallbackUsed = true;
        await page.close().catch(() => undefined);
        page = await context.newPage();
        await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded", timeout: 10_000 });
        offlineTitle = await page.locator("main h1:visible").first().textContent({ timeout: 5_000 }) ?? "";
        error = reloadError instanceof Error ? reloadError.message.split("\n")[0] : String(reloadError);
      }
    }
  } catch (offlineError) {
    error = offlineError instanceof Error ? offlineError.message.split("\n")[0] : String(offlineError);
  } finally {
    if (browserName !== "webkit") await context.setOffline(false).catch(() => undefined);
    if (originStopped) server = await startServer();
    await page.close();
  }
  return {
    method: browserName === "webkit" ? "origin-server-unavailable" : "playwright-context-offline",
    controlledBeforeOffline,
    offlineTitle,
    fallbackUsed,
    engineReloadError: error,
    passed: controlledBeforeOffline && offlineTitle.includes("没有脚印"),
  };
}

async function clearSaves(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolvePromise, reject) => {
      const request = indexedDB.open("turtle-soup", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolvePromise(request.result);
    });
    await new Promise<void>((resolvePromise, reject) => {
      const transaction = database.transaction("case-saves", "readwrite");
      const request = transaction.objectStore("case-saves").clear();
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolvePromise();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

async function archiveFileFlow(browser: Browser) {
  const caseFile = cases.find((entry) => entry.id === "c02-snow-route")?.data;
  if (!caseFile) throw new Error("C02 missing");
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await injectSave(page, caseFile.id, createCanonicalSave(caseFile));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForGame(page);
    const c02Card = page.getByRole("link", { name: /没有脚印的回家路/ });
    const closedBeforeExport = await c02Card.getByText("CLOSED", { exact: true }).count() === 1;
    await page.getByText("存档与版本", { exact: false }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出全部存档" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("browser did not expose downloaded archive path");
    const archiveBuffer = readFileSync(downloadPath);
    const archiveText = archiveBuffer.toString("utf8");
    const archive = JSON.parse(archiveText) as { saves?: unknown[] };
    const forbidden = [
      "solutionCertificate",
      "canonicalHypothesisId",
      ...cases.flatMap((entry) => [
        entry.data.solutionCertificate.canonicalHypothesisId,
        ...entry.data.facts.map((fact) => fact.id),
        ...entry.data.events.map((event) => event.id),
      ]),
    ];
    const noHiddenFields = forbidden.every((value) => !archiveText.includes(value));
    const exportedOneSave = archive.saves?.length === 1;
    await clearSaves(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForGame(page);
    const openAfterClear = await page.getByRole("link", { name: /没有脚印的回家路/ }).getByText("OPEN", { exact: true }).count() === 1;
    await page.getByText("存档与版本", { exact: false }).click();
    await page.locator('input[name="save-archive"]').setInputFiles({
      name: "turtle-soup-saves-audit.json",
      mimeType: "application/json",
      buffer: archiveBuffer,
    });
    const importStatus = page.getByText(/已安全导入 1 个存档/);
    await importStatus.waitFor({ timeout: 5_000 });
    const closedAfterImport = await page.getByRole("link", { name: /没有脚印的回家路/ }).getByText("CLOSED", { exact: true }).count() === 1;
    return {
      closedBeforeExport,
      exportedOneSave,
      noHiddenFields,
      openAfterClear,
      importStatusVisible: await importStatus.isVisible(),
      closedAfterImport,
      passed: closedBeforeExport && exportedOneSave && noHiddenFields && openAfterClear && closedAfterImport,
    };
  } finally {
    await context.close();
  }
}

async function soundscapeChecks(context: BrowserContext, browserName: string) {
  const results = [];
  for (const entry of cases) {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/case/${entry.id}/`, { waitUntil: "domcontentloaded" });
      await waitForGame(page);
      const supported = await page.evaluate(() => typeof AudioContext !== "undefined");
      await page.getByRole("button", { name: /打开.*设置/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const profile = getSoundscapeProfile(entry.data.presentation?.layoutId ?? "cold-room");
      const identityVisible = await dialog.getByText(profile.label, { exact: true }).count() === 1;
      const ambient = dialog.getByRole("checkbox", { name: /案件音景/ });
      const fallbackVisible = await dialog.getByText(/自动降级为静默模式/).count() === 1;
      let ambientEnabled = false;
      if (supported) {
        await ambient.check();
        ambientEnabled = await ambient.isChecked();
        const preview = dialog.getByRole("button", { name: "试听反馈" });
        await preview.click();
        await ambient.uncheck();
      }
      const fallbackCorrect = supported ? !fallbackVisible && await ambient.isEnabled() : fallbackVisible && await ambient.isDisabled();
      results.push({ caseId: entry.id, identity: profile.signature, supported, identityVisible, ambientEnabled: supported ? ambientEnabled : "unsupported", fallbackCorrect, pageErrors: errors, passed: identityVisible && fallbackCorrect && (supported ? ambientEnabled : true) && errors.length === 0 });
    } finally {
      await page.close();
    }
  }
  return { browser: browserName, cases: results, uniqueIdentities: new Set(results.map((result) => result.identity)).size, passed: results.every((result) => result.passed) && new Set(results.map((result) => result.identity)).size === 12 };
}

async function mutedCompletionChecks(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    try { localStorage.setItem("black-soup-settings", JSON.stringify({ muted: true, ambient: false, effectsVolume: 0, ambientVolume: 0 })); } catch { /* about:blank has no storage origin */ }
  });
  const results = [];
  try {
    for (const entry of cases) {
      const page = await context.newPage();
      await page.goto(`${origin}/case/${entry.id}/`, { waitUntil: "domcontentloaded" });
      await waitForGame(page);
      await injectSave(page, entry.id, createCanonicalSave(entry.data));
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForGame(page);
      await page.getByRole("button", { name: /打开.*设置/ }).click();
      const muted = await page.getByRole("dialog").getByRole("checkbox", { name: "静音" }).isChecked();
      await page.getByRole("button", { name: "关闭设置" }).click();
      const closed = await page.getByText(/CASE CLOSED|CLOSED/).count() > 0;
      const replayBeats = await page.getByText(/证明：|证据：/).count();
      results.push({ caseId: entry.id, muted, closed, replayBeats, passed: muted && closed && replayBeats >= 5 });
      await page.close();
    }
  } finally {
    await context.close();
  }
  return { cases: results, passed: results.every((result) => result.passed) };
}

async function emulatedDeviceCheck(browser: Browser, deviceName: "Pixel 7" | "iPhone 15") {
  const descriptor = devices[deviceName];
  const context = await browser.newContext({ ...descriptor, serviceWorkers: "allow" });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
    await waitForGame(page);
    const tabs = page.locator('nav[aria-label="调查区域"] button');
    const tabCount = await tabs.count();
    if (tabCount >= 2) await tabs.nth(1).tap();
    const input = page.locator('input[name="investigation-question"]');
    await input.tap();
    await input.fill("门是什么时候打开的？");
    const touchInputVisible = await input.isVisible();
    const coarsePointer = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const manifestLinked = await page.locator('link[rel="manifest"]').count() === 1;
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "domcontentloaded" });
    const serviceWorkerControlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    await page.screenshot({ path: resolve(screenshotDir, `${deviceName.toLowerCase().replaceAll(" ", "-")}-c02.png`) });
    return { device: deviceName, mode: "Playwright device emulation", realDevice: false, realDeviceStatus: "pending", coarsePointer, tabCount, touchInputVisible, horizontalOverflowPx: overflow, manifestLinked, serviceWorkerControlled, passed: coarsePointer && tabCount === 3 && touchInputVisible && overflow <= 1 && manifestLinked && serviceWorkerControlled };
  } finally {
    await context.close();
  }
}

async function lowPerformanceEmulation(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const started = Date.now();
  await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const readyMs = Date.now() - started;
  const input = page.locator('input[name="investigation-question"]');
  await page.locator('nav[aria-label="调查区域"] button').nth(1).tap();
  await input.fill("雪是什么时候开始下的？");
  await input.press("Enter");
  const answerRecorded = await page.waitForFunction(() => document.querySelectorAll('[class*="transcript"] article').length > 0, undefined, { timeout: 5_000 }).then(() => true).catch(() => false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await context.close();
  return { mode: "Chromium 4× CPU throttle emulation", realLowEndDevice: false, realDeviceStatus: "pending", readyMs, answerRecorded, horizontalOverflowPx: overflow, budgetMs: 3_000, passed: readyMs <= 3_000 && answerRecorded && overflow <= 1 };
}

async function backgroundAudioPauseCheck(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    const NativeAudioContext = globalThis.AudioContext;
    if (!NativeAudioContext) return;
    const lifecycle = { suspendCalls: 0, resumeCalls: 0, visibilityEvents: [] as string[], pageEvents: [] as string[] };
    Object.defineProperty(window, "__audioLifecycle", { value: lifecycle, configurable: true });
    document.addEventListener("visibilitychange", () => lifecycle.visibilityEvents.push(document.visibilityState));
    window.addEventListener("pagehide", () => lifecycle.pageEvents.push("pagehide"));
    window.addEventListener("pageshow", () => lifecycle.pageEvents.push("pageshow"));
    class TrackedAudioContext extends NativeAudioContext {
      override suspend() { lifecycle.suspendCalls += 1; return super.suspend(); }
      override resume() { lifecycle.resumeCalls += 1; return super.resume(); }
    }
    Object.defineProperty(globalThis, "AudioContext", { value: TrackedAudioContext, configurable: true });
  });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
    await waitForGame(page);
    const chip = page.locator('button[class*="soundscapeChip"]');
    await chip.waitFor();
    await chip.click();
    const enabled = await chip.getAttribute("aria-pressed") === "true";
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    await page.waitForTimeout(120);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await page.waitForTimeout(120);
    const lifecycle = await page.evaluate(() => (window as Window & { __audioLifecycle?: { suspendCalls: number; resumeCalls: number; visibilityEvents: string[]; pageEvents: string[] } }).__audioLifecycle ?? { suspendCalls: 0, resumeCalls: 0, visibilityEvents: [], pageEvents: [] });
    return { method: "tracked AudioContext with pagehide/pageshow lifecycle events", enabled, ...lifecycle, passed: enabled && lifecycle.suspendCalls >= 1 && lifecycle.resumeCalls >= 1 && lifecycle.pageEvents.includes("pagehide") && lifecycle.pageEvents.includes("pageshow") };
  } finally {
    await context.close();
  }
}

async function keyboardCheck(context: BrowserContext, caseId: string) {
  const page = await context.newPage();
  await page.goto(`${origin}/case/${caseId}/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  let reached = false;
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? "");
    if (name.includes("设置")) { reached = true; break; }
  }
  if (reached) await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  const opened = await dialog.isVisible().catch(() => false);
  if (opened) { await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Escape"); await page.waitForTimeout(100); }
  const returned = await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") ?? "").includes("设置"));
  await page.close();
  return { caseId, reachedByTab: reached, dialogOpened: opened, escapeReturnedFocus: returned, passed: reached && opened && returned };
}

async function a11yCheck(context: BrowserContext, route: string) {
  const page = await context.newPage();
  await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const blockers = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  await page.close();
  return { route, violationCount: result.violations.length, blockerCount: blockers.length, blockers: blockers.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length, help: violation.help })), passed: blockers.length === 0 };
}

async function mediaAndZoomChecks(context: BrowserContext, browserName: string) {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const forced = await page.evaluate(() => ({ forcedColors: matchMedia("(forced-colors: active)").matches, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches }));
  await page.screenshot({ path: resolve(screenshotDir, `${browserName}-c02-forced-colors.png`), fullPage: true });
  await page.setViewportSize({ width: 640, height: 450 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForGame(page);
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.close();
  return { ...forced, zoom200EquivalentViewport: "640x450 from 1280x900", zoomHorizontalOverflowPx: zoomOverflow, passed: forced.reducedMotion && zoomOverflow <= 1 };
}

async function saveResilience(browser: Browser) {
  const scenarios: Array<{ name: string; save: (valid: SaveEnvelope) => unknown; expected: RegExp }> = [
    { name: "partial", save: (valid) => ({ ...valid, commands: undefined }), expected: /损坏或不完整/ },
    { name: "old-schema", save: (valid) => ({ ...valid, schemaVersion: 0 }), expected: /版本不兼容/ },
    { name: "wrong-case", save: (valid) => ({ ...valid, caseId: "c03-second-shadow" }), expected: /版本不兼容/ },
    { name: "wrong-hash", save: (valid) => ({ ...valid, contentHash: "sha256:wrong" }), expected: /版本不兼容/ },
  ];
  const caseFile = cases.find((entry) => entry.id === "c02-snow-route")?.data;
  if (!caseFile) throw new Error("C02 missing");
  const valid = createCanonicalSave(caseFile);
  const results = [];
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await injectSave(page, "c02-snow-route", scenario.save(valid));
    await page.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
    await waitForGame(page);
    const notice = await page.getByText(scenario.expected).count() > 0;
    results.push({ scenario: scenario.name, playerNotice: notice, passed: notice });
    await context.close();
  }
  const quotaContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await quotaContext.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "case-saves") throw new DOMException("quota audit", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  const quotaPage = await quotaContext.newPage();
  await quotaPage.goto(`${origin}/case/c02-snow-route/`, { waitUntil: "domcontentloaded" });
  await waitForGame(quotaPage);
  const alert = quotaPage.getByRole("alert");
  const quotaPassed = await alert.getByText(/空间不足|无法保存|保存需要处理/).count() > 0 && await alert.getByRole("button", { name: "重新尝试保存" }).count() === 1 && await alert.getByRole("button", { name: "导出当前进度" }).count() === 1;
  results.push({ scenario: "quota", recoveryActions: quotaPassed, passed: quotaPassed });
  await quotaContext.close();
  return results;
}

async function performanceChecks(browser: Browser) {
  const budgets = { lcpMs: 2_500, cls: 0.1, longestTaskMs: 200, domContentLoadedMs: 1_500 };
  const results = [];
  for (const route of ["/", "/case/c01-cold-room-knock/", "/case/c02-snow-route/"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await addMetricsObserver(page);
    await page.goto(`${origin}${route}`, { waitUntil: "load" });
    await waitForGame(page);
    await page.waitForTimeout(600);
    const metric = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByName("first-contentful-paint")[0];
      const custom = (window as Window & { __goldMasterMetrics?: { cls: number; lcp: number; longTasks: number[] } }).__goldMasterMetrics;
      return { domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0, loadMs: navigation?.loadEventEnd ?? 0, fcpMs: paint?.startTime ?? 0, lcpMs: custom?.lcp ?? 0, cls: custom?.cls ?? 0, longestTaskMs: Math.max(0, ...(custom?.longTasks ?? [])) };
    });
    const passed = metric.lcpMs <= budgets.lcpMs && metric.cls <= budgets.cls && metric.longestTaskMs <= budgets.longestTaskMs && metric.domContentLoadedMs <= budgets.domContentLoadedMs;
    results.push({ route, ...metric, passed });
    await context.close();
  }
  return { budgets, results, passed: results.every((result) => result.passed) };
}

let server = await startServer();
const failures: string[] = [];
const routeResults: Array<Record<string, unknown>> = [];
const interactions: Record<string, unknown> = {};
const accessibility: Record<string, unknown> = {};
const keyboard: Record<string, unknown> = {};
const media: Record<string, unknown> = {};
const soundscapes: Record<string, unknown> = {};
const deviceDelivery: Record<string, unknown> = {
  realAndroidChrome: "pending — no physical Android device connected",
  realIOSSafari: "pending — no physical iPhone/iPad device connected",
  realLowEndDevice: "pending — no physical low-performance device connected",
};
let resilience: unknown[] = [];
let archiveIo: Record<string, unknown> = {};
let mutedCompletion: Record<string, unknown> = {};
let audioLifecycle: Record<string, unknown> = {};
let performance: Record<string, unknown> = {};

try {
  for (const [browserName, browserType] of Object.entries({ chromium, firefox, webkit }) as Array<[string, BrowserType<Browser>]>) {
    const browser = await browserType.launch({ headless: true });
    try {
      routeResults.push(...await routeMatrix(browserName, browser, failures));
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "allow" });
      const caseChecks = [];
      for (const entry of cases) {
        try { caseChecks.push(await exerciseCase(context, entry.id)); }
        catch (error) { caseChecks.push({ caseId: entry.id, error: error instanceof Error ? error.message.split("\n")[0] : String(error), passed: false }); }
      }
      const ambiguity = await ambiguityCheck(context);
      const replay = await replayCheck(context);
      const offline = await offlineCheck(context, browserName);
      interactions[browserName] = { cases: caseChecks, ambiguity, replay, offline, passed: caseChecks.every((result) => result.passed) && ambiguity.passed && replay.passed && offline.passed };
      await context.close();
      const keyboardContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const keyboardResults = [await keyboardCheck(keyboardContext, "c01-cold-room-knock"), await keyboardCheck(keyboardContext, "c02-snow-route")];
      keyboard[browserName] = { results: keyboardResults, passed: keyboardResults.every((result) => result.passed) };
      await keyboardContext.close();
      const axeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const axeResults = [];
      for (const route of ["/", "/case/c01-cold-room-knock/", "/case/c02-snow-route/", "/case/c03-second-shadow/"]) axeResults.push(await a11yCheck(axeContext, route));
      accessibility[browserName] = { results: axeResults, blockers: axeResults.reduce((sum, result) => sum + result.blockerCount, 0), passed: axeResults.every((result) => result.passed) };
      await axeContext.close();
      const mediaContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      media[browserName] = await mediaAndZoomChecks(mediaContext, browserName);
      await mediaContext.close();
      const audioContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      soundscapes[browserName] = await soundscapeChecks(audioContext, browserName);
      await audioContext.close();
      if (browserName === "chromium") {
        resilience = await saveResilience(browser);
        archiveIo = await archiveFileFlow(browser);
        mutedCompletion = await mutedCompletionChecks(browser);
        audioLifecycle = await backgroundAudioPauseCheck(browser);
        deviceDelivery.androidEmulation = await emulatedDeviceCheck(browser, "Pixel 7");
        deviceDelivery.lowPerformanceEmulation = await lowPerformanceEmulation(browser);
        performance = await performanceChecks(browser);
      }
      if (browserName === "webkit") deviceDelivery.iosEmulation = await emulatedDeviceCheck(browser, "iPhone 15");
      const screenshotContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const screenshotPage = await screenshotContext.newPage();
      await screenshotPage.goto(origin, { waitUntil: "domcontentloaded" });
      await screenshotPage.screenshot({ path: resolve(screenshotDir, `${browserName}-home-1440.png`), fullPage: true });
      await screenshotContext.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await stopServer(server);
}

for (const [name, value] of Object.entries(interactions)) if (!(value as { passed: boolean }).passed) failures.push(`${name} interaction matrix failed`);
for (const [name, value] of Object.entries(accessibility)) if (!(value as { passed: boolean }).passed) failures.push(`${name} accessibility blockers present`);
for (const [name, value] of Object.entries(keyboard)) if (!(value as { passed: boolean }).passed) failures.push(`${name} keyboard flow failed`);
for (const [name, value] of Object.entries(media)) if (!(value as { passed: boolean }).passed) failures.push(`${name} media/zoom flow failed`);
for (const [name, value] of Object.entries(soundscapes)) if (!(value as { passed: boolean }).passed) failures.push(`${name} soundscape flow failed`);
if (!resilience.every((value) => (value as { passed: boolean }).passed)) failures.push("save resilience failed");
if (!(archiveIo as { passed?: boolean }).passed) failures.push("save archive file flow failed");
if (!(mutedCompletion as { passed?: boolean }).passed) failures.push("muted completion flow failed");
if (!(audioLifecycle as { passed?: boolean }).passed) failures.push("background audio pause flow failed");
for (const [name, value] of Object.entries(deviceDelivery)) if (typeof value === "object" && value && "passed" in value && !(value as { passed: boolean }).passed) failures.push(`${name} device delivery emulation failed`);
if (!(performance as { passed?: boolean }).passed) failures.push("runtime performance budget failed");

const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "cross-browser-gold-master-audit",
  engines: ["chromium", "firefox", "webkit"],
  viewports: viewports.map((viewport) => viewport.name),
  humanParticipants: 0,
  humanFunGate: "pending",
  routeMatrix: { passed: routeResults.filter((result) => result.passed).length, total: routeResults.length, results: routeResults },
  interactions,
  accessibility,
  keyboard,
  media,
  soundscapes,
  deviceDelivery,
  saveResilience: resilience,
  saveArchiveFileFlow: archiveIo,
  mutedCompletion,
  audioLifecycle,
  performance,
  screenshots: ["chromium-home-1440.png", "firefox-home-1440.png", "webkit-home-1440.png", "chromium-c02-forced-colors.png", "firefox-c02-forced-colors.png", "webkit-c02-forced-colors.png", "pixel-7-c02.png", "iphone-15-c02.png"],
  failures,
  passed: failures.length === 0,
  qualification: "Automation validates operability, accessibility and deterministic fairness. Human comprehension, fun, pacing, satisfaction and replay intent remain pending.",
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, routeMatrix: report.routeMatrix, failures, passed: report.passed }, (_key, value) => Array.isArray(value) && value.length > 20 ? `[${value.length} entries]` : value, 2));
if (!report.passed) process.exitCode = 1;
