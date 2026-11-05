import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { loadReleaseContent } from "./lib/release-content.ts";
import { uiFlowMatrix, V212_BROWSER_ENGINES, V212_FLOW_CASES, V212_VIEWPORTS, type UiFlowReceipt } from "./lib/v212-browser-contract.ts";
import { evidenceIdentity, fileTree, git, hashBytes, loadRun, sameIdentity, slash, V212_BASE_REF, V212_PROFILE, writeReport, type EvidenceIdentity, type GateEvidence } from "./lib/v212-evidence.ts";

export const V212_ARCHIVE = "dist/turtle-soup-v2.12-internal-rc-web-pwa.zip";
export const V212_PACKAGE_BUDGETS = { archiveBytes: 8_000_000, maximumFileBytes: 450_000, homeScriptBytes: 700_000 } as const;
const CHECK_NAMES = ["core", "integrity", "typecheck-core", "typecheck-web", "frozen", "historical-save-oracle", "offline-all-cases", "ai-fail-closed-ui", "visual-and-accessibility"] as const;
const SOURCE_DIRECTORY = "apps/web/out";
const INDEX_PATH = "docs/v2.12-release-verification.json";
const BASELINE_PATH = "docs/v2.12-frozen-baseline.json";

export interface FileFingerprint { path: string; bytes: number; sha256: string }
interface BoundCheck extends EvidenceIdentity {
  passed: boolean | null;
  coverage: "measured" | "static" | "not-run" | "failed";
  scope?: string;
  reason?: string;
  evidence: Array<{ path: string; sha256: string }>;
  exitCode?: number;
  unchangedDuringBuild?: boolean;
}
interface FrozenBaseline {
  baselineRef: string;
  passed: boolean;
  caseCount: number;
  historicalZipCount: number;
  files: Array<{ path: string; baselineSha256: string; bytes: number; unchanged: boolean }>;
}
export interface V212PackagePlan {
  root: string;
  target: string;
  identity: EvidenceIdentity;
  gates: GateEvidence[];
  inputs: FileFingerprint[];
  files: FileFingerprint[];
  includedCaseRoutes: string[];
  preservedArtifacts: Array<{ path: string; bytes: number; expectedSha256: string; actualSha256: string; unchanged: true }>;
  totalUncompressedBytes: number;
  maximumFileBytes: number;
  homeScripts: FileFingerprint[];
  homeScriptBytes: number;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function matchingIdentity(left: EvidenceIdentity, right: EvidenceIdentity): boolean {
  return sameIdentity(left, right) && left.sourceHead === right.sourceHead;
}

// No artifact input or destination may escape through a directory junction/symlink.
function assertLocalPath(root: string, path: string) {
  const part = slash(relative(root, path));
  assert(part && !part.startsWith("../") && !part.includes(":") && !part.startsWith("/"), `Path outside package workspace: ${path}`);
  let cursor = resolve(root);
  for (const segment of part.split("/")) {
    cursor = resolve(cursor, segment);
    const info = lstatSync(cursor, { throwIfNoEntry: false });
    assert(!info?.isSymbolicLink(), `Refusing linked package path: ${cursor}`);
  }
}

export function assertV212PackageTarget(root: string, target = V212_ARCHIVE): string {
  const destination = resolve(root, target);
  assert(destination === resolve(root, V212_ARCHIVE), `Forbidden archive target; only ${V212_ARCHIVE} is allowed`);
  assertLocalPath(resolve(root), destination);
  assert(!lstatSync(destination, { throwIfNoEntry: false }), "Refusing to replace an existing ZIP, including a previous v2.12 ZIP");
  return destination;
}

function fingerprint(root: string, path: string): FileFingerprint {
  assertLocalPath(root, resolve(root, path));
  const data = readFileSync(resolve(root, path));
  return { path, bytes: data.length, sha256: hashBytes(data) };
}

function currentArtifact(root: string, identity: EvidenceIdentity, item: { path: string; sha256: string }): FileFingerprint {
  assert(typeof item?.path === "string" && typeof item.sha256 === "string", "Invalid evidence reference");
  assert(item.path.startsWith(`output/v212/${identity.runId}/`) && !item.path.includes("\\") && !item.path.split("/").some((part) => part === ".." || part === "."), `Evidence is outside this run: ${item.path}`);
  const actual = fingerprint(root, item.path);
  assert(actual.sha256 === item.sha256, `Changed evidence: ${item.path}`);
  return actual;
}

function readBoundCheck(root: string, identity: EvidenceIdentity, name: string, inputs: FileFingerprint[]): GateEvidence {
  const path = name === "build" ? "docs/v2.12-build.json" : `docs/v2.12-check-${name}.json`;
  if (!existsSync(resolve(root, path))) return { id: name, coverage: "not-run", passed: null, scope: name, evidence: [], reason: `Missing ${path}` };
  try {
    const report = fingerprint(root, path);
    const value = JSON.parse(readFileSync(resolve(root, path), "utf8")) as BoundCheck;
    if (value.coverage === "not-run" && value.passed === null && typeof value.reason === "string" && value.reason.trim()) {
      return { id: name, coverage: "not-run", passed: null, scope: value.scope ?? name, evidence: [path], reason: value.reason };
    }
    assert(matchingIdentity(identity, value), "Stale source/profile/build/run identity");
    assert(value.passed === true && ["measured", "static"].includes(value.coverage), "Required check is not passed");
    assert(Array.isArray(value.evidence) && value.evidence.length > 0, "Missing raw evidence");
    if (["historical-save-oracle", "offline-all-cases", "ai-fail-closed-ui", "visual-and-accessibility"].includes(name)) assert(value.coverage === "measured", "Runtime obligations require measured execution, not a static contract");
    if (name === "build") assert(value.coverage === "measured" && value.exitCode === 0 && value.unchangedDuringBuild === true, "No successful source-stable build execution");
    const artifacts = value.evidence.map((item) => currentArtifact(root, identity, item));
    inputs.push(report, ...artifacts);
    return { id: name, coverage: value.coverage, passed: true, scope: value.scope ?? name, evidence: [path, ...artifacts.map((item) => item.path)] };
  } catch (error) {
    return { id: name, coverage: "failed", passed: false, scope: name, evidence: [path], reason: String(error) };
  }
}

export function assertV212PackageGates(gates: GateEvidence[]) {
  const required = ["build", ...CHECK_NAMES, ...V212_FLOW_CASES.flatMap((caseId) => V212_BROWSER_ENGINES.flatMap((engine) => V212_VIEWPORTS.map((viewport) => `${caseId}/${engine}/${viewport}`)))];
  const failures = required.filter((id) => gates.filter((gate) => gate.id === id && gate.passed === true && ["measured", "static"].includes(gate.coverage)).length !== 1);
  failures.push(...gates.filter((gate) => gate.id !== "release-zip" && (gate.passed !== true || !["measured", "static"].includes(gate.coverage))).map((gate) => gate.id));
  assert(failures.length === 0, `Refusing v2.12 package; required gates not passed: ${[...new Set(failures)].join(", ")}`);
}

function readPrerequisites(root: string, identity: EvidenceIdentity, inputs: FileFingerprint[], requireIndex = true): GateEvidence[] {
  const gates = ["build", ...CHECK_NAMES].map((name) => readBoundCheck(root, identity, name, inputs));
  const flows = uiFlowMatrix(root, identity);
  for (const gate of flows) {
    if (gate.passed !== true) continue;
    const [caseId, engine, viewport] = gate.id.split("/");
    const path = `output/v212/${identity.runId}/flows/${caseId}-${engine}-${viewport}.json`;
    try {
      const receipt = JSON.parse(readFileSync(resolve(root, path), "utf8")) as UiFlowReceipt;
      assert(matchingIdentity(identity, receipt), "Flow source HEAD does not match this run");
      inputs.push(fingerprint(root, path), ...receipt.observations.flatMap((observation) => observation.evidence.map((item) => currentArtifact(root, identity, item))));
    } catch (error) { Object.assign(gate, { coverage: "failed", passed: false, reason: String(error) }); }
  }
  gates.push(...flows);
  // Check raw evidence first: neither a green summary nor missing summary can mask pending gates.
  assertV212PackageGates(gates);
  if (!requireIndex) return gates;
  const indexRef = fingerprint(root, INDEX_PATH);
  const index = JSON.parse(readFileSync(resolve(root, INDEX_PATH), "utf8")) as EvidenceIdentity & { caseCount: number; gates: GateEvidence[] };
  assert(matchingIdentity(identity, index) && index.caseCount === 84 && Array.isArray(index.gates), "Run verify:v212 against the current identity before packaging");
  const indexed = index.gates.filter((gate) => gate.id !== "release-zip");
  const requiredIds = gates.filter((gate) => gate.id !== "build").map((gate) => gate.id).sort();
  assert(JSON.stringify(indexed.map((gate) => gate.id).sort()) === JSON.stringify(requiredIds), "Verifier gate set changed or is incomplete; do not silently omit a required gate");
  assert(indexed.every((gate) => gate.passed === true && gate.coverage === gates.find((item) => item.id === gate.id)?.coverage), "Current verifier index still contains failed/pending gates");
  assert(index.gates.filter((gate) => gate.id === "release-zip").length === 1, "Verifier index must contain exactly one release-zip gate");
  // index.passed is intentionally not required: release-zip has not been assembled yet.
  inputs.push(indexRef);
  return gates;
}

function preservedZipFiles(root: string, inputs: FileFingerprint[]): V212PackagePlan["preservedArtifacts"] {
  const reference = fingerprint(root, BASELINE_PATH);
  const baseline = JSON.parse(readFileSync(resolve(root, BASELINE_PATH), "utf8")) as FrozenBaseline;
  assert(baseline.baselineRef === V212_BASE_REF && baseline.passed === true && baseline.caseCount === 84 && baseline.historicalZipCount === 25 && Array.isArray(baseline.files), "Invalid frozen v2.12 baseline");
  const oldZips = baseline.files.filter((item) => /^dist\/[^/]+\.zip$/u.test(item.path));
  const fromGit = git(root, ["ls-tree", "-r", "--name-only", V212_BASE_REF, "--", "dist"]).toString("utf8").trim().split(/\r?\n/u).filter((path) => /^dist\/[^/]+\.zip$/u.test(path)).sort();
  assert(oldZips.length === 25 && JSON.stringify(oldZips.map((item) => item.path).sort()) === JSON.stringify(fromGit), "Frozen baseline must enumerate all 25 historical ZIPs exactly once");
  const preserved = oldZips.map((item) => {
    const actual = fingerprint(root, item.path);
    const frozenBytes = git(root, ["show", `${V212_BASE_REF}:${item.path}`]);
    assert(item.unchanged === true && item.baselineSha256 === hashBytes(frozenBytes) && item.bytes === frozenBytes.length, `Baseline ZIP fingerprint differs from frozen Git bytes: ${item.path}`);
    assert(actual.sha256 === item.baselineSha256 && actual.bytes === item.bytes, `Historical ZIP changed: ${item.path}`);
    return { path: item.path, bytes: actual.bytes, expectedSha256: item.baselineSha256, actualSha256: actual.sha256, unchanged: true as const };
  });
  inputs.push(reference);
  return preserved;
}

function rejectLinkedTree(root: string, directory: string) {
  assertLocalPath(root, directory);
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    assert(!item.isSymbolicLink(), `Refusing linked static asset: ${path}`);
    if (item.isDirectory()) rejectLinkedTree(root, path);
    else assert(item.isFile(), `Unsupported static artifact: ${path}`);
  }
}

/** Read-only preflight. Throws on pending/stale gates; never builds, writes reports or creates ZIPs. */
export function planV212Package(workspace = ".", target = V212_ARCHIVE): V212PackagePlan {
  const root = resolve(workspace);
  const destination = assertV212PackageTarget(root, target);
  rejectLinkedTree(root, resolve(root, SOURCE_DIRECTORY));
  const identity = loadRun(root);
  const recorded = JSON.parse(readFileSync(resolve(root, "docs/v2.12-run.json"), "utf8")) as EvidenceIdentity;
  assert(matchingIdentity(identity, recorded) && identity.buildHash, "Current source HEAD and verified v2.12 build are required");
  const inputs = [fingerprint(root, "docs/v2.12-run.json")];
  const gates = readPrerequisites(root, identity, inputs);
  const { entries, profile } = loadReleaseContent(root, V212_PROFILE);
  assert(profile.id === V212_PROFILE && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending" && entries.length === 84 && profile.manifests.length === 5, "Expected five frozen manifests, 84 cases and internal-rc/human-evaluation-pending profile");
  inputs.push(fingerprint(root, `content/zh/releases/${V212_PROFILE}.json`), ...[...new Set(entries.map((entry) => slash(relative(root, entry.manifestPath))))].map((path) => fingerprint(root, path)));
  const files = fileTree(root, SOURCE_DIRECTORY);
  assert(hashBytes(JSON.stringify(files)) === identity.buildHash, "Static tree differs from the bound build");
  const includedCaseRoutes = entries.map((entry) => entry.id).sort();
  const actualRoutes = files.flatMap((item) => item.path.match(/^case\/([^/]+)\/index\.html$/u)?.[1] ?? []).sort();
  assert(JSON.stringify(actualRoutes) === JSON.stringify(includedCaseRoutes), "Static case routes must match exactly the 84 manifest-selected routes");
  assert(files.every((item) => item.bytes <= V212_PACKAGE_BUDGETS.maximumFileBytes), "Static artifact exceeds 450,000-byte per-file budget");
  const home = readFileSync(resolve(root, SOURCE_DIRECTORY, "index.html"), "utf8");
  const scriptUrls = [...new Set([...home.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/giu)].map((match) => match[1]))];
  const homeScripts = scriptUrls.map((url) => {
    const local = new URL(url, "https://static.invalid/");
    assert(local.origin === "https://static.invalid", `External initial script is not in the static package: ${url}`);
    const item = files.find((file) => file.path === local.pathname.slice(1));
    assert(item, `Missing initial script: ${url}`);
    return item;
  }).filter((item, index, all) => all.findIndex((other) => other.path === item.path) === index);
  const homeScriptBytes = homeScripts.reduce((sum, item) => sum + item.bytes, 0);
  assert(homeScripts.length > 0 && homeScriptBytes <= V212_PACKAGE_BUDGETS.homeScriptBytes, "Home script files exceed 700,000-byte static budget or are absent");
  const preservedArtifacts = preservedZipFiles(root, inputs);
  assert(matchingIdentity(identity, evidenceIdentity(root, identity.runId)), "Source/profile/build changed during package planning");
  return { root, target: destination, identity, gates, inputs: [...new Map(inputs.map((item) => [item.path, item])).values()], files, includedCaseRoutes, preservedArtifacts, totalUncompressedBytes: files.reduce((sum, item) => sum + item.bytes, 0), maximumFileBytes: Math.max(...files.map((item) => item.bytes)), homeScripts, homeScriptBytes };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const value of data) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function safeEntryName(path: string) {
  assert(path.length > 0 && !/[\\:\u0000-\u001f]/u.test(path) && !path.startsWith("/") && !path.split("/").some((part) => !part || part === "." || part === ".."), `Unsafe ZIP entry: ${path}`);
}

/** Port of the existing package-v27 ZIP32 writer, without importing its side effects. */
export function deterministicV212Zip(entries: Array<{ path: string; data: Buffer }>): Buffer {
  assert(entries.length > 0 && entries.length < 0xffff, "ZIP32 file count out of bounds");
  const sorted = [...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert(new Set(sorted.map((item) => item.path)).size === sorted.length, "Duplicate ZIP entries");
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const { path, data } of sorted) {
    safeEntryName(path);
    const name = Buffer.from(path, "utf8"), compressed = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    assert(name.length <= 0xffff && data.length <= V212_PACKAGE_BUDGETS.maximumFileBytes, "ZIP entry exceeds filename/file-size budget");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, name); offset += local.length + name.length + compressed.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

/** Independently read central/local records, inflate bytes, and compare CRC, size and SHA-256. */
export function verifyV212Zip(zip: Buffer, expected: FileFingerprint[]): FileFingerprint[] {
  assert(zip.length >= 22 && zip.length <= V212_PACKAGE_BUDGETS.archiveBytes, "ZIP exceeds 8,000,000-byte budget or is truncated");
  const end = zip.length - 22;
  assert(zip.readUInt32LE(end) === 0x06054b50 && zip.readUInt16LE(end + 4) === 0 && zip.readUInt16LE(end + 6) === 0 && zip.readUInt16LE(end + 20) === 0, "Invalid ZIP32 end record");
  const count = zip.readUInt16LE(end + 10), centralSize = zip.readUInt32LE(end + 12), centralOffset = zip.readUInt32LE(end + 16);
  assert(count === expected.length && zip.readUInt16LE(end + 8) === count && centralOffset + centralSize === end, "ZIP entry count or central directory mismatch");
  let cursor = centralOffset, localEnd = 0;
  const actual: FileFingerprint[] = [];
  for (let index = 0; index < count; index++) {
    assert(cursor + 46 <= end && zip.readUInt32LE(cursor) === 0x02014b50, "Invalid central ZIP record");
    const nameBytes = zip.readUInt16LE(cursor + 28), extraBytes = zip.readUInt16LE(cursor + 30), commentBytes = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42), compressedBytes = zip.readUInt32LE(cursor + 20), bytes = zip.readUInt32LE(cursor + 24), crc = zip.readUInt32LE(cursor + 16);
    assert(cursor + 46 + nameBytes <= end && extraBytes === 0 && commentBytes === 0 && zip.readUInt16LE(cursor + 34) === 0 && zip.readUInt16LE(cursor + 8) === 0x0800 && zip.readUInt16LE(cursor + 10) === 8 && zip.readUInt16LE(cursor + 12) === 0 && zip.readUInt16LE(cursor + 14) === 0x21, "Unsupported ZIP encoding, compression or non-deterministic timestamp");
    const name = zip.subarray(cursor + 46, cursor + 46 + nameBytes), path = name.toString("utf8");
    safeEntryName(path);
    assert(Buffer.from(path, "utf8").equals(name) && (index === 0 || actual[index - 1].path < path), "ZIP names are invalid, duplicate or unsorted");
    assert(localOffset === localEnd && localOffset + 30 <= centralOffset && zip.readUInt32LE(localOffset) === 0x04034b50, "ZIP local entry offset mismatch");
    assert(zip.readUInt16LE(localOffset + 6) === 0x0800 && zip.readUInt16LE(localOffset + 8) === 8 && zip.readUInt16LE(localOffset + 10) === 0 && zip.readUInt16LE(localOffset + 12) === 0x21 && zip.readUInt32LE(localOffset + 14) === crc && zip.readUInt32LE(localOffset + 18) === compressedBytes && zip.readUInt32LE(localOffset + 22) === bytes && zip.readUInt16LE(localOffset + 26) === nameBytes && zip.readUInt16LE(localOffset + 28) === 0, "ZIP local/central metadata mismatch");
    const dataOffset = localOffset + 30 + nameBytes;
    assert(bytes <= V212_PACKAGE_BUDGETS.maximumFileBytes && dataOffset + compressedBytes <= centralOffset && zip.subarray(localOffset + 30, dataOffset).equals(name), "ZIP entry bounds/name mismatch");
    const data = inflateRawSync(zip.subarray(dataOffset, dataOffset + compressedBytes), { maxOutputLength: V212_PACKAGE_BUDGETS.maximumFileBytes + 1 });
    assert(data.length === bytes && crc32(data) === crc, `ZIP decompressed size/CRC mismatch: ${path}`);
    actual.push({ path, bytes: data.length, sha256: hashBytes(data) });
    localEnd = dataOffset + compressedBytes; cursor += 46 + nameBytes;
  }
  assert(cursor === end && localEnd === centralOffset, "ZIP has extra or missing records");
  const byPath = (a: FileFingerprint, b: FileFingerprint) => a.path.localeCompare(b.path, "en");
  assert(JSON.stringify([...actual].sort(byPath)) === JSON.stringify([...expected].sort(byPath)), "ZIP file set, size or SHA-256 differs from the selected static tree");
  return actual;
}

function unchangedPlan(plan: V212PackagePlan) {
  assert(matchingIdentity(plan.identity, evidenceIdentity(plan.root, plan.identity.runId)), "Source/profile/build changed during ZIP assembly");
  for (const input of [...plan.inputs, ...plan.preservedArtifacts.map((item) => ({ path: item.path, bytes: item.bytes, sha256: item.expectedSha256 }))]) {
    const actual = fingerprint(plan.root, input.path);
    assert(actual.sha256 === input.sha256 && actual.bytes === input.bytes, `Package prerequisite changed: ${input.path}`);
  }
}

/** Only this explicit action writes the new ZIP; all prerequisites are checked before any write. */
export function packageV212(workspace = ".", target = V212_ARCHIVE) {
  const startedAt = new Date().toISOString(), plan = planV212Package(workspace, target);
  const zip = deterministicV212Zip(plan.files.map((item) => ({ path: item.path, data: readFileSync(resolve(plan.root, SOURCE_DIRECTORY, item.path)) })));
  const archiveEntries = verifyV212Zip(zip, plan.files);
  unchangedPlan(plan);
  assertV212PackageTarget(plan.root, target);
  mkdirSync(dirname(plan.target), { recursive: true });
  // Exclusive creation cannot truncate an old release or an already-existing v2.12 artifact.
  writeFileSync(plan.target, zip, { flag: "wx" });
  const written = readFileSync(plan.target);
  assert(hashBytes(written) === hashBytes(zip), "ZIP read-back hash mismatch; no passing evidence emitted");
  verifyV212Zip(written, plan.files);
  unchangedPlan(plan);
  const artifact = { path: V212_ARCHIVE, bytes: written.length, sha256: hashBytes(written) };
  const logPath = `output/v212/${plan.identity.runId}/release-zip-assembly.json`;
  const report = {
    ...plan.identity, reportVersion: "2.12", startedAt, completedAt: new Date().toISOString(), coverage: "measured", passed: true,
    status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1,
    scope: "Actual deterministic ZIP assembly, read-back, decompression and per-file fingerprint comparison; no browser behavior or human evaluation inferred",
    artifact, sourceDirectory: SOURCE_DIRECTORY, exactStaticTree: true, fileCount: plan.files.length,
    files: archiveEntries, includedCaseRoutes: plan.includedCaseRoutes,
    deterministicArchive: { method: "ZIP32 deflate level 9", timestamp: "1980-01-01T00:00:00 (DOS local fields)", order: "ascending JavaScript UTF-16 path-string order", runtime: process.version, zlib: process.versions.zlib, qualification: "Identical input bytes and this compression runtime produce identical bytes; runtime upgrades may change compression output" },
    budgets: { coverage: "static", limits: V212_PACKAGE_BUDGETS, archiveBytes: written.length, maximumFileBytes: plan.maximumFileBytes, homeScriptBytes: plan.homeScriptBytes, totalUncompressedBytes: plan.totalUncompressedBytes, homeScripts: plan.homeScripts, passed: true, qualification: "Home script src files only, not actual initial network traffic; excludes workers, dynamic imports, media and full Service Worker prefetch. Total uncompressed package bytes are reported separately." },
    requiredGatesBeforeAssembly: plan.gates, inputs: plan.inputs, preservedArtifacts: plan.preservedArtifacts,
    qualification: "release-zip alone was excluded from preassembly gates to avoid a circular dependency. All other required gates were independently revalidated. Formal Fun Gate participants remain 0; machine gates do not establish enjoyment, comprehension, aesthetics or market fit.",
  };
  writeReport(plan.root, logPath, report);
  const evidence = [fingerprint(plan.root, logPath)];
  writeReport(plan.root, "docs/v2.12-release-artifacts.json", { ...report, evidence });
  writeReport(plan.root, "docs/v2.12-check-release-zip.json", { ...plan.identity, measuredAt: new Date().toISOString(), coverage: "measured", scope: report.scope, passed: true, evidence, artifact, report: fingerprint(plan.root, "docs/v2.12-release-artifacts.json") });
  return { ...plan.identity, passed: true, artifact, files: archiveEntries.length, preservedHistoricalZips: plan.preservedArtifacts.length };
}

/** Revalidate disk bytes when verify:v212 reads a prior assembly receipt; never package recursively. */
export function auditV212ReleaseArtifact(workspace = ".", identity = loadRun(resolve(workspace))): GateEvidence {
  const root = resolve(workspace);
  assert(identity.buildHash && matchingIdentity(identity, evidenceIdentity(root, identity.runId)), "Release ZIP identity is stale");
  const checkPath = "docs/v2.12-check-release-zip.json", reportPath = "docs/v2.12-release-artifacts.json";
  const check = JSON.parse(readFileSync(resolve(root, checkPath), "utf8")) as BoundCheck & { artifact: FileFingerprint; report: FileFingerprint };
  assert(check.passed === true && check.coverage === "measured" && matchingIdentity(identity, check) && Array.isArray(check.evidence) && check.evidence.length === 1, "Invalid release ZIP receipt");
  const assemblyRef = currentArtifact(root, identity, check.evidence[0]);
  assert(assemblyRef.path === `output/v212/${identity.runId}/release-zip-assembly.json`, "Unexpected assembly log path");
  const reportRef = fingerprint(root, reportPath);
  assert(check.report?.path === reportPath && check.report.sha256 === reportRef.sha256 && check.report.bytes === reportRef.bytes, "Release artifacts report changed");
  const log = JSON.parse(readFileSync(resolve(root, assemblyRef.path), "utf8")) as EvidenceIdentity & {
    passed: boolean; coverage: string; artifact: FileFingerprint; files: FileFingerprint[]; inputs: FileFingerprint[];
    includedCaseRoutes: string[]; preservedArtifacts: V212PackagePlan["preservedArtifacts"];
  };
  const { evidence, ...reportContent } = JSON.parse(readFileSync(resolve(root, reportPath), "utf8"));
  assert(JSON.stringify(reportContent) === JSON.stringify(log) && JSON.stringify(evidence) === JSON.stringify([assemblyRef]), "Assembly log and artifacts report differ");
  assert(matchingIdentity(identity, log) && log.passed === true && log.coverage === "measured", "Stale or failed assembly log");
  // The verifier index is intentionally rewritten after assembly, so its preassembly hash is historical evidence.
  // Every other bound input must still match; raw prerequisite gates are also independently revalidated below.
  assert(Array.isArray(log.inputs) && log.inputs.length > 0, "Assembly inputs are absent");
  for (const input of log.inputs.filter((item) => item.path !== INDEX_PATH)) {
    const current = fingerprint(root, input.path);
    assert(current.bytes === input.bytes && current.sha256 === input.sha256, `Assembly input changed: ${input.path}`);
  }
  readPrerequisites(root, identity, [], false);
  rejectLinkedTree(root, resolve(root, SOURCE_DIRECTORY));
  const tree = fileTree(root, SOURCE_DIRECTORY);
  assert(hashBytes(JSON.stringify(tree)) === identity.buildHash, "ZIP source tree differs from the bound build");
  const { entries, profile } = loadReleaseContent(root, V212_PROFILE);
  assert(profile.id === V212_PROFILE && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending" && entries.length === 84 && profile.manifests.length === 5, "Release profile/manifest scope changed");
  const selectedRoutes = entries.map((entry) => entry.id).sort();
  const treeRoutes = tree.flatMap((item) => item.path.match(/^case\/([^/]+)\/index\.html$/u)?.[1] ?? []).sort();
  assert(JSON.stringify(log.includedCaseRoutes) === JSON.stringify(selectedRoutes) && JSON.stringify(treeRoutes) === JSON.stringify(selectedRoutes), "ZIP route selection differs from the 84-case manifests");
  assert(log.artifact?.path === V212_ARCHIVE && check.artifact?.path === V212_ARCHIVE, "Forbidden release ZIP receipt target");
  const archive = fingerprint(root, V212_ARCHIVE);
  assert(archive.sha256 === log.artifact.sha256 && archive.bytes === log.artifact.bytes && archive.sha256 === check.artifact.sha256 && archive.bytes === check.artifact.bytes, "Actual release ZIP differs from the assembly receipt");
  const archiveEntries = verifyV212Zip(readFileSync(resolve(root, V212_ARCHIVE)), tree);
  assert(JSON.stringify(archiveEntries) === JSON.stringify(log.files), "Release report entry fingerprints differ from actual ZIP entries");
  const preserved = preservedZipFiles(root, []);
  assert(JSON.stringify(preserved) === JSON.stringify(log.preservedArtifacts), "Historical ZIP preservation results changed");
  assert(matchingIdentity(identity, evidenceIdentity(root, identity.runId)), "Identity changed during release artifact audit");
  return { id: "release-zip", coverage: "measured", passed: true, scope: "Recorded ZIP assembly plus current disk read-back/decompression, exact 84-route build match and all 25 historical ZIPs unchanged; no browser/human inference", evidence: [checkPath, reportPath, assemblyRef.path, V212_ARCHIVE, BASELINE_PATH] };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    assert(args.every((arg) => !arg.startsWith("--") || arg === "--plan" || arg.startsWith("--output=")), "Usage: package-v212.ts [workspace] [--plan] [--output=dist/turtle-soup-v2.12-internal-rc-web-pwa.zip]");
    const positional = args.filter((arg) => !arg.startsWith("--"));
    assert(positional.length <= 1 && args.filter((arg) => arg.startsWith("--output=")).length <= 1, "Only one workspace and output target are allowed");
    const workspace = positional[0] ?? ".", target = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length) ?? V212_ARCHIVE;
    if (args.includes("--plan")) {
      const plan = planV212Package(workspace, target);
      console.log(JSON.stringify({ ...plan.identity, readyForAssembly: true, archiveWritten: false, target: V212_ARCHIVE, files: plan.files.length, routes: plan.includedCaseRoutes.length, totalUncompressedBytes: plan.totalUncompressedBytes, archiveBytes: null, qualification: "Read-only plan; archive-size budget and actual assembly not yet measured" }, null, 2));
    } else console.log(JSON.stringify(packageV212(workspace, target), null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
