import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const entries = loadReleaseContent(root, "v1.6-internal-rc").entries;
const cases = entries.map(loadCaseFile);
const hidden = cases.flatMap((file) => [file.solutionCertificate.canonicalHypothesisId, ...file.facts.map((fact) => fact.id), ...file.events.map((event) => event.id), ...(file.solutionCertificate.proofObligations ?? []).map((item) => item.id)]);
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const output = resolve(root, "apps/web/out");
const texts = existsSync(output) ? files(output).filter((path) => [".html", ".js", ".json", ".css", ".txt", ".webmanifest"].includes(extname(path).toLowerCase())).map((path) => ({ path, text: readFileSync(path, "utf8") })) : [];
const truthBearingTextFiles = texts.filter(({ text }) => text.includes("solutionCertificate") || hidden.some((id) => id && text.includes(id))).length;
const sourceMaps = existsSync(output) ? files(output).filter((path) => path.endsWith(".map")).length : 0;
const remoteReferences = texts.filter(({ text }) => /api\.openai\.com|google-analytics|segment\.io|mixpanel|sentry\.io|plausible\.io/i.test(text)).length;
const publicHtmlLeaks = texts.filter(({ path, text }) => path.endsWith(".html") && hidden.some((id) => id && text.includes(id))).map((item) => item.path);
const publicReportText = ["docs/v1.6-blackbox-synthetic.json", "docs/v1.6-language-coverage.json", "docs/v1.6-narrative-quality.json", "docs/v1.6-browser-matrix.json"].filter((path) => existsSync(resolve(root, path))).map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
const reportLeakTokens = ["solutionCertificate", "canonicalHypothesisId", "requiredFactIds", "minimumProofSets"].filter((token) => publicReportText.includes(token));
const failures = [
  truthBearingTextFiles ? "" : "no truth-bearing worker chunk",
  sourceMaps ? `${sourceMaps} source maps shipped` : "",
  remoteReferences ? `${remoteReferences} remote references found` : "",
  publicHtmlLeaks.length ? `${publicHtmlLeaks.length} public HTML truth leaks` : "",
  reportLeakTokens.length ? `quality reports contain forbidden schema names: ${reportLeakTokens.join(", ")}` : "",
].filter(Boolean);
const report = { reportVersion: "1.6", releaseProfile: "v1.6-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, hiddenIdentifierCount: hidden.length, targets: [{ name: "static-output", files: texts.length, truthBearingTextFiles, sourceMaps, remoteReferences, publicHtmlLeaks, failures, passed: failures.length === 0 }], boundaries: { fullCaseFile: "worker-only", blackBoxRunnerInputs: ["PlayerProjection", "GameEvent", "SaveEnvelope"], saveSchemaVersion: 1, remoteAnalytics: false, remoteAI: false }, passed: failures.length === 0, qualification: "静态扫描降低意外剧透与远程依赖风险；离线内容仍可被主动反编译，这不是 DRM。" };
writeFileSync(resolve(root, "docs/v1.6-security-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ files: texts.length, truthBearingTextFiles, publicHtmlLeaks: publicHtmlLeaks.length, remoteReferences, reportLeakTokens, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
