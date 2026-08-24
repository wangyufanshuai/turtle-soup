import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const distRoot = resolve(root, "dist");
const target = resolve(distRoot, "v1.0-internal-rc-web-pwa");
const archive = resolve(distRoot, "turtle-soup-v1.0-internal-rc-web-pwa.zip");
const reportPath = resolve(root, "docs/v1.0-release-artifacts.json");
const expectedPrefix = `${distRoot.toLowerCase()}${sep}`;
if (!target.toLowerCase().startsWith(expectedPrefix) || !archive.toLowerCase().startsWith(expectedPrefix)) throw new Error("Refusing to package outside dist");
if (!existsSync(outDir)) throw new Error("Run npm run build before packaging v1.0");

function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
function digest(dir: string) {
  const hash = createHash("sha256");
  const paths = files(dir).sort();
  for (const path of paths) { hash.update(relative(dir, path).split(sep).join("/")); hash.update(readFileSync(path)); }
  return { files: paths.length, bytes: paths.reduce((sum, path) => sum + statSync(path).size, 0), sha256: hash.digest("hex") };
}
function quote(value: string) { return value.replaceAll("'", "''"); }

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });
cpSync(outDir, target, { recursive: true });
writeFileSync(resolve(target, "INTERNAL-RC.txt"), "TURTLE SOUP v1.0 INTERNAL RC\r\n\r\n24 deterministic cases. Human participants: 0. Human Fun Gate: PENDING. This build is not a published quality claim.\r\n", "utf8");
if (existsSync(archive)) rmSync(archive, { force: true });
execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${quote(target)}\\*' -DestinationPath '${quote(archive)}' -CompressionLevel Optimal -Force`], { stdio: "inherit" });
const artifact = { path: relative(root, target).split(sep).join("/"), ...digest(target), archive: { path: relative(root, archive).split(sep).join("/"), bytes: statSync(archive).size, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") } };
const report = { reportVersion: "1.0", generatedAt: new Date().toISOString(), releaseProfile: "v1.0-internal-rc", status: "internal-rc", humanParticipants: 0, humanFunGate: "pending", caseCount: 24, artifact, passed: artifact.files > 0 && artifact.bytes <= 5_000_000 };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, artifact, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
