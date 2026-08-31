import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createQuestionRoutingOffer, createRuntimeState, projectPlayerState } from "../packages/mystery-core/src/index.ts";
import { buildQuestionRoutingRequestBody } from "../apps/web/lib/question-routing-ai.ts";
import { isAllowedAiEndpoint, isLocalHostEndpoint } from "../apps/web/lib/ai-provider-defaults.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v2.6-internal-rc");
const forbidden = ["solutionCertificate", "canonicalHypothesisId", "requiredFactIds", "alternativeHypothesisIds", "hiddenFacts", "truthGraph", "internalEventId", "spoilerAnswerTemplate"];
const caseReports = release.entries.map((entry) => {
  const file = loadCaseFile(entry); const state = createRuntimeState(file); const projection = JSON.stringify(projectPlayerState(file, state));
  const offer = createQuestionRoutingOffer(file, state, "帮我理解这个问题");
  const body = JSON.stringify(buildQuestionRoutingRequestBody({ enabled: true, endpoint: "https://api.openai.com/v1/chat/completions", model: "audit", protocolMode: "strict-schema", keyStorage: "session" }, offer.context));
  const leaks = forbidden.filter((token) => projection.includes(token) || JSON.stringify(offer.context).includes(token) || body.includes(token));
  const opaqueTokens = offer.context.candidates.every((item) => /^candidate-\d{2}-[0-9a-f]{4}$/u.test(item.token));
  return { caseId: entry.id, opaqueTokens, leaks, passed: opaqueTokens && leaks.length === 0 };
});
function files(dir: string): string[] { return existsSync(dir) ? readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }) : []; }
const remoteHosts = new Set<string>(); const staticLeaks: Array<{ file: string; token: string }> = [];
for (const path of files(resolve(root, "apps/web/out"))) {
  const extension = extname(path).toLowerCase(); if (![".html", ".js", ".json", ".webmanifest"].includes(extension)) continue;
  const source = readFileSync(path, "utf8");
  if (extension === ".html" || extension === ".webmanifest") for (const match of source.matchAll(/(?:src|href|action)=["'](https?:\/\/[^"']+)/gu)) try { remoteHosts.add(new URL(match[1]).hostname); } catch { /* malformed URL is not a dependency */ }
  if (extension === ".js" && /navigator\.sendBeacon|google-analytics|segment\.io|sentry\.io|plausible\.io/iu.test(source)) remoteHosts.add("unexpected-tracker");
  if (extension === ".html") for (const token of forbidden) if (source.includes(token)) staticLeaks.push({ file: path.slice(root.length + 1), token });
}
const worker = readFileSync(resolve(root, "apps/web/workers/mystery-runtime.worker.ts"), "utf8");
const registry = readFileSync(resolve(root, "apps/web/.generated/worker-case-registry.ts"), "utf8");
const workerBoundary = { projectsOnly: worker.includes("projectPlayerState(caseFile, state)"), noCaseFilePostMessage: !worker.includes("postMessage(caseFile"), rejectsUnknownCase: worker.includes("case_load_failed") && registry.includes("Unknown case id") };
const endpointGuards = { remoteHttps: isAllowedAiEndpoint("https://api.openai.com/v1/chat/completions"), remoteHttpRejected: !isAllowedAiEndpoint("http://example.com/v1/chat/completions"), credentialsRejected: !isAllowedAiEndpoint("https://user:secret@example.com/v1/chat/completions"), hostRemoteRejected: !isLocalHostEndpoint("https://example.com/v1/chat/completions"), hostLocalAccepted: isLocalHostEndpoint("http://localhost:11434/v1/chat/completions") };
const sw = existsSync(resolve(root, "apps/web/out/sw.js")) ? readFileSync(resolve(root, "apps/web/out/sw.js"), "utf8") : "";
const serviceWorkerGuards = { profileScoped: sw.includes("black-soup-v26-investigation-workbench-rc"), sameOriginOnly: sw.includes("origin !== self.location.origin"), noRuntimeCachePut: !sw.includes("cache.put(") };
const historical = [{ version: "v1.8", file: "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip", expected: "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d" }, { version: "v1.9", file: "dist/turtle-soup-v1.9-internal-rc-web-pwa.zip", expected: "c3c074e1170ca2efd7db0b3c0437873dc7d8633074ab4ff4c62c5b7910a8a6fc" }, { version: "v2.0", file: "dist/turtle-soup-v2.0-internal-rc-web-pwa.zip", expected: "76e8d237acdc94f99f8cf48ca25bc8f1b22b6bdc86ce2a74153700d290a27273" }, { version: "v2.1", file: "dist/turtle-soup-v2.1-internal-rc-web-pwa.zip", expected: "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929" }, { version: "v2.2", file: "dist/turtle-soup-v2.2-internal-rc-web-pwa.zip", expected: "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937" }, { version: "v2.3", file: "dist/turtle-soup-v2.3-internal-rc-web-pwa.zip", expected: "e88a0b12d9437cd3c9e3d94bce81481756629ae19439cfd93ed406f45586f9d4" }, { version: "v2.4", file: "dist/turtle-soup-v2.4-internal-rc-web-pwa.zip", expected: "58b4b4f140cbcd959b3578037cbe94894491204d03cbf923ca648f1f927db25f" }, { version: "v2.5", file: "dist/turtle-soup-v2.5-internal-rc-web-pwa.zip", expected: "78d1a2b3168a729895734c5858c0415c459661f75ab8445bfaf14c0d514d5eaf" }].map((item) => { const path = resolve(root, item.file); const actual = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "missing"; return { ...item, actual, unchanged: actual === item.expected }; });
const unexpectedRemoteHosts = [...remoteHosts].filter((host) => host !== "api.openai.com");
const report = { reportVersion: "2.6", releaseProfile: "v2.6-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, cases: caseReports, staticLeaks, remoteHosts: [...remoteHosts], unexpectedRemoteHosts, workerBoundary, endpointGuards, serviceWorkerGuards, historicalArtifacts: historical, passed: caseReports.length === 84 && caseReports.every((item) => item.passed) && staticLeaks.length === 0 && unexpectedRemoteHosts.length === 0 && Object.values(workerBoundary).every(Boolean) && Object.values(endpointGuards).every(Boolean) && Object.values(serviceWorkerGuards).every(Boolean) && historical.every((item) => item.unchanged) };
writeFileSync(resolve(root, "docs/v2.6-security-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: caseReports.length, staticLeaks: staticLeaks.length, unexpectedRemoteHosts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
