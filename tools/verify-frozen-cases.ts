import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const manifestPath = resolve(root, "content/zh/cases/manifest.v0.6.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { freezeId: string; cases: Array<{ id: string; file: string; contentVersion: number; canonicalHash: string; status: string; fileSha256: string }> };
const failures: string[] = [];
for (const entry of manifest.cases) {
  const filePath = resolve(root, "content/zh/cases", entry.file);
  let raw: Buffer;
  try { raw = readFileSync(filePath); } catch { failures.push(`${entry.id}: missing ${entry.file}`); continue; }
  const caseFile = JSON.parse(raw.toString("utf8")) as { id: string; metadata?: { contentVersion?: number; canonicalHash?: string; status?: string } };
  const actualSha = createHash("sha256").update(raw).digest("hex");
  if (caseFile.id !== entry.id) failures.push(`${entry.id}: id mismatch`);
  if (caseFile.metadata?.contentVersion !== entry.contentVersion) failures.push(`${entry.id}: contentVersion mismatch`);
  if (caseFile.metadata?.canonicalHash !== entry.canonicalHash) failures.push(`${entry.id}: canonicalHash mismatch`);
  if (caseFile.metadata?.status !== entry.status) failures.push(`${entry.id}: status mismatch`);
  if (actualSha !== entry.fileSha256) failures.push(`${entry.id}: fileSha256 mismatch (expected ${entry.fileSha256}, got ${actualSha})`);
}
const report = { freezeId: manifest.freezeId, caseCount: manifest.cases.length, passed: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
