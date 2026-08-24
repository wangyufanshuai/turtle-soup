import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv[2] ?? ".");
const baseUrl = process.env.TURTLE_SOUP_FUN_GATE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch();

async function visitFreshContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const response = await page.goto(`${baseUrl}/case/c01-cold-room-knock/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("main h1:visible").first().waitFor({ timeout: 20_000 });
  return { context, page, response, errors };
}

const contaminated = await visitFreshContext();
const contaminatedInput = contaminated.page.locator('input[name="investigation-question"]:visible').first();
await contaminatedInput.fill("敲门声是人敲的吗？");
await contaminatedInput.press("Enter");
await contaminated.page.locator("[data-transcript-entry]").first().waitFor({ timeout: 5_000 });
const contaminatedTranscriptCount = await contaminated.page.locator("[data-transcript-entry]").count();
await contaminated.context.close();

const clean = await visitFreshContext();
const cleanTranscriptCount = await clean.page.locator("[data-transcript-entry]").count();
const cleanTitle = await clean.page.locator("main h1:visible").first().textContent();
const cleanViewport = await clean.page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
const cleanErrors = clean.errors;
const cleanStatus = clean.response?.status() ?? null;
await clean.context.close();
await browser.close();

const report = {
  reportVersion: "1.8",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.8-internal-rc",
  caseId: "c01-cold-room-knock",
  humanParticipants: 0,
  contaminatedContextTranscriptCount: contaminatedTranscriptCount,
  cleanContextTranscriptCount: cleanTranscriptCount,
  cleanContextTitlePresent: Boolean(cleanTitle?.includes("冷藏室的敲门声")),
  cleanContextViewport: cleanViewport,
  cleanContextHttpStatus: cleanStatus,
  cleanContextConsoleErrorCount: cleanErrors.length,
  passed: contaminatedTranscriptCount === 1 && cleanTranscriptCount === 0 && cleanTitle?.includes("冷藏室的敲门声") === true && cleanStatus === 200 && cleanErrors.length === 0,
  qualification: "仅证明独立浏览器上下文不会继承上一测试者的公开问答状态；不包含存档内容，也不代表真人理解或 Fun Gate 通过。",
};
mkdirSync(resolve(root, "docs"), { recursive: true });
writeFileSync(resolve(root, "docs/v1.8-fun-gate-clean-context.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
