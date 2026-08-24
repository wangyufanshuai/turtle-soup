import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import type { CaseFile, GameCommand, QuestionAliasPack, SaveEnvelope } from "../packages/mystery-core/src/index.ts";
import { GOLDEN_CASE_IDS, GOLDEN_PATH_CASE_IDS } from "../apps/web/lib/golden-experience.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent, type ReleaseCaseEntry } from "./lib/release-content.ts";
import { mergeQuestionAliasPacks } from "./lib/v17-overlays.ts";

const root = resolve(process.argv.slice(2).find((value) => !value.startsWith("--")) ?? ".");
const isV18 = process.argv.includes("--v18");
const reportVersion = isV18 ? "1.8" : "1.7";
const releaseProfile = isV18 ? "v1.8-internal-rc" : "v1.7-internal-rc";
const outDir = resolve(root, "apps/web/out");
const outputDir = resolve(root, isV18 ? "output/playwright/v18" : "output/playwright/v17");
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
const release = loadReleaseContent(root, releaseProfile);
const entries = release.entries;
const byId = new Map(entries.map((entry) => [entry.id, { entry, caseFile: loadCaseFile(entry) }]));
const aliasPacks = mergeQuestionAliasPacks(
  JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.6/packs.json"), "utf8")) as QuestionAliasPack[],
  JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.7/packs.json"), "utf8")) as QuestionAliasPack[],
);
const aliasByCase = new Map(aliasPacks.map((pack) => [pack.caseId, pack]));
const representativeIds = new Set([...GOLDEN_PATH_CASE_IDS, "c25-silent-second-bell", "c36-no-one-left-terminal", "c37-zeroed-pressure-gauge"]);
const requestedFlowCases = process.env.TURTLE_SOUP_BROWSER_CASES ? new Set(process.env.TURTLE_SOUP_BROWSER_CASES.split(",").map((value) => value.trim()).filter(Boolean)) : undefined;
const requestedEngines = process.env.TURTLE_SOUP_BROWSER_ENGINES ? new Set(process.env.TURTLE_SOUP_BROWSER_ENGINES.split(",").map((value) => value.trim()).filter(Boolean)) : undefined;
const browserMatrix = ([['chromium', chromium], ['firefox', firefox], ['webkit', webkit]] as const).filter(([name]) => !requestedEngines || requestedEngines.has(name));
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function staticPath(url: string): string | undefined {
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
if (!address || typeof address === "string") throw new Error(`${reportVersion} browser audit server failed`);
const base = `http://127.0.0.1:${address.port}`;

async function visit(page: Page, path: string) {
  const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForSelector("main h1:visible", { timeout: 20_000 }).catch(() => undefined);
  return response;
}

async function captureScreenshot(page: Page, path: string, fullPage = true) {
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: true });
      if (document.activeElement !== main) {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        main.focus({ preventScroll: true });
      }
    }
  }).catch(() => undefined);
  await page.waitForFunction(() => document.activeElement === document.querySelector("main"), undefined, { timeout: 1_000 }).catch(() => undefined);
  const skipLinkResting = await page.locator(".skipLink").evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.opacity === "0" && style.pointerEvents === "none" && rect.bottom <= 0;
  }).catch(() => true);
  if (!skipLinkResting) throw new Error(`skip link remained visible before screenshot ${path}`);
  await page.screenshot({ path, fullPage });
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

function publicHypothesisId(caseFile: CaseFile, id: string): string {
  if (id === caseFile.solutionCertificate.canonicalHypothesisId) return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical";
  const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" };
  return aliases[id] ?? `path-${id.replace(/^hypothesis-/, "")}`;
}

function alternativeReadySave(caseFile: CaseFile): SaveEnvelope {
  const canonical = createCanonicalSave(caseFile);
  const alternative = caseFile.solutionCertificate.alternativeHypothesisIds[0];
  const commands = canonical.commands
    .filter((command) => command.type !== "submit_theory" && command.type !== "request_proof_replay")
    .map((command): GameCommand => command.type === "set_theory_hypothesis" ? { ...command, hypothesisId: publicHypothesisId(caseFile, alternative) } : command);
  return { ...canonical, commands, completed: false, updatedAt: new Date(0).toISOString() };
}

async function waitProjectionChange(page: Page, beforeTranscript: number, beforeChooser: boolean) {
  await page.waitForFunction(({ beforeTranscript, beforeChooser }) => {
    const transcript = document.querySelectorAll("[data-transcript-entry]").length;
    const chooser = Boolean(document.querySelector('[aria-label="确认问题解释"]'));
    return transcript > beforeTranscript || chooser !== beforeChooser;
  }, { beforeTranscript, beforeChooser }, { timeout: 2_000 }).catch(() => undefined);
}

async function switchMobilePanel(page: Page, index: number) {
  const nav = page.locator('nav[aria-label="调查区域"]').last();
  if (await nav.isVisible().catch(() => false)) {
    const button = nav.locator("button").nth(index);
    if (await button.isEnabled().catch(() => false)) await button.click();
  }
}

async function ask(page: Page, rawText: string, mobile: boolean) {
  if (mobile) await switchMobilePanel(page, 1);
  const input = page.locator('input[name="investigation-question"]:visible').first();
  if (await input.count() === 0) return false;
  const before = await page.locator("[data-transcript-entry]").count();
  const chooserBefore = await page.locator('[aria-label="确认问题解释"]').count() > 0;
  await input.fill(rawText);
  await input.press("Enter");
  await waitProjectionChange(page, before, chooserBefore);
  return true;
}

async function confirmAmbiguity(page: Page): Promise<boolean> {
  const chooser = page.locator('[aria-label="确认问题解释"]').first();
  if (await chooser.count() === 0) return false;
  const button = chooser.getByRole("button").first();
  if (await button.count() === 0) return false;
  await button.click({ force: true });
  await page.waitForFunction(() => !document.querySelector('[aria-label="确认问题解释"]'), { timeout: 5_000 }).catch(() => undefined);
  return await page.locator("[data-transcript-entry]").count() > 0;
}

async function openEvidence(page: Page): Promise<{ shelf: boolean; dialog: boolean; focusReturned: boolean }> {
  const shelf = page.locator('[aria-label="证据架"]').first();
  if (await shelf.count() === 0 || !await shelf.isVisible().catch(() => false)) return { shelf: false, dialog: false, focusReturned: false };
  const card = shelf.locator(".card, button").first();
  if (await card.count() === 0) return { shelf: true, dialog: false, focusReturned: false };
  await shelf.scrollIntoViewIfNeeded().catch(() => undefined);
  await card.scrollIntoViewIfNeeded().catch(() => undefined);
  await card.click({ force: true });
  await page.waitForTimeout(80);
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) return { shelf: true, dialog: false, focusReturned: false };
  const focusedInside = await dialog.evaluate((node) => node.contains(document.activeElement));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('[aria-label="证据架"]')), { timeout: 1_000 }).catch(() => undefined);
  const focusReturned = await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-label="证据架"]')));
  return { shelf: true, dialog: focusedInside, focusReturned };
}

async function stickyObstruction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="调查区域"]');
    if (!nav || getComputedStyle(nav).display === "none") return 0;
    let overlaps = 0;
    for (const node of Array.from(document.querySelectorAll("main button, main input, main select, main textarea"))) {
      if (!(node instanceof HTMLElement) || !node.offsetParent || nav.contains(node)) continue;
      node.focus({ preventScroll: false });
      const navRect = nav.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      const intersects = rect.left < navRect.right && rect.right > navRect.left && rect.top < navRect.bottom && rect.bottom > navRect.top;
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 1 || document.body.scrollHeight > window.innerHeight + 1;
      const permanent = ["fixed", "sticky"].includes(getComputedStyle(node).position);
      if (intersects && (permanent || !scrollable)) overlaps += 1;
    }
    return overlaps;
  });
}

type BoardOperation = {
  index: number;
  mode: string;
  itemBankVisible: boolean;
  slotVisible: boolean;
  selectionObserved: boolean;
  projectionChangeObserved: boolean;
  operated: boolean;
  diagnostic?: Record<string, unknown>;
};

async function operateVisibleBoard(page: Page, index: number): Promise<BoardOperation> {
  let board = page.locator('[data-reasoning-surface="board"]:visible').first();
  await board.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  const mode = await board.getAttribute("data-mode").catch(() => null) ?? "unknown";
  let items = board.locator('[aria-label="公开事件库"] button');
  let slots = board.locator('button[aria-label*="已放置"], button[aria-label*="空槽"]');
  const itemBankVisible = await items.first().isVisible().catch(() => false);
  const slotVisible = await slots.first().isVisible().catch(() => false);
  if (!itemBankVisible || !slotVisible) return { index, mode, itemBankVisible, slotVisible, selectionObserved: false, projectionChangeObserved: false, operated: false };

  const itemCount = await items.count();
  const slotCount = await slots.count();
  const filledSlots = board.locator('button[aria-label*="已放置"]');
  if (await filledSlots.count() > 0) {
    const filledSlot = filledSlots.first();
    const beforeLabel = await filledSlot.getAttribute("aria-label", { timeout: 1_500 }).catch(() => null) ?? "";
    const itemLabel = beforeLabel.match(/已放置(.+)$/u)?.[1]?.trim() ?? "";
    const slotIndex = await slots.evaluateAll((nodes, targetLabel) => nodes.findIndex((node) => node.getAttribute("aria-label") === targetLabel), beforeLabel);
    const remove = filledSlot.locator("xpath=..").locator('button[aria-label^="移除"]').last();
    const item = items.filter({ hasText: itemLabel }).first();
    const diagnostic: Record<string, unknown> = { itemLabel, slotIndex, removeCount: await remove.count(), matchingItemCount: await item.count() };
    if (itemLabel && slotIndex >= 0 && await remove.count() > 0 && await item.count() > 0) {
      diagnostic.removeClicked = await remove.click({ force: true, timeout: 3_000 }).then(() => true).catch(() => false);
      diagnostic.removeObserved = await page.waitForFunction((targetSlotIndex) => document.querySelector('[data-reasoning-surface="board"]')?.querySelectorAll('button[aria-label*="已放置"], button[aria-label*="空槽"]')[targetSlotIndex]?.getAttribute("aria-label")?.includes("空槽"), slotIndex, { timeout: 4_000 }).then(() => true).catch(() => false);
      board = page.locator('[data-reasoning-surface="board"]:visible').first();
      items = board.locator('[aria-label="公开事件库"] button');
      slots = board.locator('button[aria-label*="已放置"], button[aria-label*="空槽"]');
      const restoredItem = items.filter({ hasText: itemLabel }).first();
      diagnostic.restoredItemCount = await restoredItem.count();
      diagnostic.itemClicked = await restoredItem.click({ force: true, timeout: 3_000 }).then(() => true).catch(() => false);
      diagnostic.selectionWait = await page.waitForFunction((label) => Array.from(document.querySelectorAll('[data-reasoning-surface="board"] [aria-label="公开事件库"] button')).some((button) => button.querySelector("span")?.textContent?.trim() === label && button.getAttribute("aria-pressed") === "true"), itemLabel, { timeout: 800 }).then(() => true).catch(() => false);
      if (!diagnostic.selectionWait) {
        diagnostic.nativeItemClick = await page.evaluate((label) => {
          const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-reasoning-surface="board"] [aria-label="公开事件库"] button')).find((node) => node.querySelector("span")?.textContent?.trim() === label);
          button?.click();
          return Boolean(button);
        }, itemLabel);
        diagnostic.selectionWait = await page.waitForFunction((label) => Array.from(document.querySelectorAll('[data-reasoning-surface="board"] [aria-label="公开事件库"] button')).some((button) => button.querySelector("span")?.textContent?.trim() === label && button.getAttribute("aria-pressed") === "true"), itemLabel, { timeout: 2_000 }).then(() => true).catch(() => false);
      }
      const selectionObserved = await page.evaluate((label) => Array.from(document.querySelectorAll('[data-reasoning-surface="board"] [aria-label="公开事件库"] button')).some((button) => button.querySelector("span")?.textContent?.trim() === label && button.getAttribute("aria-pressed") === "true"), itemLabel);
      diagnostic.selectionObserved = selectionObserved;
      diagnostic.slotClicked = await page.locator('[data-reasoning-surface="board"]:visible').first().locator('button[aria-label*="已放置"], button[aria-label*="空槽"]').nth(slotIndex).click({ force: true, timeout: 3_000 }).then(() => true).catch(() => false);
      diagnostic.restoreObserved = await page.waitForFunction(({ targetSlotIndex, itemLabel }) => document.querySelector('[data-reasoning-surface="board"]')?.querySelectorAll('button[aria-label*="已放置"], button[aria-label*="空槽"]')[targetSlotIndex]?.getAttribute("aria-label")?.includes(`已放置${itemLabel}`), { targetSlotIndex: slotIndex, itemLabel }, { timeout: 1_500 }).then(() => true).catch(() => false);
      if (!diagnostic.restoreObserved && selectionObserved) {
        diagnostic.nativeSlotClick = await page.evaluate((targetSlotIndex) => {
          const button = document.querySelector('[data-reasoning-surface="board"]')?.querySelectorAll<HTMLButtonElement>('button[aria-label*="已放置"], button[aria-label*="空槽"]')[targetSlotIndex];
          button?.click();
          return Boolean(button);
        }, slotIndex);
        diagnostic.restoreObserved = await page.waitForFunction(({ targetSlotIndex, itemLabel }) => document.querySelector('[data-reasoning-surface="board"]')?.querySelectorAll('button[aria-label*="已放置"], button[aria-label*="空槽"]')[targetSlotIndex]?.getAttribute("aria-label")?.includes(`已放置${itemLabel}`), { targetSlotIndex: slotIndex, itemLabel }, { timeout: 3_000 }).then(() => true).catch(() => false);
      }
      board = page.locator('[data-reasoning-surface="board"]:visible').first();
      const restoredLabel = await board.locator('button[aria-label*="已放置"], button[aria-label*="空槽"]').nth(slotIndex).getAttribute("aria-label").catch(() => null) ?? "";
      diagnostic.restoredLabel = restoredLabel;
      const projectionChangeObserved = restoredLabel.includes(`已放置${itemLabel}`);
      if (selectionObserved && projectionChangeObserved) return { index, mode, itemBankVisible, slotVisible, selectionObserved, projectionChangeObserved, operated: true, diagnostic };
    }
    return { index, mode, itemBankVisible, slotVisible, selectionObserved: false, projectionChangeObserved: false, operated: false, diagnostic };
  }

  const attempts: Array<{ itemIndex: number; slotIndex: number }> = [];
  const attemptKeys = new Set<string>();
  const addAttempt = (itemIndex: number, slotIndex: number) => {
    const key = `${itemIndex}:${slotIndex}`;
    if (!attemptKeys.has(key)) { attemptKeys.add(key); attempts.push({ itemIndex, slotIndex }); }
  };
  for (let index = 0; index < Math.max(itemCount, slotCount); index += 1) addAttempt(index % itemCount, index % slotCount);
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) addAttempt(itemIndex, slotIndex);
  let selectionObserved = false;
  for (const attempt of attempts) {
    board = page.locator('[data-reasoning-surface="board"]:visible').first();
    items = board.locator('[aria-label="公开事件库"] button');
    slots = board.locator('button[aria-label*="已放置"], button[aria-label*="空槽"]');
    const item = items.nth(attempt.itemIndex);
    const slot = slots.nth(attempt.slotIndex);
    const itemLabel = (await item.locator("span").textContent().catch(() => null) ?? await item.textContent().catch(() => null) ?? "").trim();
    const beforeLabel = await slot.getAttribute("aria-label", { timeout: 1_500 }).catch(() => null);
    if (beforeLabel === null) break;
    if (beforeLabel.includes(`已放置${itemLabel}`)) continue;
    if (!await item.click({ force: true, timeout: 1_500 }).then(() => true).catch(() => false)) continue;
    selectionObserved = selectionObserved || await item.getAttribute("aria-pressed", { timeout: 1_000 }).catch(() => null) === "true";
    if (!await slot.click({ force: true, timeout: 1_500 }).then(() => true).catch(() => false)) continue;
    await page.waitForFunction(({ itemLabel, beforeLabel, targetSlotIndex }) => {
      const active = document.querySelector('[data-reasoning-surface="board"]');
      if (!active) return false;
      const node = active.querySelectorAll('button[aria-label*="已放置"], button[aria-label*="空槽"]')[targetSlotIndex];
      const label = node?.getAttribute("aria-label") ?? "";
      return label !== beforeLabel && label.includes(`已放置${itemLabel}`);
    }, { itemLabel, beforeLabel, targetSlotIndex: attempt.slotIndex }, { timeout: 2_500 }).catch(() => undefined);
    board = page.locator('[data-reasoning-surface="board"]:visible').first();
    const afterLabel = await board.locator('button[aria-label*="已放置"], button[aria-label*="空槽"]').nth(attempt.slotIndex).getAttribute("aria-label").catch(() => null) ?? "";
    const projectionChangeObserved = afterLabel !== beforeLabel && afterLabel.includes(`已放置${itemLabel}`);
    if (projectionChangeObserved) return { index, mode, itemBankVisible, slotVisible, selectionObserved, projectionChangeObserved, operated: selectionObserved };
  }
  return { index, mode, itemBankVisible, slotVisible, selectionObserved, projectionChangeObserved: false, operated: false };
}

async function boardInteraction(page: Page, resetBeforeBoard?: (index: number) => Promise<void>): Promise<{ boardCount: number; modes: string[]; operatedCount: number; operated: boolean; boards: BoardOperation[] }> {
  const tabs = page.locator('[role="tablist"][aria-label="选择推理板"] [role="tab"]');
  const taskSelector = page.locator('[data-mobile-proof-controls] select:visible').first();
  const taskSelectorVisible = await taskSelector.isVisible().catch(() => false);
  const tabCount = await tabs.count();
  const selectorOptions = taskSelectorVisible
    ? await taskSelector.locator("option").evaluateAll((options) => options.map((option) => ({ value: (option as HTMLOptionElement).value, mode: option.getAttribute("data-board-mode") ?? "unknown" }))).catch(() => [] as Array<{ value: string; mode: string }>)
    : [];
  const selectorCount = selectorOptions.length;
  const renderedCount = await page.locator('[data-reasoning-surface="board"]').count();
  const boardCount = selectorCount || tabCount || renderedCount;
  if (boardCount === 0) return { boardCount: 0, modes: [], operatedCount: 0, operated: true, boards: [] };

  const boards: BoardOperation[] = [];
  for (let index = 0; index < boardCount; index += 1) {
    if (resetBeforeBoard) await resetBeforeBoard(index);
    if (taskSelectorVisible) {
      const option = selectorOptions[index];
      let selected = false;
      for (let attempt = 0; option && attempt < 3 && !selected; attempt += 1) {
        const currentSelector = page.locator('[data-mobile-proof-controls] select:visible').first();
        selected = await currentSelector.selectOption(option.value, { timeout: 3_000 }).then(() => true).catch(() => false);
        if (selected) selected = await page.waitForFunction(({ value, mode }) => {
          const selector = document.querySelector('[data-mobile-proof-controls] select') as HTMLSelectElement | null;
          const board = document.querySelector('[data-reasoning-surface="board"]');
          return selector?.value === value && board?.getAttribute("data-mode") === mode;
        }, option, { timeout: 4_000 }).then(() => true).catch(() => false);
      }
      if (!option || !selected) {
        boards.push({ index, mode: "unknown", itemBankVisible: false, slotVisible: false, selectionObserved: false, projectionChangeObserved: false, operated: false });
        continue;
      }
    } else if (tabCount > 0) {
      const tab = tabs.nth(index);
      await tab.scrollIntoViewIfNeeded().catch(() => undefined);
      if (!await tab.click({ force: true, timeout: 2_000 }).then(() => true).catch(() => false)) {
        boards.push({ index, mode: "unknown", itemBankVisible: false, slotVisible: false, selectionObserved: false, projectionChangeObserved: false, operated: false });
        continue;
      }
      await page.waitForFunction((tabIndex) => document.querySelectorAll('[role="tablist"][aria-label="选择推理板"] [role="tab"]')[tabIndex]?.getAttribute("aria-selected") === "true", index, { timeout: 3_000 }).catch(() => undefined);
    }
    boards.push(await operateVisibleBoard(page, index));
  }
  const modes = [...new Set(boards.map((board) => board.mode))];
  const operatedCount = boards.filter((board) => board.operated).length;
  return { boardCount, modes, operatedCount, operated: operatedCount === boardCount, boards };
}

async function routeSmoke(browserName: string, type: BrowserType, mobile: boolean) {
  const browser = await type.launch();
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors: string[] = [];
  let unknownPhase = false;
  page.on("console", (message) => { if (message.type() === "error" && !unknownPhase) errors.push(message.text()); });
  const home = await visit(page, "/");
  if (browserName === "chromium" && !mobile) await captureScreenshot(page, resolve(outputDir, "home-desktop.png"));
  const routes: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const response = await visit(page, `/case/${entry.id}/`);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const title = await page.locator("main h1:visible").first().textContent().catch(() => "");
    const obstruction = mobile ? await stickyObstruction(page) : 0;
    routes.push({ caseId: entry.id, status: response?.status(), overflow, obstruction, title, passed: response?.status() === 200 && overflow <= 1 && obstruction === 0 && Boolean(title) });
  }
  const homeStatus = home?.status();
  unknownPhase = true;
  const unknownResponse = await visit(page, "/case/not-a-real-case/");
  unknownPhase = false;
  if (browserName === "chromium" && !mobile) await captureScreenshot(page, resolve(outputDir, "unknown-case-404.png"));
  await context.close();
  await browser.close();
  return { browser: browserName, viewport: mobile ? "390x844" : "1440x900", homeStatus, faviconStatus: (await fetch(`${base}/favicon.ico`)).status, unknownStatus: unknownResponse?.status(), routes, consoleErrors: errors, passed: homeStatus === 200 && unknownResponse?.status() === 404 && errors.length === 0 && routes.every((route) => route.passed) };
}

async function fullFlow(browserName: string, type: BrowserType, mobile: boolean, scope: "all" | "golden") {
  const browser = await type.launch();
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
  const traces: Array<Record<string, unknown>> = [];
  const goldenIds = new Set<string>(GOLDEN_CASE_IDS);
  const flowEntries = requestedFlowCases
    ? entries.filter((entry) => requestedFlowCases.has(entry.id))
    : scope === "golden"
      ? entries.filter((entry) => goldenIds.has(entry.id))
      : entries;
  const runEntry = async (entry: ReleaseCaseEntry): Promise<Record<string, unknown>> => {
    const source = byId.get(entry.id)!;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await visit(page, `/case/${entry.id}/`);
    const capture = browserName === "chromium" && representativeIds.has(entry.id);
    if (capture) await captureScreenshot(page, resolve(outputDir, `${mobile ? "mobile" : "desktop"}-${entry.id}-opening.png`));
    const firstQuery = source.caseFile.questionSemantics[0]?.examplePhrases?.[0] ?? "请确认第一条公开记录";
    const asked = await ask(page, firstQuery, mobile);
    const firstAnswer = await page.locator("[data-transcript-entry]").count() > 0;
    const ambiguity = aliasByCase.get(entry.id)?.ambiguousPhrases?.[0]?.text;
    let ambiguityRecovered = false;
    if (ambiguity) {
      await ask(page, ambiguity, mobile);
      ambiguityRecovered = await confirmAmbiguity(page);
    }
    for (const query of source.caseFile.questionSemantics.slice(1, 3)) {
      await ask(page, query.examplePhrases?.[0] ?? "请确认下一条公开记录", mobile);
      if (await page.locator('[aria-label="确认问题解释"]').count()) await confirmAmbiguity(page);
    }
    const heavy = true;
    if (mobile) await switchMobilePanel(page, 0);
    const evidence = heavy ? await openEvidence(page) : { shelf: true, dialog: true, focusReturned: true };
    if (capture) await captureScreenshot(page, resolve(outputDir, `${mobile ? "mobile" : "desktop"}-${entry.id}-evidence.png`));
    const settingsButton = page.locator('button[aria-label="打开无障碍与声音设置"], button[aria-label="打开设置"]').first();
    let settingsFocus = !heavy;
    if (heavy && await settingsButton.count()) {
      await settingsButton.scrollIntoViewIfNeeded().catch(() => undefined);
      await settingsButton.click({ force: true });
      const dialog = page.getByRole("dialog").first();
      await dialog.waitFor({ state: "visible", timeout: 1_500 }).catch(() => undefined);
      settingsFocus = await dialog.isVisible().catch(() => false);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(10);
    }
    if (mobile) await switchMobilePanel(page, 2);
    const theoryReady = !heavy || await page.getByRole("button", { name: /提交.*证明|提交证明/ }).count() > 0;
    const earlyBoardModes = await page.locator('[data-reasoning-surface="board"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-mode") ?? "unknown"));
    let board = { boardCount: await page.locator('[data-reasoning-surface="board"]').count(), modes: earlyBoardModes, operatedCount: 0, operated: true, boards: [] as BoardOperation[] };
    if (capture) await captureScreenshot(page, resolve(outputDir, `${mobile ? "mobile" : "desktop"}-${entry.id}-investigation.png`));

    let submitEnabled = true;
    let wrongTheoryRejected = true;
    if (heavy) {
      const alternative = alternativeReadySave(source.caseFile);
      await injectSave(page, entry.id, alternative);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("main h1:visible", { timeout: 10_000 }).catch(() => undefined);
      await page.waitForFunction(() => document.body.textContent?.includes("CLOSED") || document.body.textContent?.includes("证明链闭合") || Boolean(document.querySelector('[data-reasoning-surface="board"]')), { timeout: 8_000 }).catch(() => undefined);
      if (mobile) await switchMobilePanel(page, 2);
      const resetBeforeBoard = browserName === "webkit" && mobile ? async () => {
        await injectSave(page, entry.id, alternative);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("main h1:visible", { timeout: 10_000 }).catch(() => undefined);
        await page.waitForFunction(() => Boolean(document.querySelector('[data-reasoning-surface="board"]')), { timeout: 8_000 }).catch(() => undefined);
        await switchMobilePanel(page, 2);
      } : undefined;
      board = await boardInteraction(page, resetBeforeBoard);
      const submit = page.getByRole("button", { name: /提交.*证明|提交证明/ }).last();
      submitEnabled = await submit.isEnabled().catch(() => false);
      if (submitEnabled) await submit.click({ force: true });
      await page.waitForTimeout(60);
      wrongTheoryRejected = await page.getByText(/缺|排除|不足|矛盾|不成立|证据/).count() > 0 && await page.getByText(/CASE CLOSED|案件已结案/).count() === 0;
      if (capture) await captureScreenshot(page, resolve(outputDir, `${mobile ? "mobile" : "desktop"}-${entry.id}-proof-gap.png`));
    }

    await injectSave(page, entry.id, createCanonicalSave(source.caseFile));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("main h1:visible", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForFunction(() => document.body.textContent?.includes("CLOSED") || document.body.textContent?.includes("证明链闭合") || Boolean(document.querySelector('[data-reasoning-surface="board"]')), { timeout: 8_000 }).catch(() => undefined);
    if (mobile) await switchMobilePanel(page, 2);
    const solved = await page.getByText(/CASE CLOSED|证据链闭合|CLOSED/).count() > 0;
    const replay = await page.getByText(/PROOF REPLAY READY|证明回放|证明：|证据：/).count() > 0;
    const challenges = await page.getByRole("button", { name: /限定|最小证据|无快捷/ }).count();
    const chapterCount = await page.locator('[aria-label="调查章节"] span').count();
    const chapterOpenCount = await page.locator('[aria-label="调查章节"] span[data-unlocked="true"]').count();
    const obstruction = mobile ? await stickyObstruction(page) : 0;
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const axe = browserName === "chromium" && heavy ? await new AxeBuilder({ page }).analyze() : undefined;
    const axeIssues = axe?.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.flatMap((node) => node.target.map(String)) })) ?? [];
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("main h1:visible", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForFunction(() => document.body.textContent?.includes("CLOSED") || document.body.textContent?.includes("证明链闭合"), { timeout: 8_000 }).catch(() => undefined);
    if (mobile) await switchMobilePanel(page, 2);
    const refreshRestored = await page.getByText(/CASE CLOSED|证据链闭合|CLOSED/).count() > 0;
    const passed = asked && firstAnswer && (ambiguity ? ambiguityRecovered : true) && evidence.shelf && evidence.dialog && evidence.focusReturned && settingsFocus && theoryReady && submitEnabled && wrongTheoryRejected && solved && replay && challenges >= 3 && board.operated && (!chapterCount || chapterOpenCount === chapterCount) && obstruction === 0 && overflow <= 1 && axeIssues.length === 0 && refreshRestored && errors.length === 0;
    const trace = { caseId: entry.id, viewport: mobile ? "390x844" : "1440x900", heavyFlow: heavy, asked, firstAnswer, ambiguityRequired: Boolean(ambiguity), ambiguityRecovered, evidence, settingsFocus, theoryReady, earlyBoardModes, submitEnabled, wrongTheoryRejected, solved, replay, challengeCount: challenges, board, chapterCount, chapterOpenCount, obstruction, overflow, axeSeriousCritical: axeIssues.length, axeIssues, refreshRestored, consoleErrors: errors, passed };
    await page.close();
    return trace;
  };
  const concurrency = scope === "all" ? 3 : 1;
  for (let offset = 0; offset < flowEntries.length; offset += concurrency) {
    traces.push(...await Promise.all(flowEntries.slice(offset, offset + concurrency).map(runEntry)));
  }
  await context.close();
  await browser.close();
  return { browser: browserName, viewport: mobile ? "390x844" : "1440x900", scope: requestedFlowCases ? "requested" : scope, traces, passed: traces.every((trace) => trace.passed) };
}

async function calibrationFlow(mobile: boolean) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("black-soup-settings", JSON.stringify({ muted: true, ambient: false, reducedMotion: true, highContrast: true, effectsVolume: 0, ambientVolume: 0 })));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const prefix = mobile ? "mobile" : "desktop";

  await visit(page, "/");
  const routeLinks = page.locator('[aria-labelledby="golden-path-title"] ol a');
  const routeCount = await routeLinks.count();
  const routeHrefs = await routeLinks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  const expectedHrefs = GOLDEN_PATH_CASE_IDS.map((caseId) => `/case/${caseId}`);
  const routeOrder = expectedHrefs.every((href, index) => routeHrefs[index]?.replace(/\/$/, "") === href);
  const recommended = await page.getByLabel(/推荐下一案/).first().textContent().catch(() => "") ?? "";
  await captureScreenshot(page, resolve(outputDir, `${prefix}-home-golden-path.png`));

  await visit(page, "/case/c01-cold-room-knock/");
  if (mobile) await switchMobilePanel(page, 1);
  const momentumRail = page.locator("[data-momentum-stage]").first();
  const momentumVisible = await momentumRail.isVisible().catch(() => false);
  const momentumText = await momentumRail.textContent().catch(() => "") ?? "";
  const momentumSafe = !["solutionCertificate", "canonicalHypothesis", "requiredFactIds", "fact-", "event-"].some((token) => momentumText.includes(token));
  const ladder = page.locator("[data-hint-ladder]").first();
  const initialHintLevel = await ladder.getAttribute("data-hint-level");
  let hintKeyboard = false;
  for (let level = 1; level <= 3; level += 1) {
    const button = ladder.getByRole("button");
    if (level === 1 && !mobile) {
      await button.focus();
      await page.keyboard.press("Enter");
      hintKeyboard = await ladder.getAttribute("data-hint-level") === "1";
    } else {
      await button.click();
      if (level === 1) hintKeyboard = true;
    }
    await page.waitForFunction((expected) => document.querySelector("[data-hint-ladder]")?.getAttribute("data-hint-level") === String(expected), level, { timeout: 2_000 }).catch(() => undefined);
  }
  const finalHintLevel = await ladder.getAttribute("data-hint-level");
  const hintText = await ladder.textContent() ?? "";
  const hintSafe = !["fact-", "event-", "evidence-", "query-", "hypothesis-", "solutionCertificate", "canonicalHypothesis"].some((token) => hintText.includes(token));
  await captureScreenshot(page, resolve(outputDir, `${prefix}-c01-hint-level-3.png`));

  const focusQueries = [
    { caseId: "c25-silent-second-bell", accepted: "所以说，十秒防抖会把第二次触发并入当前响铃吗？", rejected: "如果不是这样，十秒防抖会把第二次触发并入当前响铃吗？" },
    { caseId: "c37-zeroed-pressure-gauge", accepted: "所以说，指针回到零线时，仪表的零位基准仍可能移动吗？", rejected: "如果不是这样，指针回到零线时，仪表的零位基准仍可能移动吗？" },
  ];
  const queryPaths: Array<Record<string, unknown>> = [];
  for (const query of focusQueries) {
    await visit(page, `/case/${query.caseId}/`);
    const acceptedBefore = await page.locator("[data-transcript-entry]").count();
    await ask(page, query.accepted, mobile);
    const acceptedAfter = await page.locator("[data-transcript-entry]").count();
    const acceptedMatched = acceptedAfter === acceptedBefore + 1;
    await ask(page, query.rejected, mobile);
    const rejectedAfter = await page.locator("[data-transcript-entry]").count();
    const failClosed = rejectedAfter === acceptedAfter && await page.getByText(/没有改变案件状态|没有识别到明确/).count() > 0;
    queryPaths.push({ caseId: query.caseId, acceptedMatched, failClosed, passed: acceptedMatched && failClosed });
    await captureScreenshot(page, resolve(outputDir, `${prefix}-${query.caseId}-language-path.png`));
  }

  const c60 = byId.get("c60-last-sample-before-stop")!;
  await visit(page, "/case/c60-last-sample-before-stop/");
  await injectSave(page, c60.entry.id, alternativeReadySave(c60.caseFile));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1:visible", { timeout: 10_000 }).catch(() => undefined);
  if (mobile) await switchMobilePanel(page, 2);
  const mobileControls = page.locator("[data-mobile-proof-controls]");
  const controlsVisible = mobile ? await mobileControls.isVisible().catch(() => false) : await mobileControls.count() === 1;
  let boardSwitch = true;
  let submitReachable = true;
  let boardCollapse = true;
  let proofFocusSwitch = true;
  if (mobile && controlsVisible) {
    const selector = mobileControls.getByLabel("切换当前推理板");
    const options = await selector.locator("option").count();
    if (options > 1) {
      const lastValue = await selector.locator("option").last().getAttribute("value");
      if (lastValue) await selector.selectOption(lastValue);
      boardSwitch = await selector.inputValue() === lastValue;
    }
    const boardFocus = mobileControls.getByRole("button", { name: "当前板", exact: true });
    const chainFocus = mobileControls.getByRole("button", { name: "事件链", exact: true });
    if (isV18) {
      proofFocusSwitch = await boardFocus.count() === 1 && await chainFocus.count() === 1;
      if (proofFocusSwitch) {
        await chainFocus.click();
        proofFocusSwitch = await page.locator('[data-mobile-proof-surface="chain"][data-mobile-active]').isVisible().catch(() => false);
        await boardFocus.click();
        proofFocusSwitch = proofFocusSwitch && await page.locator('[data-mobile-proof-surface="board"][data-mobile-active]').isVisible().catch(() => false);
      }
    }
    const submit = mobileControls.getByRole("button", { name: /提交/ }).last();
    const box = await submit.boundingBox();
    submitReachable = await submit.isVisible().catch(() => false) && Boolean(box && box.y >= 0 && box.y + box.height <= 844);
  }
  const collapseButton = page.getByRole("button", { name: /收起当前板|收起并前往下一板/ }).first();
  if (await collapseButton.count()) {
    await collapseButton.click();
    boardCollapse = await page.locator("[data-board-collapsed]").isVisible().catch(() => false);
  }
  const highContrast = await page.locator("main[data-high-contrast]").count() > 0;
  const reducedMotion = await page.locator("main[data-reduced-motion]").count() > 0;
  const c60Overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  const c60Obstruction = mobile ? await stickyObstruction(page) : 0;
  await captureScreenshot(page, resolve(outputDir, `${prefix}-c60-mobile-task-controls.png`), false);

  await injectSave(page, c60.entry.id, createCanonicalSave(c60.caseFile));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1:visible", { timeout: 10_000 }).catch(() => undefined);
  if (mobile) await switchMobilePanel(page, 2);
  if (mobile && isV18) await page.locator("[data-mobile-proof-controls]").getByRole("button", { name: "事件链", exact: true }).click().catch(() => undefined);
  const chainToggle = page.getByRole("button", { name: "收起", exact: true }).first();
  let chainCollapse = false;
  if (await chainToggle.count()) {
    await chainToggle.click();
    chainCollapse = await page.getByText(/事件链已排列/).isVisible().catch(() => false);
  }
  await captureScreenshot(page, resolve(outputDir, `${prefix}-c60-collapsed-proof.png`), false);
  const axe = await new AxeBuilder({ page }).analyze();
  const axeIssues = axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.flatMap((node) => node.target.map(String)) }));
  const passed = routeCount === 9 && routeOrder && recommended.includes("冷藏室的敲门声") && initialHintLevel === "0" && finalHintLevel === "3" && hintKeyboard && hintSafe && (!isV18 || momentumVisible && momentumSafe && proofFocusSwitch) && queryPaths.every((item) => item.passed) && controlsVisible && boardSwitch && submitReachable && boardCollapse && chainCollapse && highContrast && reducedMotion && c60Overflow <= 1 && c60Obstruction === 0 && axeIssues.length === 0 && errors.length === 0;
  const result = { viewport: mobile ? "390x844" : "1440x900", routeCount, routeOrder, recommended, initialHintLevel, finalHintLevel, hintKeyboard, hintSafe, momentumVisible, momentumSafe, queryPaths, controlsVisible, boardSwitch, proofFocusSwitch, submitReachable, boardCollapse, chainCollapse, highContrast, reducedMotion, c60Overflow, c60Obstruction, axeSeriousCritical: axeIssues.length, axeIssues, consoleErrors: errors, passed };
  await context.close();
  await browser.close();
  return result;
}

async function offlineRecovery() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" });
  const page = await context.newPage();
  await visit(page, "/case/c01-cold-room-knock/");
  const ready = await Promise.race([page.evaluate(() => navigator.serviceWorker.ready.then((registration) => Boolean(registration.active))), new Promise<boolean>((done) => setTimeout(() => done(false), 20_000))]);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
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
  const skipRoutes = process.env.TURTLE_SOUP_BROWSER_SKIP_ROUTES === "1";
  const routeSmokeReports = skipRoutes ? [] : await Promise.all(
    browserMatrix
      .flatMap(([name, type]) => [routeSmoke(name, type, false), routeSmoke(name, type, true)]),
  );
  const routesOnly = process.env.TURTLE_SOUP_BROWSER_ROUTES_ONLY === "1";
  const fullFlows = routesOnly ? [] : await Promise.all(browserMatrix.flatMap(([name, type]) => {
    const scope = name === "chromium" ? "all" as const : "golden" as const;
    return [fullFlow(name, type, false, scope), fullFlow(name, type, true, scope)];
  }));
  const calibration = routesOnly ? [] : await Promise.all([calibrationFlow(false), calibrationFlow(true)]);
  const offline = routesOnly ? { ready: false, controlled: false, offlineReloadRendered: false, passed: false } : await offlineRecovery();
  const screenshots = readdirSync(outputDir).filter((name) => name.endsWith(".png"));
  const consoleErrors = routeSmokeReports.reduce((sum, report) => sum + (report.consoleErrors as string[]).length, 0) + fullFlows.reduce((sum, report) => sum + (report.traces as Array<Record<string, unknown>>).reduce((nested, trace) => nested + (trace.consoleErrors as string[]).length, 0), 0);
  const report = {
    reportVersion,
    generatedAt: new Date().toISOString(),
    releaseProfile,
    status: "internal-rc / human-evaluation-pending",
    humanParticipants: 0,
    caseCount: entries.length,
    engines: browserMatrix.map(([name]) => name),
    viewports: ["1440x900", "390x844"],
    routeSmoke: routeSmokeReports,
    fullFlows,
    calibration,
    offlineRecovery: offline,
    screenshots,
    screenshotCount: screenshots.length,
    consoleErrorCount: consoleErrors,
    canonicalFixtureForFinalSolve: true,
    routesOnly,
    partial: Boolean(routesOnly || skipRoutes || requestedFlowCases || requestedEngines),
    passed: routesOnly ? routeSmokeReports.every((item) => item.passed) && consoleErrors === 0 : skipRoutes ? fullFlows.every((item) => item.passed) && calibration.every((item) => item.passed) && offline.passed && consoleErrors === 0 : routeSmokeReports.every((item) => item.passed) && fullFlows.every((item) => item.passed) && calibration.every((item) => item.passed) && offline.passed && consoleErrors === 0 && screenshots.length > 0,
    qualification: "浏览器自动化证明路由、公开交互、响应式布局、障碍断言、可访问性、存档恢复和离线下界；最终结案使用本地确定性 canonical fixture 验证回放路径，不代表真人理解、乐趣或市场验证。",
  };
  writeFileSync(resolve(root, isV18 ? "docs/v1.8-browser-matrix.json" : "docs/v1.7-browser-matrix.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ cases: report.caseCount, routeRuns: routeSmokeReports.length, fullFlowRuns: fullFlows.length, calibration: calibration.map((item) => ({ viewport: item.viewport, passed: item.passed })), screenshots: report.screenshotCount, consoleErrors, offline: offline.passed, passed: report.passed }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
