import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import type { CaseFile } from "../packages/mystery-core/src/types.ts";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const reportPath = resolve(root, "docs/v0.9-security-scan.json");
const caseDir = resolve(root, "content/zh/cases");
const scanTargets = [
  { name: "static-output", path: outDir },
  { name: "web-pwa-package", path: resolve(root, "dist/web-pwa") },
  { name: "itch-html5-package", path: resolve(root, "dist/itch-html5") },
  { name: "c01-fun-gate-package", path: resolve(root, "dist/c01-fun-gate") },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const freezeManifest = JSON.parse(readFileSync(resolve(caseDir, "manifest.v0.6.json"), "utf8")) as { cases: Array<{ file: string }> };
const caseFiles = freezeManifest.cases.map((entry) => JSON.parse(readFileSync(resolve(caseDir, entry.file), "utf8")) as CaseFile);
const hiddenIds = caseFiles.flatMap((caseFile) => [
  caseFile.solutionCertificate.canonicalHypothesisId,
  ...caseFile.facts.map((fact) => fact.id),
  ...caseFile.events.map((event) => event.id),
]);
function scanTarget(target: { name: string; path: string }) {
  if (!existsSync(target.path)) {
    return {
      name: target.name,
      path: relative(root, target.path).split(sep).join("/"),
      outputFileCount: 0,
      truthBearingFiles: [],
      directlyExecutedTruthFiles: [],
      nonTruthLeakFiles: [],
      sourceMaps: 0,
      fixtureFiles: [],
      remoteTrackingMatches: [],
      failures: ["release target is missing"],
      passed: false,
    };
  }
  const outputFiles = files(target.path);
  const textFiles = outputFiles.filter((path) => [".html", ".js", ".json", ".webmanifest", ".txt", ".css"].includes(extname(path).toLowerCase()));
  const contents = new Map(textFiles.map((path) => [path, readFileSync(path, "utf8")]));
  const truthBearingFiles = textFiles.filter((path) => {
    const content = contents.get(path) ?? "";
    return content.includes("solutionCertificate") || hiddenIds.filter((id) => content.includes(id)).length >= 5;
  });
  const html = textFiles.filter((path) => path.endsWith(".html")).map((path) => contents.get(path) ?? "").join("\n");
  const directlyExecutedTruthFiles = truthBearingFiles.filter((path) => {
    const publicPath = `/${relative(target.path, path).split(sep).join("/")}`;
    return html.includes(`src="${publicPath}"`);
  });
  const nonTruthLeakFiles = textFiles.filter((path) => !truthBearingFiles.includes(path)).flatMap((path) => {
    const content = contents.get(path) ?? "";
    const forbidden = ["solutionCertificate", "canonicalHypothesisId", ...hiddenIds];
    return forbidden.some((value) => content.includes(value)) ? [relative(target.path, path).split(sep).join("/")] : [];
  });
  const sourceMaps = outputFiles.filter((path) => path.endsWith(".map"));
  const fixtureFiles = outputFiles.filter((path) => /fixture|test-vector|browser-save|playwright/i.test(path));
  const remoteTrackingMatches = textFiles.flatMap((path) => {
    const content = contents.get(path) ?? "";
    return /google-analytics|segment\.io|mixpanel|sentry\.io|api\.openai\.com/i.test(content)
      ? [relative(target.path, path).split(sep).join("/")]
      : [];
  });
  const failures = [
    ...(truthBearingFiles.length === 0 ? ["no isolated truth-bearing worker bundle found"] : []),
    ...directlyExecutedTruthFiles.map((path) => `truth-bearing bundle directly executed by HTML: ${relative(target.path, path)}`),
    ...nonTruthLeakFiles.map((path) => `hidden identifier leaked outside truth-bearing bundle: ${path}`),
    ...sourceMaps.map((path) => `source map shipped: ${relative(target.path, path)}`),
    ...fixtureFiles.map((path) => `test fixture shipped: ${relative(target.path, path)}`),
    ...remoteTrackingMatches.map((path) => `remote tracking/network endpoint shipped: ${path}`),
  ];
  return {
    name: target.name,
    path: relative(root, target.path).split(sep).join("/"),
    outputFileCount: outputFiles.length,
    truthBearingFiles: truthBearingFiles.map((path) => relative(target.path, path).split(sep).join("/")),
    directlyExecutedTruthFiles: directlyExecutedTruthFiles.map((path) => relative(target.path, path).split(sep).join("/")),
    nonTruthLeakFiles,
    sourceMaps: sourceMaps.length,
    fixtureFiles: fixtureFiles.map((path) => relative(target.path, path).split(sep).join("/")),
    remoteTrackingMatches,
    failures,
    passed: failures.length === 0,
  };
}

const targets = scanTargets.map(scanTarget);
const failures = targets.flatMap((target) => target.failures.map((failure) => `${target.name}: ${failure}`));
const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "static-release-anti-leak-scan",
  qualification: "Offline content remains reverse-engineerable. This scan enforces isolation and accidental-spoiler boundaries; it is not DRM.",
  targets,
  failures,
  passed: failures.length === 0,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, targets: targets.map((target) => ({ name: target.name, files: target.outputFileCount, truthBearingFiles: target.truthBearingFiles, passed: target.passed })), failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
