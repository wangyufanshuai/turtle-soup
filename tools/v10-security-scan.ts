import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const reportPath = resolve(root, "docs/v1.0-security-scan.json");
const { entries } = loadReleaseContent(root, "v1.0-internal-rc");
const cases = entries.map(loadCaseFile);
const hidden = cases.flatMap((caseFile) => [caseFile.solutionCertificate.canonicalHypothesisId, ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id), ...(caseFile.solutionCertificate.proofObligations ?? []).map((item) => item.id)]);
const targets = [{ name: "static-output", path: resolve(root, "apps/web/out") }, { name: "v1.0-web-pwa", path: resolve(root, "dist/v1.0-internal-rc-web-pwa") }].filter((target) => existsSync(target.path));
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }

const results = targets.map((target) => {
  const output = files(target.path);
  const textFiles = output.filter((path) => [".html", ".js", ".json", ".css", ".txt", ".webmanifest"].includes(extname(path).toLowerCase()));
  const content = new Map(textFiles.map((path) => [path, readFileSync(path, "utf8")]));
  const truthFiles = textFiles.filter((path) => { const value = content.get(path) ?? ""; return value.includes("solutionCertificate") || hidden.some((id) => value.includes(id)); });
  const html = textFiles.filter((path) => path.endsWith(".html")).map((path) => content.get(path) ?? "").join("\n");
  const directTruth = truthFiles.filter((path) => html.includes(`src="/${relative(target.path, path).split(sep).join("/")}`));
  const nonTruthLeaks = textFiles.filter((path) => !truthFiles.includes(path)).filter((path) => hidden.some((id) => (content.get(path) ?? "").includes(id)));
  const sourceMaps = output.filter((path) => path.endsWith(".map"));
  const fixtures = output.filter((path) => /test-vector|playwright|browser-save|fixture/i.test(path));
  const remote = textFiles.filter((path) => /google-analytics|segment\.io|mixpanel|sentry\.io|api\.openai\.com/i.test(content.get(path) ?? ""));
  const failures = [...(truthFiles.length ? [] : ["no isolated truth-bearing worker chunks"]), ...directTruth.map((path) => `truth chunk directly executed: ${relative(target.path, path)}`), ...nonTruthLeaks.map((path) => `hidden id outside truth chunk: ${relative(target.path, path)}`), ...sourceMaps.map((path) => `source map shipped: ${relative(target.path, path)}`), ...fixtures.map((path) => `fixture shipped: ${relative(target.path, path)}`), ...remote.map((path) => `remote tracking endpoint: ${relative(target.path, path)}`)];
  return { name: target.name, files: output.length, truthBearingFiles: truthFiles.map((path) => relative(target.path, path).split(sep).join("/")), directTruth: directTruth.length, nonTruthLeaks: nonTruthLeaks.length, sourceMaps: sourceMaps.length, fixtures: fixtures.length, remote: remote.length, failures, passed: failures.length === 0 };
});
const report = { reportVersion: "1.0", generatedAt: new Date().toISOString(), releaseProfile: "v1.0-internal-rc", qualification: "Worker isolation prevents accidental spoilers; offline content remains reverse-engineerable and this is not DRM.", hiddenIdentifierCount: hidden.length, targets: results, passed: results.length > 0 && results.every((item) => item.passed) };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, targets: results.map((item) => ({ name: item.name, files: item.files, truthFiles: item.truthBearingFiles.length, passed: item.passed })), passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
