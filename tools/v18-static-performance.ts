import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
if (!existsSync(outDir)) throw new Error("Build output missing");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const all = files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size }));
const index = readFileSync(resolve(outDir, "index.html"), "utf8");
const initial = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ""));
const actual = {
  totalBytes: all.reduce((sum, item) => sum + item.bytes, 0),
  initialJavaScriptBytes: all.filter((item) => initial.some((script) => item.relative.endsWith(script))).reduce((sum, item) => sum + item.bytes, 0),
  maximumAssetBytes: Math.max(...all.map((item) => item.bytes)),
  sourceMaps: all.filter((item) => item.ext === ".map").length,
  javascriptBytes: all.filter((item) => item.ext === ".js").reduce((sum, item) => sum + item.bytes, 0),
  fileCount: all.length,
};
const budgets = { totalBytes: 8_000_000, initialJavaScriptBytes: 1_400_000, maximumAssetBytes: 450_000, sourceMaps: 0 };
const failures = Object.entries(budgets).flatMap(([key, value]) => actual[key as keyof typeof actual] <= value ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${value}`]);
const cacheIdentity = "black-soup-v18-golden-nine-hardening-rc-1";
const sw = readFileSync(resolve(outDir, "sw.js"), "utf8");
if (!sw.includes(cacheIdentity)) failures.push("v1.8 cache identity missing");
const precache = JSON.parse(readFileSync(resolve(root, "docs/v1.8-precache.json"), "utf8")) as { passed?: boolean; entryCount?: number; totalBytes?: number };
const serviceWorkerBytes = statSync(resolve(outDir, "sw.js")).size;
if (precache.passed !== true || precache.entryCount !== all.length - 1 || precache.totalBytes !== actual.totalBytes - serviceWorkerBytes) failures.push("precache report does not match final cacheable static tree");
const report = { reportVersion: "1.8", releaseProfile: "v1.8-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, budgets, actual, cacheIdentity, failures, passed: failures.length === 0 };
writeFileSync(resolve(root, "docs/v1.8-static-performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
