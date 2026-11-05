import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileTree, loadRun, pendingGate, writeReport } from "./lib/v212-evidence.ts";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(".");
const identity = loadRun(root);
const tree = fileTree(root, "apps/web/out");
if (!identity.buildHash) throw new Error("No verified v2.12 static directory; old builds cannot be audited as v2.12");
const { entries } = loadReleaseContent(root, identity.releaseProfile);
const home = readFileSync(resolve(root, "apps/web/out/index.html"), "utf8");
const scripts = [...new Set([...home.matchAll(/<script[^>]+src="([^"]+)"/gu)].map((match) => match[1]))];
const scriptFiles = scripts.map((url) => ({ url, file: tree.find((item) => `/${item.path}` === url.split("?")[0]) }));
const bytes = scriptFiles.reduce((sum, item) => sum + (item.file?.bytes ?? 0), 0);
const sw = readFileSync(resolve(root, "apps/web/out/sw.js"), "utf8");
const precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/u)?.[1] ?? "[]") as string[];
const routeFiles = entries.map((entry) => ({ caseId: entry.id, exists: existsSync(resolve(root, `apps/web/out/case/${entry.id}/index.html`)) }));
const known = (path: string) => tree.find((item) => item.path === (path === "/" ? "index.html" : path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1)));
const missingPrecache = precache.filter((path) => !known(path));
const gates = [
  { id: "static-routes", coverage: "static", passed: routeFiles.every((item) => item.exists), scope: `${entries.length} selected manifest routes exist on disk; HTTP status and Worker startup NOT measured`, evidence: routeFiles },
  { id: "home-script-budget", coverage: "static", passed: scripts.length > 0 && scriptFiles.every((item) => item.file) && bytes <= 700_000, scope: "Uncompressed bytes of home script src files only; excludes Worker/dynamic chunks/media/SW prefetch and is NOT total first-load traffic", evidence: scriptFiles.map((item) => ({ url: item.url, bytes: item.file?.bytes ?? null })), bytes, budget: 700_000 },
  { id: "maximum-file", coverage: "static", passed: tree.every((item) => item.bytes <= 450_000), scope: "Largest uncompressed static file on disk", evidence: [...tree].sort((a, b) => b.bytes - a.bytes).slice(0, 5), budget: 450_000 },
  { id: "precache-resources", coverage: "static", passed: precache.length > 0 && missingPrecache.length === 0 && precache.includes("/"), scope: "Full-package pre-cache list is locally complete; service-worker installation and offline startup NOT measured", entries: precache.length, scheduledUncompressedBytes: precache.reduce((sum, path) => sum + (known(path)?.bytes ?? 0), 0), missing: missingPrecache, evidence: ["apps/web/out/sw.js"] },
  pendingGate("initial-network-transfer", "Actual cold browser request waterfall including service worker installation", "Not inferable from static file sizes; current implementation pre-caches the full package"),
  pendingGate("interaction-latency", "Visible action feedback p95 / long tasks on specified devices"),
];
writeReport(root, "docs/v2.12-static-performance.json", { ...identity, measuredAt: new Date().toISOString(), scope: "Static artifact checks only", coverage: "static", staticChecksPassed: gates.filter((gate) => gate.coverage !== "not-run").every((gate) => gate.passed), passed: null, totalUncompressedBytes: tree.reduce((sum, item) => sum + item.bytes, 0), fileCount: tree.length, gates, qualification: "No claims about current-case-only downloads, first-load transferred bytes, TTI, INP or offline execution" });
console.log(JSON.stringify({ bytes, files: tree.length, routes: routeFiles.length, preCache: precache.length, staticChecksPassed: gates.filter((gate) => gate.coverage !== "not-run").every((gate) => gate.passed) }, null, 2));
if (gates.some((gate) => gate.passed === false)) process.exitCode = 1;
