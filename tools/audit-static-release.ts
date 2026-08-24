import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const reportPath = resolve(root, "docs/v0.9-static-performance.json");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const all = files(outDir).map((path) => ({
  path,
  relativePath: relative(outDir, path).split(sep).join("/"),
  extension: extname(path).toLowerCase(),
  bytes: statSync(path).size,
}));
const sum = (extension: string) => all.filter((file) => file.extension === extension).reduce((total, file) => total + file.bytes, 0);
const budgets = {
  totalBytes: 2_500_000,
  javascriptBytes: 1_400_000,
  cssBytes: 100_000,
  maximumAssetBytes: 450_000,
  maximumHtmlBytes: 100_000,
  sourceMaps: 0,
};
const actual = {
  totalBytes: all.reduce((total, file) => total + file.bytes, 0),
  javascriptBytes: sum(".js"),
  cssBytes: sum(".css"),
  maximumAssetBytes: Math.max(...all.map((file) => file.bytes)),
  maximumHtmlBytes: Math.max(...all.filter((file) => file.extension === ".html").map((file) => file.bytes)),
  sourceMaps: all.filter((file) => file.extension === ".map").length,
};
const serviceWorker = readFileSync(resolve(outDir, "sw.js"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(outDir, "manifest.webmanifest"), "utf8")) as {
  id?: string; start_url?: string; scope?: string; display?: string; icons?: Array<{ src?: string; sizes?: string }>;
};
const installHandler = serviceWorker.match(/addEventListener\("install"[\s\S]*?\n}\);/)?.[0] ?? "";
const updatePolicy = {
  cacheName: serviceWorker.match(/const CACHE_NAME = "([^"]+)"/)?.[1] ?? "unknown",
  noImmediateSkipWaiting: !installHandler.includes("skipWaiting"),
  playerConfirmedActivation: /event\.data\?\.type === "SKIP_WAITING"/.test(serviceWorker) && serviceWorker.includes("self.skipWaiting()"),
};
const pwaManifest = {
  id: manifest.id,
  startUrl: manifest.start_url,
  scope: manifest.scope,
  display: manifest.display,
  iconSizes: manifest.icons?.map((icon) => icon.sizes) ?? [],
  iconsPresent: (manifest.icons ?? []).every((icon) => Boolean(icon.src && statSafe(resolve(outDir, icon.src.replace(/^\//, ""))))),
};
const missingFromPrecache = all.filter((file) => file.relativePath !== "sw.js" && file.extension !== ".map").flatMap((file) => {
  const raw = file.relativePath === "index.html" ? "/" : file.relativePath.endsWith("/index.html") ? `/${file.relativePath.slice(0, -"index.html".length)}` : `/${file.relativePath}`;
  return serviceWorker.includes(JSON.stringify(raw)) ? [] : [raw];
});
const failures = Object.entries(budgets).flatMap(([key, budget]) => actual[key as keyof typeof actual] <= budget ? [] : [`${key}: ${actual[key as keyof typeof actual]} > ${budget}`]);
if (missingFromPrecache.length > 0) failures.push(`${missingFromPrecache.length} shipping assets missing from precache`);
if (!updatePolicy.noImmediateSkipWaiting || !updatePolicy.playerConfirmedActivation || updatePolicy.cacheName !== "black-soup-v09-gm1") failures.push("service worker update policy is not v0.9 player-confirmed activation");
if (pwaManifest.id !== "/" || pwaManifest.startUrl !== "/" || pwaManifest.scope !== "/" || pwaManifest.display !== "standalone" || !pwaManifest.iconsPresent || !pwaManifest.iconSizes.includes("192x192") || !pwaManifest.iconSizes.includes("512x512")) failures.push("PWA manifest identity, scope, display or install icons are incomplete");
const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "static-performance-and-precache-budget",
  budgetBasis: "Uncompressed shipping bytes. The 1.4 MB JavaScript ceiling includes the isolated 12-case Worker truth bundle and Next.js compatibility runtime; individual assets remain capped at 450 KB.",
  budgets,
  actual,
  precacheCoverage: { required: all.length - 1 - actual.sourceMaps, missing: missingFromPrecache, percent: missingFromPrecache.length === 0 ? 100 : 0 },
  updatePolicy,
  pwaManifest,
  largestAssets: [...all].sort((a, b) => b.bytes - a.bytes).slice(0, 15).map(({ relativePath, bytes }) => ({ path: relativePath, bytes })),
  failures,
  passed: failures.length === 0,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, actual, precacheCoverage: report.precacheCoverage.percent, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;

function statSafe(path: string) {
  try { return statSync(path).isFile(); } catch { return false; }
}
