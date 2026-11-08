import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const profileId = process.env.TURTLE_SOUP_RELEASE_PROFILE ?? "v2.12-internal-rc";
const reportOnly = process.argv.includes("--report-only");
const outDir = resolve(root, process.argv[3] ?? "apps/web/out");
const templatePath = resolve(root, "apps/web/public/sw.js");
const releaseVersion = profileId === "season1-v0.9-stable" ? "0.9" : profileId.match(/^v(\d+\.\d+)/u)?.[1] ?? "1.4";
const reportPath = resolve(root, process.argv[4] ?? `docs/v${releaseVersion}-precache.json`);
const CACHE_IDENTITIES: Readonly<Record<string, string>> = {
  "season1-v0.9-stable": "black-soup-v09-gm1", "v1.0-internal-rc": "black-soup-v10-internal-rc1", "v1.1-internal-rc": "black-soup-v11-internal-rc1",
  "v1.2-internal-rc": "black-soup-v12-internal-rc1", "v1.3-public-preview": "black-soup-v13-preview-1", "v1.4-internal-rc": "black-soup-v14-internal-rc-1",
  "v1.5-internal-rc": "black-soup-v15-golden-rc-1", "v1.6-internal-rc": "black-soup-v16-internal-rc-1", "v1.7-internal-rc": "black-soup-v17-golden-path-rc-1",
  "v1.8-internal-rc": "black-soup-v18-golden-nine-hardening-rc-1", "v1.9-internal-rc": "black-soup-v19-ai-language-bridge-rc-1", "v2.0-internal-rc": "black-soup-v20-autonomous-experience-rc-1",
  "v2.1-internal-rc": "black-soup-v21-experience-continuity-rc-1", "v2.2-internal-rc": "black-soup-v22-cognitive-friction-rc-1", "v2.3-internal-rc": "black-soup-v23-resolution-payoff-rc-1",
  "v2.4-internal-rc": "black-soup-v24-investigation-rhythm-rc-1", "v2.5-internal-rc": "black-soup-v25-season5-content-rc", "v2.6-internal-rc": "black-soup-v26-investigation-workbench-rc",
  "v2.7-internal-rc": "black-soup-v27-player-first-rc", "v2.8-internal-rc": "black-soup-v28-guided-investigation-rc", "v2.9-internal-rc": "black-soup-v29-language-recovery-rc", "v2.10-internal-rc": "black-soup-v210-completed-archive-rc",
  "v2.11-internal-rc": "black-soup-v211-action-loop-rc",
  "v2.12-internal-rc": "black-soup-v212-integrity-investigation-rc",
};

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
  .map((path) => ({ path: requestPath(path), bytes: statSync(path).size, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") }))
  .sort((a, b) => a.path.localeCompare(b.path));
// Install only what the shell and the first case need; the rest of the
// 84-case library is cached on first use or via an explicit full download.
const FIRST_CASE = "c01-cold-room-knock";
const isLazy = (path: string) =>
  (/^\/case\//u.test(path) && !path.startsWith(`/case/${FIRST_CASE}/`)) ||
  (/^\/assets\/cases\//u.test(path) && !path.startsWith("/assets/cases/c01/")) ||
  (/^\/assets\/home-cinema\/c\d{2}-/u.test(path) && !path.startsWith(`/assets/home-cinema/${FIRST_CASE}`)) ||
  (/^\/scene-[^/]+\.svg$/u.test(path) && path !== "/scene-cold-room.svg") ||
  /^\/assets\/v14\//u.test(path) ||
  /^\/workshop\//u.test(path);
const precache = entries.filter((entry) => !isLazy(entry.path)).map((entry) => entry.path);
const lazy = entries.filter((entry) => isLazy(entry.path)).map((entry) => entry.path);
const template = readFileSync(templatePath, "utf8");
const cacheIdentity = CACHE_IDENTITIES[profileId] ?? `black-soup-${profileId.replace(/[^a-z0-9]+/giu, "-")}`;
// A homepage or image revision within the same release must install into a
// fresh cache; otherwise cache-first navigation keeps serving the old UI.
const manifestHash = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
const cacheName = `${cacheIdentity}-${manifestHash.slice(0, 12)}`;
const serviceWorker = template
  .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "${cacheName}";`)
  .replace(/const CACHE_PREFIX = "[^"]+";/, `const CACHE_PREFIX = "${cacheIdentity.slice(0, cacheIdentity.lastIndexOf("-") + 1)}";`)
  .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(precache, null, 2)};`)
  .replace(/const LAZY = \[\];/, `const LAZY = ${JSON.stringify(lazy)};`);
if (serviceWorker === template) throw new Error("Service Worker PRECACHE marker was not found");
if (!reportOnly) writeFileSync(resolve(outDir, "sw.js"), serviceWorker, "utf8");

const report = {
  reportVersion: releaseVersion,
  releaseProfile: profileId,
  generatedAt: new Date().toISOString(),
  cacheName,
  entryCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  installEntryCount: precache.length,
  installBytes: entries.filter((entry) => !isLazy(entry.path)).reduce((sum, entry) => sum + entry.bytes, 0),
  lazyEntryCount: lazy.length,
  manifestHash,
  entries,
  passed: precache.includes("/") && precache.includes("/case/c01-cold-room-knock/") && precache.some((path) => path.startsWith("/_next/static/")),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, cacheName: report.cacheName, entryCount: report.entryCount, totalBytes: report.totalBytes, installEntryCount: report.installEntryCount, installBytes: report.installBytes, lazyEntryCount: report.lazyEntryCount, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
