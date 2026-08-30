import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

/**
 * Packages the already-built static export without touching any prior release.
 * The archive deliberately uses ZIP store + a fixed DOS timestamp so reruns are
 * reproducible for the same `apps/web/out` tree.
 */
const root = resolve(process.argv[2] ?? ".");
const source = resolve(root, "apps/web/out");
const profileId = "v2.5-internal-rc";
const dist = resolve(root, `dist/${profileId}-web-pwa`);
const archive = resolve(root, `dist/turtle-soup-${profileId}-web-pwa.zip`);
if (!existsSync(source)) throw new Error("Run the v2.5 build first");

// This target is owned by this release only. Historical release directories and
// archives are intentionally never removed or modified.
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(source, dist, { recursive: true });
writeFileSync(resolve(dist, "INTERNAL-RC.txt"), [
  "TURTLE SOUP v2.5 · SEASON 5 CONTENT EXPANSION · INTERNAL RC",
  "",
  "84 deterministic cases (Season 1–5). Season 5 adds C61–C84.",
  "Status: internal-rc / human-evaluation-pending.",
  "Founder exploratory sessions: 1. Formal Fun Gate participants: 0.",
  "Automation verifies consistency and engineering quality only; it does not prove fun, aesthetics, comprehension, retention or market fit.",
  "",
  "No network, account, analytics, remote AI or third-party tracking is required to play offline.",
  "",
].join("\r\n"), "utf8");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function deterministicZip(paths: string[]) {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const path of paths) {
    const name = Buffer.from(relative(dist, path).split(sep).join("/"), "utf8");
    const data = readFileSync(path);
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); // deflate; deterministic and keeps the preview under budget
    local.writeUInt16LE(0x21, 12); // 1980-01-01, reproducible archive
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(paths.length, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const contentFiles = files(dist).sort((a, b) => relative(dist, a).localeCompare(relative(dist, b)));
const zip = deterministicZip(contentFiles);
writeFileSync(archive, zip);

const historical = [
  ["v0.9-web-pwa", "75698821a384f5f85ebd1409217b5efba7d8364e69d159f49afec8054fc58beb"],
  ["v1.0-internal-rc-web-pwa", "83e2ee8e477ce9103735ea3d8eb0011ae6b72e257a286c7e009a2ef98cf7322b"],
  ["v1.1-internal-rc-web-pwa", "0bc2b077317b6d32c2df10e14d35520917839a68d18b70d23fafa74991cb3f35"],
  ["v1.2-internal-rc-web-pwa", "c3416a0ec807f9b94da8f00a0caab82b1b81e5745b6a5fd8b49c33e1279c7eb7"],
  ["v1.3-public-preview-web-pwa", "f0dab2d4b0ce62897382e299da6aebb8655f572f106b89de12c855654002226e"],
  ["v1.4-internal-rc-web-pwa", "b3db663a997b71744462b854b2ab45489447b627cda7cec9f524e25c335d8efb"],
  ["v1.5-internal-rc-web-pwa", "2f8ccc674f0a749725295537f7115730cb33af12d5a192bb20cb3ed2fa3b3bf1"],
  ["v1.6-internal-rc-web-pwa", "0c39375f3786cb6f4decedc4c5c47084db8e0a8d4d4c729c181707a9995bc295"],
  ["v1.7-internal-rc-web-pwa", "c9787c09aa035f8cbab81ffdbe08ae73173031d8ba6eeaa9f6130b65a7723251"],
  ["v1.8-internal-rc-web-pwa", "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d"],
  ["v1.9-internal-rc-web-pwa", "c3c074e1170ca2efd7db0b3c0437873dc7d8633074ab4ff4c62c5b7910a8a6fc"],
  ["v2.0-internal-rc-web-pwa", "76e8d237acdc94f99f8cf48ca25bc8f1b22b6bdc86ce2a74153700d290a27273"],
  ["v2.1-internal-rc-web-pwa", "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929"],
  ["v2.2-internal-rc-web-pwa", "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937"],
  ["v2.3-internal-rc-web-pwa", "e88a0b12d9437cd3c9e3d94bce81481756629ae19439cfd93ed406f45586f9d4"],
  ["v2.4-internal-rc-web-pwa", "58b4b4f140cbcd959b3578037cbe94894491204d03cbf923ca648f1f927db25f"],
].map(([version, expected]) => {
  const path = resolve(root, `dist/turtle-soup-${version}.zip`);
  const actual = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
  return { version, path: `dist/turtle-soup-${version}.zip`, expected, actual, unchanged: actual === expected };
});
const artifact = {
  directory: `dist/${profileId}-web-pwa`,
  bytes: contentFiles.reduce((sum, path) => sum + statSync(path).size, 0),
  files: contentFiles.length,
  archive: { path: `dist/turtle-soup-${profileId}-web-pwa.zip`, bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") },
};
const report = {
  reportVersion: "2.5",
  releaseProfile: profileId,
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  deterministicArchive: { method: "ZIP store", timestamp: "1980-01-01" },
  artifact,
  preservedArtifacts: historical,
  passed: artifact.archive.bytes <= 8_000_000 && historical.every((item) => item.unchanged),
};
writeFileSync(resolve(root, "docs/v2.5-release-artifacts.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ artifact, preservedArtifacts: historical.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
