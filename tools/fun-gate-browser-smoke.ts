import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { validateSessionExport } from "./lib/fun-gate-evaluation.ts";

const root = resolve(process.argv[2] ?? ".");
const baseUrl = process.env.TURTLE_SOUP_FUN_GATE_URL ?? "http://127.0.0.1:4173";
const results: Array<Record<string, unknown>> = [];
const browser = await chromium.launch();

for (const config of [
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
]) {
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, isMobile: config.isMobile, hasTouch: config.hasTouch, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const response = await page.goto(`${baseUrl}/case/c01-cold-room-knock/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("main h1:visible").first().waitFor({ timeout: 20_000 });
  if (config.isMobile) {
    const nav = page.locator('nav[aria-label="调查区域"]').last();
    await nav.locator("button").nth(1).click();
  }
  const input = page.locator('input[name="investigation-question"]:visible').first();
  await input.fill("敲门声是人敲的吗？");
  await input.press("Enter");
  await page.locator("[data-transcript-entry]").first().waitFor({ timeout: 5_000 });
  const transcriptCount = await page.locator("[data-transcript-entry]").count();
  await page.getByRole("button", { name: "测试模式" }).click();
  const exports: Record<string, unknown> = {};
  for (const format of ["json", "csv"] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: `导出 ${format.toUpperCase()}` }).click(),
    ]);
    const stream = await download.createReadStream();
    let body = "";
    if (stream) for await (const chunk of stream) body += Buffer.from(chunk).toString("utf8");
    if (format === "json") {
      const parsed = JSON.parse(body) as unknown;
      const validation = validateSessionExport(parsed, `${config.name}.json`);
      exports.json = { valid: Boolean(validation.value), rejectedReasonCount: validation.reasons.length, hasForbiddenField: validation.reasons.some((reason) => /forbidden|truth-bearing/u.test(reason)) };
    } else {
      exports.csv = { hasHeader: body.startsWith("schemaVersion,sessionId"), lineCount: body.trim().split(/\r?\n/u).length };
    }
  }
  results.push({
    viewport: config.name,
    status: response?.status() ?? null,
    title: await page.title(),
    transcriptCount,
    exports,
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
  });
  await context.close();
}

await browser.close();
const report = {
  reportVersion: "1.8",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.8-internal-rc",
  caseId: "c01-cold-room-knock",
  humanParticipants: 0,
  results,
  passed: results.length === 2 && results.every((result) => result.status === 200 && result.transcriptCount === 1 && result.consoleErrorCount === 0 && (result.exports as Record<string, Record<string, unknown>>).json.valid === true && (result.exports as Record<string, Record<string, unknown>>).csv.hasHeader === true),
  qualification: "仅证明本地干净浏览器中的 C01 提问和匿名 JSON/CSV 导出可用，不代表真人理解、乐趣或 Fun Gate 通过。",
};
mkdirSync(resolve(root, "docs"), { recursive: true });
writeFileSync(resolve(root, "docs/v1.8-fun-gate-browser-smoke.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
