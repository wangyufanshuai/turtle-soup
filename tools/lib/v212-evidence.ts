import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export const V212_PROFILE = "v2.12-internal-rc";
export const V212_BASE_REF = "29673463024b036d9ad7eeb1aeba6973113f635a";
export type CoverageKind = "measured" | "static" | "not-run" | "failed";
export interface EvidenceIdentity {
  runId: string;
  releaseProfile: typeof V212_PROFILE;
  sourceHead: string;
  sourceTreeDigest: string;
  profileSha256: string;
  buildHash: string | null;
}
export interface GateEvidence {
  id: string;
  coverage: CoverageKind;
  passed: boolean | null;
  scope: string;
  evidence: string[];
  reason?: string;
}
export const hashBytes = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const slash = (value: string) => value.split(sep).join("/");
export const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });

export function writeReport(root: string, path: string, value: unknown) {
  const destination = resolve(root, path);
  if (!slash(relative(root, destination)).startsWith("docs/v2.12-") && !slash(relative(root, destination)).startsWith("output/v212/")) {
    throw new Error("v2.12 evidence writer refuses a historical or unrelated report path");
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function fileTree(root: string, directory: string): Array<{ path: string; bytes: number; sha256: string }> {
  const base = resolve(root, directory);
  if (!existsSync(base)) return [];
  function walk(directoryPath: string): string[] {
    return readdirSync(directoryPath).flatMap((name) => {
      const path = resolve(directoryPath, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }
  return walk(base).map((path) => ({ path: slash(relative(base, path)), bytes: statSync(path).size, sha256: hashBytes(readFileSync(path)) }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function currentSource(root: string) {
  // Reports, screenshots and build outputs are excluded to avoid self-referential hashes.
  // Untracked implementation files are included: a dirty worktree is not identified by HEAD alone.
  const paths = [...new Set(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "apps/web", "packages", "tools", "content", "package.json", "package-lock.json", "tsconfig.json"]).toString("utf8").split("\0").filter(Boolean))]
    .filter((path) => !/^apps\/web\/(?:\.next|out|\.generated|node_modules)\//u.test(path) && !/\/node_modules\//u.test(path))
    .sort();
  const files = paths.map((path) => ({ path, sha256: existsSync(resolve(root, path)) ? hashBytes(readFileSync(resolve(root, path))) : "deleted" }));
  return { head: git(root, ["rev-parse", "HEAD"]).toString("utf8").trim(), digest: hashBytes(JSON.stringify(files)), files };
}

export function evidenceIdentity(root: string, runId = `v212-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`): EvidenceIdentity {
  const source = currentSource(root);
  const built = fileTree(root, "apps/web/out");
  const sw = resolve(root, "apps/web/out/sw.js");
  const profileMatches = existsSync(sw) && readFileSync(sw, "utf8").includes("black-soup-v212-integrity-investigation-rc");
  return {
    runId, releaseProfile: V212_PROFILE, sourceHead: source.head, sourceTreeDigest: source.digest,
    profileSha256: hashBytes(readFileSync(resolve(root, `content/zh/releases/${V212_PROFILE}.json`))),
    buildHash: built.length && profileMatches ? hashBytes(JSON.stringify(built)) : null,
  };
}

export function sameIdentity(left: EvidenceIdentity, right: EvidenceIdentity): boolean {
  return ["runId", "releaseProfile", "sourceTreeDigest", "profileSha256", "buildHash"].every((key) => left[key as keyof EvidenceIdentity] === right[key as keyof EvidenceIdentity]);
}

export function loadRun(root: string): EvidenceIdentity {
  const path = resolve(root, "docs/v2.12-run.json");
  if (!existsSync(path)) throw new Error("Run npm run audit:v212:init after the final source/build changes first");
  const recorded = JSON.parse(readFileSync(path, "utf8")) as EvidenceIdentity;
  const current = evidenceIdentity(root, recorded.runId);
  if (!sameIdentity(recorded, current)) throw new Error("v2.12 run identity is stale: source/profile/build changed; initialize and rerun evidence");
  return current;
}

export const pendingGate = (id: string, scope: string, reason = "Not executed for this source and build"): GateEvidence => ({ id, scope, coverage: "not-run", passed: null, evidence: [], reason });
