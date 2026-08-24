import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const source = resolve(root, "apps/web/out");
const dist = resolve(root, "dist/v1.4-internal-rc-web-pwa");
const archive = resolve(root, "dist/turtle-soup-v1.4-internal-rc-web-pwa.zip");
if (!existsSync(source)) throw new Error("Run npm run build first");
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true }); cpSync(source, dist, { recursive: true });
const quote = (value: string) => value.replaceAll("'", "''");
if (existsSync(archive)) rmSync(archive);
execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${quote(dist)}\\*' -DestinationPath '${quote(archive)}' -CompressionLevel Optimal -Force`], { stdio: "inherit" });
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const contentFiles = files(dist).sort();
const digest = createHash("sha256");
for (const path of contentFiles) { digest.update(relative(dist, path).split(sep).join("/")); digest.update(readFileSync(path)); }
const oldArchives = ["v1.0-internal-rc", "v1.1-internal-rc", "v1.2-internal-rc", "v1.3-public-preview"].map((version) => `dist/turtle-soup-${version}-web-pwa.zip`);
const report = {
  reportVersion: "1.4",
  releaseProfile: "v1.4-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  artifact: {
    directory: "dist/v1.4-internal-rc-web-pwa",
    bytes: contentFiles.reduce((sum, path) => sum + statSync(path).size, 0),
    files: contentFiles.length,
    sha256: digest.digest("hex"),
    archive: { path: "dist/turtle-soup-v1.4-internal-rc-web-pwa.zip", bytes: statSync(archive).size, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") },
  },
  preservedArtifacts: oldArchives,
  preservedArtifactsPresent: oldArchives.map((path) => ({ path, exists: existsSync(resolve(root, path)) })),
  passed: true,
};
writeFileSync(resolve(root, "docs/v1.4-release-artifacts.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
