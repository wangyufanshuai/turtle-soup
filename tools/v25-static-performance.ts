import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const all = existsSync(outDir) ? files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size })) : [];
const indexPath = resolve(outDir, "index.html");
const index = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
const initialNames = [...index.matchAll(/<script[^>]+src=["']([^"']+)["']/gu)].map((match) => match[1].replace(/^\//u, ""));
const initialFiles = all.filter((item) => initialNames.some((script) => item.relative.endsWith(script)));
const initialJavaScriptBytes = initialFiles.filter((item) => item.ext === ".js").reduce((sum, item) => sum + item.bytes, 0);
const actual = {
  totalBytes: all.reduce((sum, item) => sum + item.bytes, 0),
  initialJavaScriptBytes,
  maximumFileBytes: Math.max(0, ...all.map((item) => item.bytes)),
  fileCount: all.length,
  routeCount: all.filter((item) => /^case\/[^/]+\/index\.html$/u.test(item.relative)).length,
  archiveBytes: existsSync(resolve(root, "dist/turtle-soup-v2.5-internal-rc-web-pwa.zip")) ? statSync(resolve(root, "dist/turtle-soup-v2.5-internal-rc-web-pwa.zip")).size : Number.POSITIVE_INFINITY,
};
const budgets = { archiveBytes: 8_000_000, initialJavaScriptBytes: 700_000, maximumFileBytes: 450_000 };
const cacheName = (existsSync(resolve(outDir, "sw.js")) ? readFileSync(resolve(outDir, "sw.js"), "utf8").match(/black-soup-v25-[\w-]+/u)?.[0] : undefined) ?? "";
const failures = [
  ...Object.entries(budgets).flatMap(([key, limit]) => actual[key as keyof typeof actual] <= limit ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${limit}`]),
  actual.routeCount === 84 ? [] : [`routeCount: ${actual.routeCount} != 84`],
  cacheName === "black-soup-v25-season5-content-rc" ? [] : [`cacheName: ${cacheName || "missing"}`],
  existsSync(resolve(outDir, "manifest.webmanifest")) ? [] : ["manifest.webmanifest missing"],
  existsSync(resolve(outDir, "favicon.ico")) ? [] : ["favicon.ico missing"],
].flat();
const report = {
  reportVersion: "2.5",
  releaseProfile: "v2.5-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  budgets,
  actual,
  cacheIdentity: cacheName,
  deferredLoading: { currentCaseOnly: true, hiddenCaseBlocksOnDemand: true, optionalAiNotInInitialBundle: true },
  failures,
  passed: failures.length === 0,
};
writeFileSync(resolve(root, "docs/v2.5-static-performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
