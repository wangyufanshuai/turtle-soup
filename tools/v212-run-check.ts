import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evidenceIdentity, hashBytes, loadRun, sameIdentity, V212_PROFILE, writeReport } from "./lib/v212-evidence.ts";

const root = resolve(".");
const name = process.argv[2] ?? "core";
const nodeFlags = ["--experimental-strip-types", "--experimental-transform-types"];
const packageFile = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const commands: Record<string, { args: string[]; cwd: string; scope: string; kind: "measured" | "static"; tap?: boolean }> = {
  core: { args: ["--test-reporter=tap", ...packageFile.scripts["test:core"].split(" ").slice(1)], cwd: root, scope: "Registered Node core/runtime/UI-helper tests; NOT browser gameplay, visual review or historical-log fixtures", kind: "measured", tap: true },
  integrity: { args: ["--test", "--test-reporter=tap", ...nodeFlags, "packages/mystery-core/src/integrity.test.ts", "apps/web/workers/runtime-handler.test.ts"], cwd: root, scope: "Integrity regression and the production Worker message handler under Node; browser Worker startup requires separate evidence", kind: "measured", tap: true },
  "typecheck-core": { args: ["node_modules/typescript/bin/tsc", "--noEmit"], cwd: root, scope: "TypeScript static diagnostics for packages/**/*.ts", kind: "static" },
  "typecheck-web": { args: [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit"], cwd: resolve(root, "apps/web"), scope: "TypeScript static diagnostics for the web application", kind: "static" },
  frozen: { args: [...nodeFlags, "tools/v212-baseline.ts", "--check"], cwd: root, scope: "Fixed HEAD-to-disk bytes for all frozen cases, historical manifests/profiles/reports/ZIPs", kind: "measured" },
};
const command = commands[name];
if (!command) throw new Error(`Unknown check; choose ${Object.keys(commands).join(", ")}`);
const before = loadRun(root);
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, command.args, { cwd: command.cwd, env: { ...process.env, TURTLE_SOUP_RELEASE_PROFILE: V212_PROFILE }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`;
const logPath = `output/v212/${before.runId}/${name}.log`;
mkdirSync(resolve(root, "output/v212", before.runId), { recursive: true });
writeFileSync(resolve(root, logPath), output, "utf8");
const after = evidenceIdentity(root, before.runId);
const tests = command.tap ? Number(output.match(/^# tests (\d+)$/mu)?.[1] ?? 0) : null;
const failures = command.tap ? Number(output.match(/^# fail (\d+)$/mu)?.[1] ?? -1) : null;
const skips = command.tap ? Number(output.match(/^# skipped (\d+)$/mu)?.[1] ?? -1) : null;
const passed = result.status === 0 && sameIdentity(before, after) && (!command.tap || Boolean(tests && failures === 0 && skips === 0));
writeReport(root, `docs/v2.12-check-${name}.json`, {
  ...before, startedAt, endedAt: new Date().toISOString(), id: name,
  coverage: passed ? command.kind : "failed", passed, scope: command.scope,
  command: { executable: "node", args: command.args, cwd: command.cwd === root ? "." : "apps/web" },
  exitCode: result.status, unchangedDuringCheck: sameIdentity(before, after), tests, failures, skips,
  evidence: [{ path: logPath, sha256: hashBytes(output) }],
});
console.log(output);
console.log(JSON.stringify({ name, passed, tests, failures, skips, identityStable: sameIdentity(before, after) }, null, 2));
if (!passed) process.exitCode = 1;
