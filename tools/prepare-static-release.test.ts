import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { resolve, join } from "node:path";

test("offline updates receive a fresh cache even for same-size changes within one release", () => {
  const evidenceRoot = resolve("output/homepage-cinema-2026-09-07/cache-regression");
  mkdirSync(evidenceRoot, { recursive: true });
  const fixture = mkdtempSync(join(evidenceRoot, "run-"));
  const out = join(fixture, "apps/web/out");
  mkdirSync(join(fixture, "apps/web/public"), { recursive: true });
  mkdirSync(join(out, "case/c01-cold-room-knock"), { recursive: true });
  mkdirSync(join(out, "_next/static"), { recursive: true });
  cpSync(resolve("apps/web/public/sw.js"), join(fixture, "apps/web/public/sw.js"));
  writeFileSync(join(out, "index.html"), "<main>old</main>");
  writeFileSync(join(out, "case/c01-cold-room-knock/index.html"), "case");
  writeFileSync(join(out, "_next/static/app.js"), "/* app */");
  const prepare = () => {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", resolve("tools/prepare-static-release.ts"), fixture, "apps/web/out", "report.json"], { encoding: "utf8", env: { ...process.env, TURTLE_SOUP_RELEASE_PROFILE: "v2.12-m3-dev" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(readFileSync(join(fixture, "report.json"), "utf8"));
  };
  const before = prepare();
  assert.equal(prepare().cacheName, before.cacheName, "identical assets should reuse the same cache identity");
  writeFileSync(join(out, "index.html"), "<main>new</main>");
  const after = prepare();
  assert.equal(after.totalBytes, before.totalBytes);
  assert.notEqual(after.cacheName, before.cacheName, "changed content must not share the old cache");
  assert.notEqual(after.manifestHash, before.manifestHash);
  assert.ok(after.entries.some((entry: { path: string }) => entry.path === "/"));
  const worker = readFileSync(join(out, "sw.js"), "utf8");
  assert.ok(worker.includes(after.cacheName));
});
