import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const reportPath = resolve(root, "docs/v1.0-static-performance.json");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const all = files(outDir).map((path) => ({ path, relativePath: relative(outDir, path).split(sep).join("/"), extension: extname(path).toLowerCase(), bytes: statSync(path).size }));
const sum = (extension: string) => all.filter((file) => file.extension === extension).reduce((total, file) => total + file.bytes, 0);
const indexHtml = readFileSync(resolve(outDir, "index.html"), "utf8");
const initialScripts = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ""));
const initialJavaScriptBytes = all.filter((file) => initialScripts.some((script) => file.relativePath.endsWith(script))).reduce((sumBytes, file) => sumBytes + file.bytes, 0);
const budgets = { totalBytes: 5_000_000, javascriptBytes: 2_400_000, initialJavaScriptBytes: 1_400_000, cssBytes: 120_000, maximumAssetBytes: 450_000, sourceMaps: 0 };
const actual = { totalBytes: all.reduce((sumBytes, file) => sumBytes + file.bytes, 0), javascriptBytes: sum(".js"), initialJavaScriptBytes, cssBytes: sum(".css"), maximumAssetBytes: Math.max(...all.map((file) => file.bytes)), sourceMaps: all.filter((file) => file.extension === ".map").length };
const sw = readFileSync(resolve(outDir, "sw.js"), "utf8");
const missing = all.filter((file) => file.relativePath !== "sw.js" && file.extension !== ".map").flatMap((file) => { const path = file.relativePath === "index.html" ? "/" : file.relativePath.endsWith("/index.html") ? `/${file.relativePath.slice(0, -"index.html".length)}` : `/${file.relativePath}`; return sw.includes(JSON.stringify(path)) ? [] : [path]; });
const failures = Object.entries(budgets).flatMap(([key, value]) => actual[key as keyof typeof actual] <= value ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${value}`]);
if (missing.length) failures.push(`${missing.length} assets missing from precache`);
if (!sw.includes('const CACHE_NAME = "black-soup-v10-internal-rc1"')) failures.push("v1.0 cache identity missing");
const report = { reportVersion: "1.0", generatedAt: new Date().toISOString(), releaseProfile: "v1.0-internal-rc", budgets, actual, precacheCoverage: { percent: missing.length ? 0 : 100, missing }, largestAssets: [...all].sort((a, b) => b.bytes - a.bytes).slice(0, 20).map(({ relativePath: path, bytes }) => ({ path, bytes })), failures, passed: failures.length === 0 };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, actual, precacheCoverage: report.precacheCoverage.percent, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
