import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "."), outDir = resolve(root, "apps/web/out");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const all = existsSync(outDir) ? files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size })) : [];
const index = existsSync(resolve(outDir, "index.html")) ? readFileSync(resolve(outDir, "index.html"), "utf8") : "";
const initialNames = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ""));
const initialFiles = all.filter((item) => initialNames.some((script) => item.relative.endsWith(script)));
const initialText = initialFiles.filter((item) => item.ext === ".js").map((item) => readFileSync(item.path, "utf8")).join("\n");
const deferredContracts = {
  questionRouterNetworkDeferred: !initialText.includes("严格遵守候选枚举"),
  hostRewriteNetworkDeferred: !initialText.includes("只改写公开的确定性主持文本"),
  evidenceInspectorDeferred: !initialText.includes("检查观察，再决定是否加入我的证明"),
};
const actual = { totalBytes: all.reduce((sum, item) => sum + item.bytes, 0), initialJavaScriptBytes: initialFiles.reduce((sum, item) => sum + item.bytes, 0), maximumAssetBytes: Math.max(0, ...all.map((item) => item.bytes)), fileCount: all.length, initialScriptCount: initialFiles.length };
const budgets = { totalBytes: 7_000_000, initialJavaScriptBytes: 700_000, maximumAssetBytes: 450_000 };
const failures = [...Object.entries(budgets).flatMap(([key, value]) => actual[key as keyof typeof actual] <= value ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${value}`]), ...Object.entries(deferredContracts).flatMap(([key, value]) => value ? [] : [`${key}: heavy optional feature entered initial JavaScript`])];
const report = { reportVersion: "2.0", releaseProfile: "v2.0-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, budgets, actual, deferredContracts, cacheIdentity: "black-soup-v20-autonomous-experience-rc-1", failures, passed: failures.length === 0 };
writeFileSync(resolve(root, "docs/v2.0-static-performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
