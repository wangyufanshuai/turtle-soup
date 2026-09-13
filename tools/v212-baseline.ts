import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { git, hashBytes, slash, V212_BASE_REF, V212_PROFILE, writeReport } from "./lib/v212-evidence.ts";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? ".");
const checkOnly = process.argv.includes("--check");
const snapshotPath = "docs/v2.12-frozen-baseline.json";
const oldProfilePath = "content/zh/releases/v2.11-internal-rc.json";
const baselineBlob = (path: string) => git(root, ["show", `${V212_BASE_REF}:${path}`]);
const oldProfile = JSON.parse(baselineBlob(oldProfilePath).toString("utf8")) as { manifests: string[] };
const manifests = oldProfile.manifests.map((path) => slash(relative(root, resolve(root, dirname(oldProfilePath), path))));
const cases = manifests.flatMap((manifestPath) => {
  const manifest = JSON.parse(baselineBlob(manifestPath).toString("utf8")) as { cases: Array<{ id: string; file: string; contentVersion: number; canonicalHash: string }> };
  return manifest.cases.map((entry) => ({ ...entry, path: slash(relative(root, resolve(root, dirname(manifestPath), entry.file))) }));
});
const tracked = git(root, ["ls-tree", "-r", "--name-only", V212_BASE_REF, "dist", "content/zh/releases", "content/zh/cases", "docs"]).toString("utf8").trim().split("\n");
const historical = tracked.filter((path) => /^dist\/[^/]+\.zip$/u.test(path) || /^content\/zh\/releases\/[^/]+\.json$/u.test(path) || /^content\/zh\/cases\/manifest[^/]+\.json$/u.test(path) || /^docs\/v\d+\.\d+[^/]*\.(?:json|md)$/u.test(path));
const paths = [...new Set([...historical, ...manifests, ...cases.map((entry) => entry.path)])].sort();
const files = paths.map((path) => {
  const reference = baselineBlob(path);
  const actual = existsSync(resolve(root, path)) ? readFileSync(resolve(root, path)) : undefined;
  return { path, baselineSha256: hashBytes(reference), diskSha256: actual ? hashBytes(actual) : null, bytes: reference.length, unchanged: Boolean(actual?.equals(reference)) };
});
const caseIdentities = cases.map((entry) => {
  const reference = JSON.parse(baselineBlob(entry.path).toString("utf8"));
  const actual = JSON.parse(readFileSync(resolve(root, entry.path), "utf8"));
  return {
    caseId: entry.id, path: entry.path, caseVersion: entry.contentVersion, canonicalHash: entry.canonicalHash,
    fileSha256: hashBytes(baselineBlob(entry.path)),
    certificateSha256: hashBytes(JSON.stringify(reference.solutionCertificate)),
    factGraphSha256: hashBytes(JSON.stringify(reference.facts)), eventGraphSha256: hashBytes(JSON.stringify(reference.events)),
    identityMatchesManifest: actual.id === entry.id && actual.metadata?.contentVersion === entry.contentVersion && actual.metadata?.canonicalHash === entry.canonicalHash,
    certificateUnchanged: JSON.stringify(reference.solutionCertificate) === JSON.stringify(actual.solutionCertificate),
  };
});
const currentProfile = JSON.parse(readFileSync(resolve(root, `content/zh/releases/${V212_PROFILE}.json`), "utf8"));
const manifestSelectionUnchanged = JSON.stringify(currentProfile.manifests) === JSON.stringify(oldProfile.manifests);
const passed = files.every((file) => file.unchanged) && caseIdentities.every((entry) => entry.identityMatchesManifest && entry.certificateUnchanged) && manifestSelectionUnchanged;
const report = {
  reportVersion: "2.12", releaseProfile: V212_PROFILE, baselineRef: V212_BASE_REF,
  runId: `frozen-${V212_BASE_REF.slice(0, 12)}`, measuredAt: new Date().toISOString(),
  coverage: passed ? "measured" : "failed", scope: "Exact git-blob versus disk bytes; declared identities and serialized certificates, not gameplay or historical-save execution",
  caseCount: cases.length, manifestCount: manifests.length, historicalZipCount: files.filter((entry) => entry.path.endsWith(".zip")).length,
  manifestSelectionUnchanged, files, caseIdentities, passed,
};
if (checkOnly) {
  const baseline = JSON.parse(readFileSync(resolve(root, snapshotPath), "utf8")) as typeof report;
  if (baseline.baselineRef !== V212_BASE_REF || JSON.stringify(baseline.files.map((entry) => [entry.path, entry.baselineSha256])) !== JSON.stringify(files.map((entry) => [entry.path, entry.baselineSha256]))) throw new Error("Stored frozen baseline differs from fixed git reference");
} else if (existsSync(resolve(root, snapshotPath))) {
  throw new Error("Frozen snapshot already exists; use --check (never overwrite the baseline)");
} else writeReport(root, snapshotPath, report);
console.log(JSON.stringify({ snapshotPath, checkOnly, measuredAt: report.measuredAt, cases: report.caseCount, historicalZips: report.historicalZipCount, files: files.length, passed, failures: files.filter((entry) => !entry.unchanged).map((entry) => entry.path) }, null, 2));
if (!passed) process.exitCode = 1;
