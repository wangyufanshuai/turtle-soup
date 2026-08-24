import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outputDir = resolve(root, "output/playwright/v07");
const caseIds = [
  "c01-cold-room-knock", "c02-snow-route", "c03-second-shadow", "c04-unpostable-reply",
  "c05-third-lamp", "c06-nonexistent-ticket", "c07-key-returns", "c08-unclaimed-recording",
  "c09-rain-room", "c10-single-ring", "c11-borrowed-signature", "c12-zero-floor-elevator",
] as const;
const states = ["opening", "question", "evidence", "wrong-theory", "replay"] as const;

function inspectPng(path: string) {
  if (!existsSync(path)) return { exists: false, width: 0, height: 0, hash: "" };
  const bytes = readFileSync(path);
  const png = bytes.length >= 24 && bytes.subarray(1, 4).toString("ascii") === "PNG";
  return {
    exists: true,
    width: png ? bytes.readUInt32BE(16) : 0,
    height: png ? bytes.readUInt32BE(20) : 0,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}

const results = caseIds.map((caseId) => {
  const stateFiles = states.map((state) => ({
    state,
    path: `${caseId}-${state}-1440.png`,
    ...inspectPng(resolve(outputDir, `${caseId}-${state}-1440.png`)),
  }));
  const responsive = [
    { viewport: "1280x800", path: `${caseId}-opening-1280.png`, ...inspectPng(resolve(outputDir, `${caseId}-opening-1280.png`)) },
    { viewport: "390x844", path: `${caseId}-opening-390.png`, ...inspectPng(resolve(outputDir, `${caseId}-opening-390.png`)) },
  ];
  const stateHashes = stateFiles.map((item) => item.hash).filter(Boolean);
  const errors = [
    ...stateFiles.filter((item) => !item.exists).map((item) => `missing ${item.path}`),
    ...stateFiles.filter((item) => item.exists && (item.width !== 1440 || item.height !== 900)).map((item) => `wrong dimensions ${item.path}: ${item.width}x${item.height}`),
    ...responsive.filter((item) => !item.exists).map((item) => `missing ${item.path}`),
    ...responsive.filter((item) => item.viewport === "1280x800" && item.exists && (item.width !== 1280 || item.height !== 800)).map((item) => `wrong dimensions ${item.path}: ${item.width}x${item.height}`),
    ...responsive.filter((item) => item.viewport === "390x844" && item.exists && (item.width !== 390 || item.height !== 844)).map((item) => `wrong dimensions ${item.path}: ${item.width}x${item.height}`),
    ...(new Set(stateHashes).size === states.length ? [] : ["representative state screenshots are not all visually distinct"]),
  ];
  return { caseId, stateFiles, responsive, uniqueStateImages: new Set(stateHashes).size, errors, passed: errors.length === 0 };
});

const leakedFixturePaths = [
  resolve(root, "apps/web/public/browser-save-fixtures.json"),
  resolve(outputDir, "browser-save-fixtures.json"),
].filter(existsSync);
const report = {
  reportVersion: "0.7",
  generatedAt: new Date().toISOString(),
  mode: "browser-artifact-integrity",
  expectedCases: caseIds.length,
  expectedStateScreenshots: caseIds.length * states.length,
  expectedResponsiveScreenshots: caseIds.length * 2,
  leakedFixturePaths,
  passed: results.every((item) => item.passed) && leakedFixturePaths.length === 0,
  results,
};
const reportPath = resolve(root, "docs/v0.7-browser-artifacts.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, passed: report.passed, cases: results.length, stateScreenshots: caseIds.length * states.length, responsiveScreenshots: caseIds.length * 2, failures: results.filter((item) => !item.passed).map((item) => ({ caseId: item.caseId, errors: item.errors })), leakedFixturePaths }, null, 2));
if (!report.passed) process.exitCode = 1;
