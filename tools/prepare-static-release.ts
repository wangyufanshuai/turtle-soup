import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const profileId = process.env.TURTLE_SOUP_RELEASE_PROFILE ?? "v1.4-internal-rc";
const reportOnly = process.argv.includes("--report-only");
const outDir = resolve(root, process.argv[3] ?? "apps/web/out");
const templatePath = resolve(root, "apps/web/public/sw.js");
const reportPath = resolve(root, process.argv[4] ?? (profileId === "season1-v0.9-stable" ? "docs/v0.9-precache.json" : profileId === "v1.0-internal-rc" ? "docs/v1.0-precache.json" : profileId === "v1.1-internal-rc" ? "docs/v1.1-precache.json" : profileId === "v1.2-internal-rc" ? "docs/v1.2-precache.json" : profileId === "v1.3-public-preview" ? "docs/v1.3-precache.json" : profileId === "v1.5-internal-rc" ? "docs/v1.5-precache.json" : profileId === "v1.6-internal-rc" ? "docs/v1.6-precache.json" : profileId === "v1.7-internal-rc" ? "docs/v1.7-precache.json" : profileId === "v1.8-internal-rc" ? "docs/v1.8-precache.json" : profileId === "v1.9-internal-rc" ? "docs/v1.9-precache.json" : profileId === "v2.0-internal-rc" ? "docs/v2.0-precache.json" : profileId === "v2.1-internal-rc" ? "docs/v2.1-precache.json" : profileId === "v2.2-internal-rc" ? "docs/v2.2-precache.json" : profileId === "v2.3-internal-rc" ? "docs/v2.3-precache.json" : profileId === "v2.4-internal-rc" ? "docs/v2.4-precache.json" : profileId === "v2.5-internal-rc" ? "docs/v2.5-precache.json" : "docs/v1.4-precache.json"));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function requestPath(path: string): string {
  const name = relative(outDir, path).split(sep).join("/");
  if (name === "index.html") return "/";
  if (name.endsWith("/index.html")) return `/${name.slice(0, -"index.html".length)}`;
  return `/${name}`;
}

for (const path of files(outDir)) if (path.endsWith(".map")) unlinkSync(path);

const entries = files(outDir)
  .filter((path) => !path.endsWith("sw.js") && !path.endsWith(".map"))
  .map((path) => ({ path: requestPath(path), bytes: statSync(path).size }))
  .sort((a, b) => a.path.localeCompare(b.path));
const precache = entries.map((entry) => entry.path);
const template = readFileSync(templatePath, "utf8");
const cacheName = profileId === "season1-v0.9-stable" ? "black-soup-v09-gm1" : profileId === "v1.0-internal-rc" ? "black-soup-v10-internal-rc1" : profileId === "v1.1-internal-rc" ? "black-soup-v11-internal-rc1" : profileId === "v1.2-internal-rc" ? "black-soup-v12-internal-rc1" : profileId === "v1.3-public-preview" ? "black-soup-v13-preview-1" : profileId === "v1.5-internal-rc" ? "black-soup-v15-golden-rc-1" : profileId === "v1.6-internal-rc" ? "black-soup-v16-internal-rc-1" : profileId === "v1.7-internal-rc" ? "black-soup-v17-golden-path-rc-1" : profileId === "v1.8-internal-rc" ? "black-soup-v18-golden-nine-hardening-rc-1" : profileId === "v1.9-internal-rc" ? "black-soup-v19-ai-language-bridge-rc-1" : profileId === "v2.0-internal-rc" ? "black-soup-v20-autonomous-experience-rc-1" : profileId === "v2.1-internal-rc" ? "black-soup-v21-experience-continuity-rc-1" : profileId === "v2.2-internal-rc" ? "black-soup-v22-cognitive-friction-rc-1" : profileId === "v2.3-internal-rc" ? "black-soup-v23-resolution-payoff-rc-1" : profileId === "v2.4-internal-rc" ? "black-soup-v24-investigation-rhythm-rc-1" : profileId === "v2.5-internal-rc" ? "black-soup-v25-season5-content-rc" : "black-soup-v14-internal-rc-1";
const serviceWorker = template
  .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "${cacheName}";`)
  .replace(/const CACHE_PREFIX = "[^"]+";/, `const CACHE_PREFIX = "${cacheName.slice(0, cacheName.lastIndexOf("-") + 1)}";`)
  .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(precache, null, 2)};`);
if (serviceWorker === template) throw new Error("Service Worker PRECACHE marker was not found");
if (!reportOnly) writeFileSync(resolve(outDir, "sw.js"), serviceWorker, "utf8");

const report = {
  reportVersion: profileId === "season1-v0.9-stable" ? "0.9" : profileId === "v1.0-internal-rc" ? "1.0" : profileId === "v1.1-internal-rc" ? "1.1" : profileId === "v1.2-internal-rc" ? "1.2" : profileId === "v1.3-public-preview" ? "1.3" : profileId === "v1.5-internal-rc" ? "1.5" : profileId === "v1.6-internal-rc" ? "1.6" : profileId === "v1.7-internal-rc" ? "1.7" : profileId === "v1.8-internal-rc" ? "1.8" : profileId === "v1.9-internal-rc" ? "1.9" : profileId === "v2.0-internal-rc" ? "2.0" : profileId === "v2.1-internal-rc" ? "2.1" : profileId === "v2.2-internal-rc" ? "2.2" : profileId === "v2.3-internal-rc" ? "2.3" : profileId === "v2.4-internal-rc" ? "2.4" : profileId === "v2.5-internal-rc" ? "2.5" : "1.4",
  releaseProfile: profileId,
  generatedAt: new Date().toISOString(),
  cacheName,
  entryCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  manifestHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  entries,
  passed: precache.includes("/") && precache.includes("/case/c01-cold-room-knock/") && precache.some((path) => path.startsWith("/_next/static/")),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, cacheName: report.cacheName, entryCount: report.entryCount, totalBytes: report.totalBytes, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
