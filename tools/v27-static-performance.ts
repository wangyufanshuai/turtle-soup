import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const v28 = process.argv.includes("--v28");
const version = v28 ? "2.8" : "2.7";
const profileId = v28 ? "v2.8-internal-rc" : "v2.7-internal-rc";
const outDir = resolve(root, "apps/web/out");
function files(dir: string): string[] { return existsSync(dir) ? readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }) : []; }
const all = files(outDir).map((path) => ({ path, relative: path.slice(outDir.length + 1).replaceAll("\\", "/"), ext: extname(path).toLowerCase(), bytes: statSync(path).size }));
const index = existsSync(resolve(outDir, "index.html")) ? readFileSync(resolve(outDir, "index.html"), "utf8") : "";
const initialNames = [...index.matchAll(/<script[^>]+src=["']([^"']+)/gu)].map((m) => m[1].replace(/^\//u, ""));
const initialJavaScriptBytes = all.filter((item) => item.ext === ".js" && initialNames.some((name) => item.relative.endsWith(name))).reduce((sum, item) => sum + item.bytes, 0);
const archivePath = resolve(root, `dist/turtle-soup-${profileId}-web-pwa.zip`);
const actual = { staticBytes: all.reduce((sum, item) => sum + item.bytes, 0), initialJavaScriptBytes, maximumFileBytes: Math.max(0, ...all.map((item) => item.bytes)), fileCount: all.length, routeCount: all.filter((item) => /^case\/[^/]+\/index\.html$/u.test(item.relative)).length, archiveBytes: existsSync(archivePath) ? statSync(archivePath).size : Number.POSITIVE_INFINITY };
const budgets = { initialJavaScriptBytes: 700_000, maximumFileBytes: 450_000, archiveBytes: 8_000_000 };
const sw = existsSync(resolve(outDir, "sw.js")) ? readFileSync(resolve(outDir, "sw.js"), "utf8") : "";
const expectedCache = v28 ? "black-soup-v28-guided-investigation-rc" : "black-soup-v27-player-first-rc";
const failures = [actual.initialJavaScriptBytes <= budgets.initialJavaScriptBytes ? "" : `initial JS ${actual.initialJavaScriptBytes} > ${budgets.initialJavaScriptBytes}`, actual.maximumFileBytes <= budgets.maximumFileBytes ? "" : `max file ${actual.maximumFileBytes} > ${budgets.maximumFileBytes}`, actual.archiveBytes <= budgets.archiveBytes ? "" : `archive ${actual.archiveBytes} > ${budgets.archiveBytes}`, actual.routeCount === 84 ? "" : `routes ${actual.routeCount} != 84`, sw.includes(expectedCache) ? "" : `v${version} cache identity missing`, existsSync(resolve(outDir, "manifest.webmanifest")) ? "" : "manifest missing", existsSync(resolve(outDir, "favicon.ico")) ? "" : "favicon missing"].filter(Boolean);
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, budgets, actual, cacheIdentity: sw.match(/black-soup-v2[78]-[\w-]+/u)?.[0] ?? "", deferredLoading: { currentCaseOnly: true, hiddenCaseBlocksOnDemand: true, optionalAiNotInInitialBundle: true }, failures, passed: failures.length === 0 };
writeFileSync(resolve(root, `docs/v${version}-static-performance.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
