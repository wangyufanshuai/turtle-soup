import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("-")) ?? ".");
const source = resolve(root, "apps/web/out");
const v211 = process.argv.includes("--v211"), v210 = process.argv.includes("--v210"), v29 = process.argv.includes("--v29"), v28 = process.argv.includes("--v28");
const version = v211 ? "2.11" : v210 ? "2.10" : v29 ? "2.9" : v28 ? "2.8" : "2.7";
const profileId = v211 ? "v2.11-internal-rc" : v210 ? "v2.10-internal-rc" : v29 ? "v2.9-internal-rc" : v28 ? "v2.8-internal-rc" : "v2.7-internal-rc";
const dist = resolve(root, `dist/${profileId}-web-pwa`);
const archive = resolve(root, `dist/turtle-soup-${profileId}-web-pwa.zip`);
if (!existsSync(source)) throw new Error("Run the v2.7 build first");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(source, dist, { recursive: true });
writeFileSync(resolve(dist, "INTERNAL-RC.txt"), [
  v211 ? "TURTLE SOUP v2.11 · ACTION LOOP · INTERNAL RC" : v210 ? "TURTLE SOUP v2.10 · COMPLETED ARCHIVE · INTERNAL RC" : v29 ? "TURTLE SOUP v2.9 · LANGUAGE RECOVERY · INTERNAL RC" : v28 ? "TURTLE SOUP v2.8 · GUIDED INVESTIGATION · INTERNAL RC" : "TURTLE SOUP v2.7 · PLAYER-FIRST EXPERIENCE · INTERNAL RC", "",
  v211 ? "84 deterministic cases (Season 1–5). This release unifies next-action guidance and connects solved archives to the next case." : v210 ? "84 deterministic cases (Season 1–5). This release foregrounds completed-case archives and removes duplicate onboarding choices." : v29 ? "84 deterministic cases (Season 1–5). This release makes question recovery, optional AI setup and challenge budgets directly legible." : v28 ? "84 deterministic cases (Season 1–5). This release reduces opening hierarchy and adds progressive settings disclosure." : "84 deterministic cases (Season 1–5). This release clarifies setup, feedback and optional local AI routing.",
  "Status: internal-rc / human-evaluation-pending.",
  "Founder exploratory sessions: 1. Formal Fun Gate participants: 0.",
  "Canonical case truth, proof certificates, hashes and save schema remain frozen.",
  "Automation verifies consistency and engineering quality only; it does not prove fun, comprehension, retention or market fit.",
  "", "No network, account, analytics or remote AI is required to play offline.", "",
].join("\r\n"), "utf8");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const crcTable = Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
function crc32(data: Buffer) { let crc = 0xffffffff; for (const value of data) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function deterministicZip(paths: string[]) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const path of paths) {
    const name = Buffer.from(relative(dist, path).split(sep).join("/"), "utf8"); const data = readFileSync(path); const compressed = deflateRawSync(data, { level: 9 }); const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); locals.push(local, name, compressed);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(0x21, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, name); offset += local.length + name.length + compressed.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(paths.length, 8); end.writeUInt16LE(paths.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, ...central, end]);
}
const contentFiles = files(dist).sort((a, b) => relative(dist, a).localeCompare(relative(dist, b)));
const zip = deterministicZip(contentFiles); writeFileSync(archive, zip);
const historical = [
  ["v2.5", "dist/turtle-soup-v2.5-internal-rc-web-pwa.zip", "78d1a2b3168a729895734c5858c0415c459661f75ab8445bfaf14c0d514d5eaf"],
  ["v2.6", "dist/turtle-soup-v2.6-internal-rc-web-pwa.zip", "f79a3804dc764f215bbe919a419b67bdc963e4e2126b1c9a3076006b80cab18d"],
  ...(v28 ? [["v2.7", "dist/turtle-soup-v2.7-internal-rc-web-pwa.zip", "30fdce5b0a839e284966591a68823089cc5df00c200269c38886fb967d1c5733"]] : []),
  ...(v29 ? [["v2.7", "dist/turtle-soup-v2.7-internal-rc-web-pwa.zip", "30fdce5b0a839e284966591a68823089cc5df00c200269c38886fb967d1c5733"], ["v2.8", "dist/turtle-soup-v2.8-internal-rc-web-pwa.zip", "43cb35106794dc2dec0337518a96f33e48284e708d73e785ce2be1f8d908bce1"]] : []),
  ...(v210 ? [["v2.7", "dist/turtle-soup-v2.7-internal-rc-web-pwa.zip", "30fdce5b0a839e284966591a68823089cc5df00c200269c38886fb967d1c5733"], ["v2.8", "dist/turtle-soup-v2.8-internal-rc-web-pwa.zip", "43cb35106794dc2dec0337518a96f33e48284e708d73e785ce2be1f8d908bce1"], ["v2.9", "dist/turtle-soup-v2.9-internal-rc-web-pwa.zip", "5fe180fb477ab01a88eeb7ba55a9199b5dc5307b58b9fb257c421ae21b986e03"]] : []),
  ...(v211 ? [["v2.7", "dist/turtle-soup-v2.7-internal-rc-web-pwa.zip", "30fdce5b0a839e284966591a68823089cc5df00c200269c38886fb967d1c5733"], ["v2.8", "dist/turtle-soup-v2.8-internal-rc-web-pwa.zip", "43cb35106794dc2dec0337518a96f33e48284e708d73e785ce2be1f8d908bce1"], ["v2.9", "dist/turtle-soup-v2.9-internal-rc-web-pwa.zip", "5fe180fb477ab01a88eeb7ba55a9199b5dc5307b58b9fb257c421ae21b986e03"], ["v2.10", "dist/turtle-soup-v2.10-internal-rc-web-pwa.zip", "a37de5bd531422850e16ed7af65488771084dd45802f9511fd7515a02c72fa19"]] : []),
].map(([version, path, expected]) => { const file = resolve(root, path); const actual = existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "missing"; return { version, path, expected, actual, unchanged: actual === expected }; });
const artifact = { directory: `dist/${profileId}-web-pwa`, bytes: contentFiles.reduce((sum, path) => sum + statSync(path).size, 0), files: contentFiles.length, archive: { path: `dist/turtle-soup-${profileId}-web-pwa.zip`, bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") } };
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, deterministicArchive: { method: "ZIP deflate", timestamp: "1980-01-01" }, artifact, preservedArtifacts: historical, passed: artifact.archive.bytes <= 8_000_000 && historical.every((item) => item.unchanged) };
writeFileSync(resolve(root, `docs/v${version}-release-artifacts.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ artifact, preservedArtifacts: historical.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
