import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import { assertV212PackageGates, assertV212PackageTarget, deterministicV212Zip, planV212Package, verifyV212Zip, V212_ARCHIVE } from "./package-v212.ts";
import { evidenceIdentity, hashBytes, type GateEvidence } from "./lib/v212-evidence.ts";
import { V212_BROWSER_ENGINES, V212_FLOW_CASES, V212_VIEWPORTS } from "./lib/v212-browser-contract.ts";

function testDirectory(t: TestContext) {
  const parent = resolve(tmpdir()), root = mkdtempSync(resolve(parent, "v212-package-test-"));
  t.after(() => {
    // Remove only the exact temporary directory created by this test, never a broad/derived workspace.
    assert.equal(dirname(root), parent);
    assert.ok(root.startsWith(`${parent}${sep}v212-package-test-`));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function passedGates(): GateEvidence[] {
  const names = ["build", "core", "integrity", "typecheck-core", "typecheck-web", "frozen", "historical-save-oracle", "offline-all-cases", "ai-fail-closed-ui", "visual-and-accessibility", ...V212_FLOW_CASES.flatMap((caseId) => V212_BROWSER_ENGINES.flatMap((engine) => V212_VIEWPORTS.map((viewport) => `${caseId}/${engine}/${viewport}`)))];
  return names.map((id) => ({ id, passed: true, coverage: "measured", scope: "synthetic test fixture only", evidence: ["synthetic"] }));
}

test("all required gates are mandatory; release-zip alone is not circular", () => {
  const gates = passedGates();
  assert.doesNotThrow(() => assertV212PackageGates([...gates, { id: "release-zip", coverage: "not-run", passed: null, scope: "not assembled", evidence: [] }]));
  for (const required of gates) {
    assert.throws(() => assertV212PackageGates(gates.filter((gate) => gate.id !== required.id)), new RegExp(required.id));
    assert.throws(() => assertV212PackageGates(gates.map((gate) => gate.id === required.id ? { ...gate, coverage: "not-run", passed: null } : gate)), new RegExp(required.id));
  }
  assert.throws(() => assertV212PackageGates([...gates, gates[0]]), /build/u);
  assert.throws(() => assertV212PackageGates([...gates, { id: "future-required-gate", passed: false, coverage: "failed", scope: "new obligation", evidence: [] }]), /future-required-gate/u);
});

test("only the new v2.12 destination is allowed; existing ZIPs are never replaced", (t) => {
  const root = testDirectory(t);
  assert.equal(assertV212PackageTarget(root), resolve(root, V212_ARCHIVE));
  for (const target of ["dist/turtle-soup-v2.11-internal-rc-web-pwa.zip", "dist/other.zip", "../turtle-soup-v2.12-internal-rc-web-pwa.zip", root]) {
    assert.throws(() => assertV212PackageTarget(root, target), /Forbidden archive target/u);
    assert.throws(() => planV212Package(root, target), /Forbidden archive target/u);
  }
  mkdirSync(resolve(root, "dist"));
  const original = Buffer.from("existing artifact must remain unchanged");
  writeFileSync(resolve(root, V212_ARCHIVE), original);
  assert.throws(() => assertV212PackageTarget(root), /Refusing to replace/u);
  assert.deepEqual(readFileSync(resolve(root, V212_ARCHIVE)), original);
});

test("read-only plan refuses pending browser/history/offline gates and creates no ZIP/reports", (t) => {
  const root = testDirectory(t);
  const put = (path: string, value: string | object) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), typeof value === "string" ? value : JSON.stringify(value));
  };
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Package Test", "-c", "user.email=package-test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "Isolated package preflight fixture"], { cwd: root });
  put("content/zh/releases/v2.12-internal-rc.json", { id: "v2.12-internal-rc", manifests: [] });
  put("apps/web/out/sw.js", "// black-soup-v212-integrity-investigation-rc");
  put("apps/web/out/index.html", "<!doctype html><title>synthetic test build</title>");
  const identity = evidenceIdentity(root, "v212-package-preflight-fixture");
  put("docs/v2.12-run.json", identity);
  const log = `output/v212/${identity.runId}/build.log`, output = "Synthetic test fixture; not release evidence";
  put(log, output);
  put("docs/v2.12-build.json", { ...identity, coverage: "measured", passed: true, exitCode: 0, unchangedDuringBuild: true, evidence: [{ path: log, sha256: hashBytes(output) }] });
  const before = readdirSync(resolve(root, "docs")).sort();
  assert.throws(() => planV212Package(root), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /required gates not passed/u);
    assert.match(error.message, /historical-save-oracle/u);
    assert.match(error.message, /offline-all-cases/u);
    assert.match(error.message, /c01-cold-room-knock\/chromium\/1440x900/u);
    return true;
  });
  assert.equal(existsSync(resolve(root, V212_ARCHIVE)), false);
  assert.equal(existsSync(resolve(root, "dist")), false);
  assert.deepEqual(readdirSync(resolve(root, "docs")).sort(), before);
  // sourceHead is checked even though the shared sameIdentity helper omits it.
  put("docs/v2.12-run.json", { ...identity, sourceHead: "incorrect-head" });
  assert.throws(() => planV212Package(root), /source HEAD/u);
  put("docs/v2.12-run.json", identity);
  put("docs/v2.12-check-historical-save-oracle.json", { coverage: "not-run", passed: null, reason: "No same-build oracle execution yet", scope: "synthetic pending fixture", evidence: [] });
  put("docs/v2.12-check-core.json", { ...identity, sourceHead: "old-measured-head", coverage: "measured", passed: true, scope: "stale synthetic fixture", evidence: [{ path: log, sha256: hashBytes(output) }] });
  const verification = spawnSync(process.execPath, ["--experimental-strip-types", "--experimental-transform-types", fileURLToPath(new URL("./v212-verify.ts", import.meta.url))], { cwd: root, encoding: "utf8" });
  assert.equal(verification.status, 1, verification.stderr);
  const verificationReport = JSON.parse(readFileSync(resolve(root, "docs/v2.12-release-verification.json"), "utf8")) as { gates: GateEvidence[]; passed: boolean };
  assert.equal(verificationReport.passed, false);
  const pending = verificationReport.gates.find((gate) => gate.id === "historical-save-oracle");
  assert.equal(pending?.coverage, "not-run");
  assert.equal(pending?.passed, null);
  assert.equal(pending?.reason, "No same-build oracle execution yet");
  assert.equal(verificationReport.gates.find((gate) => gate.id === "core")?.coverage, "failed");
  assert.equal(existsSync(resolve(root, V212_ARCHIVE)), false);
});

const entries = [
  { path: "index.html", data: Buffer.from("<!doctype html><title>测试</title>") },
  { path: "case/c01-test/index.html", data: Buffer.from("test fixture route") },
  { path: "_next/static/chunk.js", data: Buffer.from("console.log('fixture');") },
];
const expected = entries.map(({ path, data }) => ({ path, bytes: data.length, sha256: hashBytes(data) }));

test("ZIP uses stable order/timestamps and round-trips every filename, size and SHA-256", () => {
  const zip = deterministicV212Zip(entries);
  assert.deepEqual(deterministicV212Zip([...entries].reverse()), zip);
  assert.deepEqual(verifyV212Zip(zip, expected).map((item) => item.path), [...entries].map((item) => item.path).sort());
  assert.equal(zip.readUInt16LE(10), 0);
  assert.equal(zip.readUInt16LE(12), 0x21);
});

test("ZIP validation rejects missing, extra, same-size altered and renamed files", () => {
  const zip = deterministicV212Zip(entries);
  assert.throws(() => verifyV212Zip(zip, expected.slice(1)), /count/u);
  assert.throws(() => verifyV212Zip(zip, [...expected, { path: "extra", bytes: 0, sha256: hashBytes("") }]), /count/u);
  assert.throws(() => verifyV212Zip(zip, expected.map((entry, index) => index ? entry : { ...entry, sha256: hashBytes("different") })), /SHA-256/u);
  assert.throws(() => verifyV212Zip(zip, expected.map((entry, index) => index ? entry : { ...entry, path: "renamed.html" })), /SHA-256/u);
  assert.throws(() => verifyV212Zip(zip, expected.map((entry, index) => index ? entry : { ...entry, bytes: entry.bytes + 1 })), /SHA-256/u);
});

test("ZIP validation detects central/local tampering, truncated data and duplicate records", () => {
  const zip = deterministicV212Zip(entries), central = zip.readUInt32LE(zip.length - 6);
  const changedName = Buffer.from(zip);
  changedName[30] ^= 1;
  assert.throws(() => verifyV212Zip(changedName, expected), /name mismatch/u);
  const changedCrc = Buffer.from(zip);
  changedCrc[central + 16] ^= 1;
  assert.throws(() => verifyV212Zip(changedCrc, expected), /metadata mismatch/u);
  const changedTime = Buffer.from(zip);
  changedTime.writeUInt16LE(1, central + 12);
  assert.throws(() => verifyV212Zip(changedTime, expected), /timestamp/u);
  assert.throws(() => verifyV212Zip(zip.subarray(0, zip.length - 1), expected), /end record/u);
  assert.throws(() => deterministicV212Zip([...entries, entries[0]]), /Duplicate/u);
});

test("ZIP paths and prior release budgets remain strict", () => {
  for (const path of ["../escape", "/absolute", "C:/absolute", "back\\slash", "double//slash", "dot/./entry", "bad\0name"]) {
    assert.throws(() => deterministicV212Zip([{ path, data: Buffer.from("x") }]), /Unsafe ZIP entry/u);
  }
  assert.throws(() => deterministicV212Zip([{ path: "oversized", data: Buffer.alloc(450_001) }]), /file-size budget/u);
  assert.throws(() => verifyV212Zip(Buffer.alloc(8_000_001), []), /8,000,000-byte budget/u);
});
