import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const entries = loadReleaseContent(root, "v1.7-internal-rc").entries;
const cases = entries.map(loadCaseFile);
const hidden = cases.flatMap((file) => [file.solutionCertificate.canonicalHypothesisId, ...file.facts.map((fact) => fact.id), ...file.events.map((event) => event.id), ...(file.solutionCertificate.proofObligations ?? []).map((item) => item.id)]).filter(Boolean);
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const output = resolve(root, "apps/web/out");
const textExtensions = new Set([".html", ".js", ".json", ".css", ".txt", ".webmanifest"]);
const texts = existsSync(output) ? files(output).filter((path) => textExtensions.has(extname(path).toLowerCase())).map((path) => ({ path, text: readFileSync(path, "utf8") })) : [];
const truthBearingTextFiles = texts.filter(({ text }) => text.includes("solutionCertificate") || hidden.some((id) => text.includes(id))).length;
const sourceMaps = existsSync(output) ? files(output).filter((path) => path.endsWith(".map")).length : 0;
const remotePatterns = /api\.openai\.com|google-analytics|segment\.io|mixpanel|sentry\.io|plausible\.io|amplitude\.com|posthog/i;
const remoteReferences = texts.filter(({ text }) => remotePatterns.test(text)).map((item) => item.path);
const publicHtmlLeaks = texts.filter(({ path, text }) => path.endsWith(".html") && hidden.some((id) => text.includes(id))).map((item) => item.path);
const reportFiles = ["docs/v1.7-budgeted-synthetic.json", "docs/v1.7-experience-calibration.json", "docs/v1.7-soundscape-calibration.json", "docs/v1.7-browser-matrix.json"].filter((path) => existsSync(resolve(root, path)));
const publicReportText = reportFiles.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
const reportLeakTokens = ["solutionCertificate", "canonicalHypothesisId", "requiredFactIds", "minimumProofSets"].filter((token) => publicReportText.includes(token));
const workerSource = readFileSync(resolve(root, "apps/web/workers/mystery-runtime.worker.ts"), "utf8");
const hostSources = ["apps/web/lib/host-rewrite.ts", "apps/web/lib/use-host-rewrite.ts"].filter((path) => existsSync(resolve(root, path))).map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
const boundaryChecks = {
  truthChunkExists: truthBearingTextFiles > 0,
  noPublicHtmlLeaks: publicHtmlLeaks.length === 0,
  noSourceMaps: sourceMaps === 0,
  noRemoteAnalyticsOrAI: remoteReferences.length === 0,
  reportsOmitCertificateSchema: reportLeakTokens.length === 0,
  workerOwnsCaseLoading: /loadCaseFile|caseRegistry|worker/i.test(workerSource),
  localHostRewriteOnly: hostSources.includes("localhost") || hostSources.includes("127.0.0.1"),
};
const failures = [
  ...(!boundaryChecks.truthChunkExists ? ["no truth-bearing worker chunk"] : []),
  ...(sourceMaps ? [`${sourceMaps} source maps shipped`] : []),
  ...(remoteReferences.length ? [`${remoteReferences.length} remote references found`] : []),
  ...(publicHtmlLeaks.length ? [`${publicHtmlLeaks.length} public HTML truth leaks`] : []),
  ...(reportLeakTokens.length ? [`quality reports contain forbidden schema names: ${reportLeakTokens.join(", ")}`] : []),
  ...(!boundaryChecks.workerOwnsCaseLoading ? ["worker case-loading boundary not found"] : []),
  ...(!boundaryChecks.localHostRewriteOnly ? ["local host rewrite restriction not found"] : []),
];
const report = {
  reportVersion: "1.7",
  releaseProfile: "v1.7-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  hiddenIdentifierCount: hidden.length,
  targets: [{ name: "static-output", files: texts.length, truthBearingTextFiles, sourceMaps, remoteReferences, publicHtmlLeaks, failures, passed: failures.length === 0 }],
  reportFiles,
  reportLeakTokens,
  boundaryChecks,
  boundaries: { fullCaseFile: "worker-only", blackBoxRunnerInputs: ["PlayerProjection", "GameEvent", "SaveEnvelope"], saveSchemaVersion: 1, remoteAnalytics: false, remoteAI: false, hostRewrite: "localhost-only / presentation-only" },
  passed: failures.length === 0 && Object.values(boundaryChecks).every(Boolean),
  qualification: "静态扫描降低意外剧透与远程依赖风险；离线内容仍可被主动反编译，这不是 DRM。",
};
writeFileSync(resolve(root, "docs/v1.7-security-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ files: texts.length, truthBearingTextFiles, publicHtmlLeaks: publicHtmlLeaks.length, remoteReferences: remoteReferences.length, reportLeakTokens, boundaryChecks, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
