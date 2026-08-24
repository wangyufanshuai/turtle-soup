import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const source = resolve(root, "apps/web/out");
const dist = resolve(root, "dist/v1.8-internal-rc-web-pwa");
const archive = resolve(root, "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip");
if (!existsSync(source)) throw new Error("Run the v1.8 build first");
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true }); cpSync(source, dist, { recursive: true });
writeFileSync(resolve(dist, "INTERNAL-RC.txt"), "TURTLE SOUP v1.8 GOLDEN NINE EXPERIENCE HARDENING INTERNAL RC\r\n\r\n60 deterministic cases. Human participants: 0. Human evaluation: PENDING. Automation does not prove fun, aesthetics, comprehension, retention or market fit.\r\n", "utf8");
function files(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const crcTable = Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
function crc32(data: Buffer) { let crc = 0xffffffff; for (const value of data) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function deterministicZip(paths: string[]) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const path of paths) { const name = Buffer.from(relative(dist, path).split(sep).join("/"), "utf8"), data = readFileSync(path), crc = crc32(data); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); locals.push(local, name, data); const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(0x21, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, name); offset += local.length + name.length + data.length; }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(paths.length, 8); end.writeUInt16LE(paths.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, ...central, end]);
}
const contentFiles = files(dist).sort((a, b) => relative(dist, a).localeCompare(relative(dist, b))), zip = deterministicZip(contentFiles); writeFileSync(archive, zip);
const digest = createHash("sha256"); for (const path of contentFiles) { digest.update(relative(dist, path).split(sep).join("/")); digest.update(readFileSync(path)); }
const historical = [
  ["v1.0", "dist/turtle-soup-v1.0-internal-rc-web-pwa.zip", "83e2ee8e477ce9103735ea3d8eb0011ae6b72e257a286c7e009a2ef98cf7322b"],
  ["v1.1", "dist/turtle-soup-v1.1-internal-rc-web-pwa.zip", "0bc2b077317b6d32c2df10e14d35520917839a68d18b70d23fafa74991cb3f35"],
  ["v1.2", "dist/turtle-soup-v1.2-internal-rc-web-pwa.zip", "c3416a0ec807f9b94da8f00a0caab82b1b81e5745b6a5fd8b49c33e1279c7eb7"],
  ["v1.3", "dist/turtle-soup-v1.3-public-preview-web-pwa.zip", "f0dab2d4b0ce62897382e299da6aebb8655f572f106b89de12c855654002226e"],
  ["v1.4", "dist/turtle-soup-v1.4-internal-rc-web-pwa.zip", "b3db663a997b71744462b854b2ab45489447b627cda7cec9f524e25c335d8efb"],
  ["v1.5", "dist/turtle-soup-v1.5-internal-rc-web-pwa.zip", "2f8ccc674f0a749725295537f7115730cb33af12d5a192bb20cb3ed2fa3b3bf1"],
  ["v1.6", "dist/turtle-soup-v1.6-internal-rc-web-pwa.zip", "0c39375f3786cb6f4decedc4c5c47084db8e0a8d4d4c729c181707a9995bc295"],
  ["v1.7", "dist/turtle-soup-v1.7-internal-rc-web-pwa.zip", "c9787c09aa035f8cbab81ffdbe08ae73173031d8ba6eeaa9f6130b65a7723251"],
] as const;
const preservedArtifacts = historical.map(([version, path, expected]) => { const absolute = resolve(root, path); const actual = existsSync(absolute) ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : null; return { version, path, expected, actual, unchanged: expected === actual }; });
const report = { reportVersion: "1.8", releaseProfile: "v1.8-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, deterministicArchive: { method: "ZIP store", timestamp: "1980-01-01", utf8Paths: true }, artifact: { directory: "dist/v1.8-internal-rc-web-pwa", bytes: contentFiles.reduce((sum, path) => sum + statSync(path).size, 0), files: contentFiles.length, sha256: digest.digest("hex"), archive: { path: "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip", bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") } }, preservedArtifacts, passed: zip.length <= 8_000_000 && preservedArtifacts.every((item) => item.unchanged) };
writeFileSync(resolve(root, "docs/v1.8-release-artifacts.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify({ artifact: report.artifact, preserved: preservedArtifacts.every((item) => item.unchanged), passed: report.passed }, null, 2)); if (!report.passed) process.exitCode = 1;
