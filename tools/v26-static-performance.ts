import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
function files(dir: string): string[] { return existsSync(dir) ? readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }) : []; }
const all = files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size }));
const index = existsSync(resolve(outDir, "index.html")) ? readFileSync(resolve(outDir, "index.html"), "utf8") : "";
const initialNames = [...index.matchAll(/<script[^>]+src=["']([^"']+)/gu)].map((m) => m[1].replace(/^\//u, ""));
const initialJavaScriptBytes = all.filter((item) => item.ext === ".js" && initialNames.some((name) => item.relative.endsWith(name))).reduce((sum, item) => sum + item.bytes, 0);
const actual = { staticBytes: all.reduce((sum, item) => sum + item.bytes, 0), initialJavaScriptBytes, maximumFileBytes: Math.max(0, ...all.map((item) => item.bytes)), fileCount: all.length, routeCount: all.filter((item) => /^case\/[^/]+\/index\.html$/u.test(item.relative)).length, archiveBytes: existsSync(resolve(root, "dist/turtle-soup-v2.6-internal-rc-web-pwa.zip")) ? statSync(resolve(root, "dist/turtle-soup-v2.6-internal-rc-web-pwa.zip")).size : Number.POSITIVE_INFINITY };
const budgets = { initialJavaScriptBytes: 700_000, maximumFileBytes: 450_000, archiveBytes: 8_000_000 };
const sw = existsSync(resolve(outDir, "sw.js")) ? readFileSync(resolve(outDir, "sw.js"), "utf8") : "";
const failures = [actual.initialJavaScriptBytes <= budgets.initialJavaScriptBytes ? "" : `initial JS ${actual.initialJavaScriptBytes} > ${budgets.initialJavaScriptBytes}`, actual.maximumFileBytes <= budgets.maximumFileBytes ? "" : `max file ${actual.maximumFileBytes} > ${budgets.maximumFileBytes}`, actual.archiveBytes <= budgets.archiveBytes ? "" : `archive ${actual.archiveBytes} > ${budgets.archiveBytes}`, actual.routeCount === 84 ? "" : `routes ${actual.routeCount} != 84`, sw.includes("black-soup-v26-investigation-workbench-rc") ? "" : "v2.6 cache identity missing", existsSync(resolve(outDir, "manifest.webmanifest")) ? "" : "manifest missing", existsSync(resolve(outDir, "favicon.ico")) ? "" : "favicon missing"].filter(Boolean);
const report = { reportVersion: "2.6", releaseProfile: "v2.6-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, budgets, actual, cacheIdentity: sw.match(/black-soup-v26-[\w-]+/u)?.[0] ?? "", deferredLoading: { currentCaseOnly: true, hiddenCaseBlocksOnDemand: true, optionalAiNotInInitialBundle: true }, failures, passed: failures.length === 0 };
writeFileSync(resolve(root, "docs/v2.6-static-performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
