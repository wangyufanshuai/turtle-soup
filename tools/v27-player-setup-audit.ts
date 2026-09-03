import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const v29 = process.argv.includes("--v29"), v28 = process.argv.includes("--v28");
const version = v29 ? "2.9" : v28 ? "2.8" : "2.7";
const profileId = v29 ? "v2.9-internal-rc" : v28 ? "v2.8-internal-rc" : "v2.7-internal-rc";
const outDir = resolve(root, "apps/web/out");
const shotDir = resolve(root, `output/playwright/v${version.replace(".", "")}`);
mkdirSync(shotDir, { recursive: true });
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".ico": "image/x-icon" };
function staticPath(url: string) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const candidate = resolve(outDir, `.${pathname}`);
  if (!candidate.toLowerCase().startsWith(outDir.toLowerCase())) return;
  try { if (statSync(candidate).isDirectory()) { const index = resolve(candidate, "index.html"); return existsSync(index) ? index : undefined; } return candidate; } catch { return; }
}
const server = createServer((request, response) => {
  const path = staticPath(request.url ?? "/");
  if (!path) { response.writeHead(404, { "content-type": "text/plain" }); response.end("Not found"); return; }
  response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
  response.end(readFileSync(path));
});
await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const address = server.address();
if (!address || typeof address === "string") throw new Error("v2.7 setup audit server failed");
const base = `http://127.0.0.1:${address.port}`;

try {
  const browser = await chromium.launch();
  const traces = [];
  for (const viewport of [{ name: "desktop", width: 1440, height: 900, mobile: false }, { name: "mobile", width: 390, height: 844, mobile: true }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile, hasTouch: viewport.mobile, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(`${base}/case/c61-missing-tape-turn/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator('nav[aria-label="调查工作区"]').waitFor({ state: "visible" });
    const topbarTestModeCount = await page.locator("header").getByText("测试模式", { exact: true }).count();
    const settingsButton = page.getByRole("button", { name: "设置", exact: true }).first();
    let directRecoveryEntry = true;
    const recoveryTrigger = page.getByRole("button", { name: "配置 AI 问题理解", exact: true });
    let recoveryScreenshot: { path: string; bytes: number } | undefined;
    if (v29) {
      await page.locator('nav[aria-label="调查工作区"] button').nth(1).click();
      await page.locator('input[name="investigation-question"]').fill("量子猫把蓝色香蕉寄到月球了吗");
      await page.getByRole("button", { name: "验证", exact: true }).click();
      await recoveryTrigger.waitFor({ state: "visible", timeout: 5_000 });
      const recoveryPath = resolve(shotDir, `question-recovery-${viewport.name}.png`);
      await page.screenshot({ path: recoveryPath, fullPage: false });
      recoveryScreenshot = { path: recoveryPath.slice(root.length + 1).replaceAll("\\", "/"), bytes: statSync(recoveryPath).size };
      await recoveryTrigger.click();
    } else await settingsButton.click();
    const dialog = page.getByRole("dialog", { name: "调查设置" });
    await dialog.waitFor({ state: "visible" });
    const settingsTabs = dialog.getByRole("tab");
    const settingsTabCount = await settingsTabs.count();
    const experienceSelected = settingsTabCount > 0 ? await dialog.getByRole("tab", { name: /^体验/ }).getAttribute("aria-selected") === "true" : true;
    if (v29) directRecoveryEntry = await dialog.getByRole("tab", { name: /^AI/ }).getAttribute("aria-selected") === "true";
    if (settingsTabCount > 0 && !v29) await dialog.getByRole("tab", { name: /^AI/ }).click();
    await dialog.getByRole("button", { name: /^OpenAI/ }).waitFor({ state: "visible", timeout: 5_000 });
    const presetsVisible = await Promise.all(["OpenAI", "Ollama", "llama.cpp"].map((label) => dialog.getByRole("button", { name: new RegExp(`^${label.replace(".", "\\.")}`) }).isVisible().catch(() => false)));
    await dialog.getByRole("button", { name: /^Ollama/ }).click();
    const endpoint = await dialog.locator('input[name="ai-question-routing-endpoint"]').inputValue();
    const localNoKeyCopy = await dialog.getByText("本机端点：允许 HTTP，不要求 Key", { exact: true }).isVisible().catch(() => false);
    const testButton = dialog.getByRole("button", { name: "测试连接", exact: true });
    const localTestEnabled = await testButton.isEnabled();
    await page.screenshot({ path: resolve(shotDir, `ai-settings-${viewport.name}.png`), fullPage: false });
    await dialog.getByRole("button", { name: /^OpenAI/ }).click();
    const remoteWithoutKeyDisabled = await testButton.isDisabled();
    await dialog.getByRole("button", { name: /^Ollama/ }).click();
    const axe = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => item.id);
    let dataToolsVisible = true;
    if (settingsTabCount > 0) { await dialog.getByRole("tab", { name: /^数据/ }).click(); dataToolsVisible = await dialog.getByText("体验记录（可选）", { exact: true }).isVisible().catch(() => false); }
    await page.keyboard.press("Escape");
    const closed = await dialog.isHidden();
    await page.waitForFunction((expected) => document.activeElement?.textContent?.trim() === expected, v29 ? "配置 AI 问题理解" : "设置", { timeout: 2_000 }).catch(() => undefined);
    const focusReturned = await (v29 ? recoveryTrigger : settingsButton).evaluate((node) => document.activeElement === node);
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const configuredStatus = page.getByText("AI：已配置", { exact: true });
    await configuredStatus.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
    const homeConfigured = await configuredStatus.isVisible().catch(() => false);
    const storage = await page.evaluate(() => ({ localKeys: Object.keys(localStorage), sessionKeys: Object.keys(sessionStorage), endpoint: localStorage.getItem("black-soup:ai-router-endpoint:v1") }));
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const progressiveSettings = v28 || v29 ? settingsTabCount === 3 && (v29 ? directRecoveryEntry : experienceSelected) && dataToolsVisible : true;
    const recoveryScreenshotValid = !v29 || Boolean(recoveryScreenshot && recoveryScreenshot.bytes > 5_000);
    const passed = topbarTestModeCount === 0 && directRecoveryEntry && recoveryScreenshotValid && progressiveSettings && presetsVisible.every(Boolean) && endpoint === "http://localhost:11434/v1/chat/completions" && localNoKeyCopy && localTestEnabled && remoteWithoutKeyDisabled && axe.length === 0 && closed && focusReturned && homeConfigured && !storage.localKeys.includes("black-soup:ai-router-key:v1") && !storage.sessionKeys.includes("black-soup:ai-router-key:v1") && overflow <= 1 && consoleErrors.length === 0;
    traces.push({ viewport: `${viewport.width}x${viewport.height}`, topbarTestModeCount, settingsTabCount, experienceSelected, directRecoveryEntry, recoveryScreenshot, recoveryScreenshotValid, dataToolsVisible, progressiveSettings, presetsVisible, endpoint, localNoKeyCopy, localTestEnabled, remoteWithoutKeyDisabled, axeSeriousCritical: axe, dialogClosedWithEscape: closed, focusReturned, homeConfigured, storage, overflow, consoleErrors, passed });
    await context.close();
  }
  await browser.close();
  const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, traces, passed: traces.every((trace) => trace.passed), qualification: "This focused browser audit verifies player-facing AI setup and settings focus behavior. It does not contact a model endpoint or establish answer quality." };
  writeFileSync(resolve(root, `docs/v${version}-player-setup.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ traces: traces.length, passed: report.passed }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
