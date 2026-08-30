import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const v24 = process.argv.includes("--v24"), v23 = process.argv.includes("--v23"), v22 = process.argv.includes("--v22"), v21 = process.argv.includes("--v21"), version = v24 ? "2.4" : v23 ? "2.3" : v22 ? "2.2" : v21 ? "2.1" : "2.0", profileId = `v${version}-internal-rc`;
const root = resolve(process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "."), registry = "https://registry.npmjs.org";
const run = spawnSync("npm", ["audit", `--registry=${registry}`, "--json"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: process.platform === "win32" });
let audit: any;
const output = String(run.stdout ?? run.stderr ?? "");
try { audit = JSON.parse(output); } catch { audit = { error: { message: run.error?.message ?? "npm audit did not return JSON", detail: output.slice(0, 2000) } }; }
const vulnerabilities = audit.metadata?.vulnerabilities ?? {}, total = Number(vulnerabilities.total ?? Number.POSITIVE_INFINITY);
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), registry, commandExitCode: run.status, vulnerabilities, auditError: audit.error ?? null, note: "Registry override applies only to this audit command; user npm configuration was not changed.", passed: total === 0 && !audit.error };
writeFileSync(resolve(root, `docs/v${version}-dependency-audit.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
