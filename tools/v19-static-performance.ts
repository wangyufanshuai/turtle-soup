import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
const root = resolve(process.argv[2] ?? "."), outDir = resolve(root, "apps/web/out");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const all = existsSync(outDir) ? files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size })) : [];
const index = existsSync(resolve(outDir, "index.html")) ? readFileSync(resolve(outDir, "index.html"), "utf8") : "";
const initial = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ""));
const actual = { totalBytes: all.reduce((sum, item) => sum + item.bytes, 0), initialJavaScriptBytes: all.filter((item) => initial.some((script) => item.relative.endsWith(script))).reduce((sum, item) => sum + item.bytes, 0), maximumAssetBytes: Math.max(0, ...all.map((item) => item.bytes)), fileCount: all.length };
const budgets = { totalBytes: 7_000_000, initialJavaScriptBytes: 750_000, maximumAssetBytes: 450_000 };
const failures = Object.entries(budgets).flatMap(([key, value]) => actual[key as keyof typeof actual] <= value ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${value}`]);
const report = { reportVersion: "1.9", releaseProfile: "v1.9-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, budgets, actual, cacheIdentity: "black-soup-v19-ai-language-bridge-rc-1", failures, passed: failures.length === 0 };
writeFileSync(resolve(root, "docs/v1.9-static-performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
