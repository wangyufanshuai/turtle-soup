import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv[2] ?? ".");
const packageDir = resolve(root, "dist/itch-html5");
const reportPath = resolve(root, "docs/v0.9-itch-subpath.json");
const port = Number(process.env.TURTLE_SOUP_ITCH_AUDIT_PORT ?? 4183);
const origin = `http://127.0.0.1:${port}`;
const mount = "/html/preview/";
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function statSafe(path: string) {
  try { return statSync(path).isFile(); } catch { return false; }
}

const outsideServerRequests: string[] = [];
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", origin).pathname);
  if (!pathname.startsWith(mount)) {
    outsideServerRequests.push(pathname);
    response.writeHead(404); response.end("outside itch mount"); return;
  }
  const mountedPath = pathname.slice(mount.length);
  const relativePath = mountedPath === "" ? "index.html" : mountedPath.endsWith("/") ? `${mountedPath}index.html` : mountedPath;
  const path = resolve(packageDir, relativePath);
  if (!path.toLowerCase().startsWith(packageDir.toLowerCase()) || !statSafe(path)) { response.writeHead(404); response.end("not found"); return; }
  response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
  response.end(readFileSync(path));
});
await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolvePromise); });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "allow" });
const page = await context.newPage();
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
const outsideBrowserRequests: string[] = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("requestfailed", (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText ?? "failed"}`));
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.origin === origin && !url.pathname.startsWith(mount)) outsideBrowserRequests.push(url.pathname);
});

let runtimeBase = "";
let homeLoaded = false;
let caseLoaded = false;
let questionRecorded = false;
let sceneLoaded = false;
let backNavigation = false;
let serviceWorkerRegistrations = -1;
let linkHref = "";
let urlAfterClick = "";
try {
  await page.goto(`${origin}${mount}`, { waitUntil: "domcontentloaded" });
  await page.locator("main h1:visible").first().waitFor();
  runtimeBase = await page.evaluate(() => (window as Window & { __TURTLE_SOUP_ITCH_BASE__?: string }).__TURTLE_SOUP_ITCH_BASE__ ?? "");
  homeLoaded = (await page.locator('a[href*="case/c02-snow-route"]').count()) === 1;
  const caseLink = page.getByRole("link", { name: /没有脚印的回家路/ });
  linkHref = await caseLink.getAttribute("href") ?? "";
  await caseLink.click();
  await page.waitForTimeout(500);
  urlAfterClick = page.url();
  if (new URL(urlAfterClick).pathname !== `${mount}case/c02-snow-route/`) throw new Error(`itch case link did not navigate: href=${linkHref} url=${urlAfterClick}`);
  await page.locator("main h1:visible").first().waitFor();
  await page.waitForFunction(() => !document.body.textContent?.includes("正在校验案件档案"));
  caseLoaded = (await page.locator("main h1:visible").first().textContent())?.includes("没有脚印") ?? false;
  sceneLoaded = await page.locator('img[src*="scene-snow-route"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0);
  await page.locator('[class*="prompts"] button').first().click();
  await page.waitForFunction(() => document.querySelectorAll('[class*="transcript"] article').length > 0);
  questionRecorded = true;
  await page.getByRole("link", { name: /案件档案/ }).click();
  await page.waitForURL((url) => url.pathname === mount, { waitUntil: "commit" });
  backNavigation = (await page.locator("main h1:visible").first().textContent())?.includes("选择一件") ?? false;
  serviceWorkerRegistrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
} finally {
  await context.close();
  await browser.close();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

const htmlFiles = files(packageDir).filter((path) => path.endsWith(".html"));
const absoluteHtmlReferences = htmlFiles.flatMap((path) => {
  const source = readFileSync(path, "utf8");
  return /(?:src|href|action)=["']\/(?!\/)/.test(source) ? [relative(packageDir, path).split(sep).join("/")] : [];
});
const webpackRuntime = files(packageDir).find((path) => /[\\/]webpack-[^\\/]+\.js$/.test(path));
const dynamicPublicPath = Boolean(webpackRuntime && readFileSync(webpackRuntime, "utf8").includes('new URL("../../",document.currentScript.src).href'));
const failures = [
  ...(runtimeBase === `${origin}${mount}` ? [] : [`runtime base is ${runtimeBase}`]),
  ...(homeLoaded ? [] : ["home did not load at nested mount"]),
  ...(caseLoaded && sceneLoaded && questionRecorded ? [] : ["case worker interaction failed at nested mount"]),
  ...(backNavigation ? [] : ["back navigation did not return to nested mount root"]),
  ...(serviceWorkerRegistrations === 0 ? [] : [`itch preview unexpectedly registered ${serviceWorkerRegistrations} service workers`]),
  ...absoluteHtmlReferences.map((path) => `absolute HTML asset reference remains in ${path}`),
  ...(dynamicPublicPath ? [] : ["webpack runtime does not derive chunk path from current script"]),
  ...outsideServerRequests.map((path) => `server received request outside mount: ${path}`),
  ...outsideBrowserRequests.map((path) => `browser requested outside mount: ${path}`),
  ...failedRequests.map((failure) => `request failed: ${failure}`),
  ...consoleErrors.map((error) => `console error: ${error}`),
];
const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "itch-html5-nested-subpath-audit",
  simulatedMount: `${origin}${mount}`,
  runtimeBase,
  linkHref,
  urlAfterClick,
  homeLoaded,
  caseLoaded,
  sceneLoaded,
  questionRecorded,
  backNavigation,
  serviceWorkerRegistrations,
  absoluteHtmlReferences,
  dynamicPublicPath,
  outsideServerRequests,
  outsideBrowserRequests,
  failedRequests,
  consoleErrors,
  failures,
  passed: failures.length === 0,
  qualification: "This validates a nested static-host path equivalent, not an actual itch.io upload or channel review.",
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, runtimeBase, homeLoaded, caseLoaded, questionRecorded, backNavigation, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
