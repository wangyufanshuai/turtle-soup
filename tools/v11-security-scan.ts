import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
const root = resolve(process.argv[2] ?? ".");
const reportPath = resolve(root, "docs/v1.1-security-scan.json");
const entries = loadReleaseContent(root, "v1.1-internal-rc").entries;
const cases = entries.map(loadCaseFile);
const hidden = cases.flatMap((file) => [file.solutionCertificate.canonicalHypothesisId, ...file.facts.map((fact) => fact.id), ...file.events.map((event) => event.id), ...(file.solutionCertificate.proofObligations ?? []).map((item) => item.id)]);
const targets = [{ name: "static-output", path: resolve(root, "apps/web/out") }].filter((target) => existsSync(target.path));
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const results = targets.map((target) => { const output = files(target.path); const textFiles = output.filter((path) => [".html", ".js", ".json", ".css", ".txt", ".webmanifest"].includes(extname(path).toLowerCase())); const content = textFiles.map((path) => readFileSync(path, "utf8")); const truthFiles = content.filter((text) => text.includes("solutionCertificate") || hidden.some((id) => text.includes(id))).length; const maps = output.filter((path) => path.endsWith(".map")).length; const remote = content.filter((text) => /api\.openai\.com|google-analytics|segment\.io|mixpanel|sentry\.io/i.test(text)).length; const failures = [...(truthFiles ? [] : ["no truth-bearing worker chunk"]), ...(maps ? [`${maps} source maps shipped`] : []), ...(remote ? [`${remote} remote tracking/API references`] : [])]; return { name: target.name, files: output.length, truthBearingTextFiles: truthFiles, sourceMaps: maps, remoteReferences: remote, failures, passed: failures.length === 0 }; });
const report = { reportVersion: "1.1", generatedAt: new Date().toISOString(), releaseProfile: "v1.1-internal-rc", qualification: "Worker isolation and static scans reduce accidental leaks; offline truth is not DRM.", hiddenIdentifierCount: hidden.length, targets: results, passed: results.length > 0 && results.every((item) => item.passed) };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8"); console.log(JSON.stringify({ reportPath, targets: results, passed: report.passed }, null, 2)); if (!report.passed) process.exitCode = 1;
