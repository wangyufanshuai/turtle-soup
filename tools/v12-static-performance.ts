import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const reportPath = resolve(root, "docs/v1.2-static-performance.json");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const all = files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size }));
const index = readFileSync(resolve(outDir, "index.html"), "utf8");
const initial = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ""));
const sum = (ext: string) => all.filter((item) => item.ext === ext).reduce((total, item) => total + item.bytes, 0);
const actual = { totalBytes: all.reduce((total, item) => total + item.bytes, 0), javascriptBytes: sum(".js"), initialJavaScriptBytes: all.filter((item) => initial.some((script) => item.relative.endsWith(script))).reduce((total, item) => total + item.bytes, 0), cssBytes: sum(".css"), maximumAssetBytes: Math.max(...all.map((item) => item.bytes)), sourceMaps: all.filter((item) => item.ext === ".map").length };
const budgets = { totalBytes: 5_000_000, initialJavaScriptBytes: 1_400_000, maximumAssetBytes: 450_000, sourceMaps: 0 };
const failures = Object.entries(budgets).flatMap(([key, value]) => actual[key as keyof typeof actual] <= value ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${value}`]);
const sw = readFileSync(resolve(outDir, "sw.js"), "utf8");
if (!sw.includes("black-soup-v12-internal-rc1")) failures.push("v1.2 cache identity missing");
const report = { reportVersion: "1.2", generatedAt: new Date().toISOString(), releaseProfile: "v1.2-internal-rc", budgets, actual, failures, passed: failures.length === 0 };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8"); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
