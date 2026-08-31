import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = resolve(process.argv[2] ?? ".");
const source = resolve(root, "apps/web/out");
const profileId = "v2.7-internal-rc";
const dist = resolve(root, `dist/${profileId}-web-pwa`);
const archive = resolve(root, `dist/turtle-soup-${profileId}-web-pwa.zip`);
if (!existsSync(source)) throw new Error("Run the v2.7 build first");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(source, dist, { recursive: true });
writeFileSync(resolve(dist, "INTERNAL-RC.txt"), [
  "TURTLE SOUP v2.7 · PLAYER-FIRST EXPERIENCE · INTERNAL RC", "",
  "84 deterministic cases (Season 1–5). This release clarifies setup, feedback and optional local AI routing.",
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
].map(([version, path, expected]) => { const file = resolve(root, path); const actual = existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "missing"; return { version, path, expected, actual, unchanged: actual === expected }; });
const artifact = { directory: `dist/${profileId}-web-pwa`, bytes: contentFiles.reduce((sum, path) => sum + statSync(path).size, 0), files: contentFiles.length, archive: { path: `dist/turtle-soup-${profileId}-web-pwa.zip`, bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") } };
const report = { reportVersion: "2.7", releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, deterministicArchive: { method: "ZIP deflate", timestamp: "1980-01-01" }, artifact, preservedArtifacts: historical, passed: artifact.archive.bytes <= 8_000_000 && historical.every((item) => item.unchanged) };
writeFileSync(resolve(root, "docs/v2.7-release-artifacts.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ artifact, preservedArtifacts: historical.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
