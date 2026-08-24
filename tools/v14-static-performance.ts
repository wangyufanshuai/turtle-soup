import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
if (!existsSync(outDir)) throw new Error("Build output missing; run npm run build first");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const all = files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size }));
const index = readFileSync(resolve(outDir, "index.html"), "utf8");
const initial = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ""));
const actual = {
  totalBytes: all.reduce((total, item) => total + item.bytes, 0),
  initialJavaScriptBytes: all.filter((item) => initial.some((script) => item.relative.endsWith(script))).reduce((total, item) => total + item.bytes, 0),
  maximumAssetBytes: Math.max(...all.map((item) => item.bytes)),
  sourceMaps: all.filter((item) => item.ext === ".map").length,
  javascriptBytes: all.filter((item) => item.ext === ".js").reduce((total, item) => total + item.bytes, 0),
};
const budgets = { totalBytes: 8_000_000, initialJavaScriptBytes: 1_400_000, maximumAssetBytes: 450_000, sourceMaps: 0 };
const sw = readFileSync(resolve(outDir, "sw.js"), "utf8");
const failures = Object.entries(budgets).flatMap(([key, value]) => actual[key as keyof typeof actual] <= value ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${value}`]);
if (!sw.includes("black-soup-v14-internal-rc-1")) failures.push("v1.4 cache identity missing");
const report = { reportVersion: "1.4", releaseProfile: "v1.4-internal-rc", generatedAt: new Date().toISOString(), budgets, actual, failures, passed: failures.length === 0 };
writeFileSync(resolve(root, "docs/v1.4-static-performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
