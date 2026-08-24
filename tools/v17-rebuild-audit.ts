import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const archive = resolve(root, "dist/turtle-soup-v1.7-internal-rc-web-pwa.zip");
const env = { ...process.env, TURTLE_SOUP_RELEASE_PROFILE: "v1.7-internal-rc" };
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
function treeDigest(dir: string): { sha256: string; files: number; bytes: number } {
  if (!existsSync(dir)) throw new Error(`Missing tree ${dir}`);
  const paths = files(dir).sort((left, right) => relative(dir, left).localeCompare(relative(dir, right)));
  const digest = createHash("sha256");
  let bytes = 0;
  for (const path of paths) { const data = readFileSync(path); bytes += data.length; digest.update(relative(dir, path).split(sep).join("/")); digest.update(data); }
  return { sha256: digest.digest("hex"), files: paths.length, bytes };
}
function fileDigest(path: string): { sha256: string; bytes: number } { const data = readFileSync(path); return { sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length }; }
function buildWindowsShell() { execSync("npm run build", { cwd: root, env, stdio: "inherit", shell: true }); }
function packageDirectNode() { execFileSync(process.execPath, ["--experimental-strip-types", "--experimental-transform-types", resolve(root, "tools/package-v17.ts"), root], { cwd: root, env, stdio: "inherit" }); }

buildWindowsShell();
const firstTree = treeDigest(outDir);
packageDirectNode();
const firstArchive = fileDigest(archive);
buildWindowsShell();
const secondTree = treeDigest(outDir);
packageDirectNode();
const secondArchive = fileDigest(archive);
const artifact = JSON.parse(readFileSync(resolve(root, "docs/v1.7-release-artifacts.json"), "utf8")) as { preservedArtifacts: Array<{ unchanged: boolean; version: string; expected: string; actual: string | null }> };
const checks = {
  staticTreeEqual: firstTree.sha256 === secondTree.sha256 && firstTree.files === secondTree.files && firstTree.bytes === secondTree.bytes,
  archiveEqual: firstArchive.sha256 === secondArchive.sha256 && firstArchive.bytes === secondArchive.bytes,
  windowsShellBuild: true,
  directNodePackaging: true,
  historicalArtifactsPreserved: artifact.preservedArtifacts.length === 7 && artifact.preservedArtifacts.every((item) => item.unchanged),
};
const report = {
  reportVersion: "1.7",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.7-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  runs: [{ id: "build-package-1", staticTree: firstTree, archive: firstArchive }, { id: "build-package-2", staticTree: secondTree, archive: secondArchive }],
  shellCoverage: { windowsNpmShell: "execSync(..., shell: true)", ciCompatibleDirectNode: "execFileSync(process.execPath, args)" },
  historicalArtifacts: artifact.preservedArtifacts,
  checks,
  passed: Object.values(checks).every(Boolean),
  qualification: "可重建性只证明同一源码与工具链下的字节稳定，不证明真人体验或外部环境永久可复现。",
};
writeFileSync(resolve(root, "docs/v1.7-rebuild-determinism.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ firstTree, secondTree, firstArchive, secondArchive, checks, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
