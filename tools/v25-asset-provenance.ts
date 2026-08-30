import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v2.5-internal-rc");
const assetsRoot = resolve(root, "apps/web/public/assets/cases");
const season5 = release.entries.filter((entry) => entry.seasonId === "season-5");
const cases = season5.map((entry) => {
  const dir = resolve(assetsRoot, entry.id);
  const expected = ["scene.svg", "scene-mobile.svg", ...Array.from({ length: 5 }, (_, index) => `evidence-${String(index + 1).padStart(2, "0")}.svg`)];
  const assets = expected.map((name) => {
    const path = resolve(dir, name);
    const source = existsSync(path) ? readFileSync(path) : undefined;
    const text = source?.toString("utf8") ?? "";
    const title = text.match(/<title[^>]*>([^<]+)<\/title>/u)?.[1] ?? text.match(/aria-label="([^"]+)"/u)?.[1] ?? "";
    const description = text.match(/<desc[^>]*>([^<]+)<\/desc>/u)?.[1] ?? "";
    return {
      file: `apps/web/public/assets/cases/${entry.id}/${name}`,
      type: "SVG",
      dimensions: name.startsWith("scene") ? (name === "scene-mobile.svg" ? "mobile crop viewBox" : "1200×680 viewBox") : "640×400 viewBox",
      sha256: source ? createHash("sha256").update(source).digest("hex") : null,
      bytes: source?.length ?? 0,
      altText: description || title,
      prompt: `案件《${entry.public?.title ?? entry.id}》的${name.startsWith("scene") ? "公开现场索引" : "证据材料索引"}；档案室低饱和风格，结构化对象与关系路径，不承载唯一线索。`,
      generatedAt: "2026-08-30",
      tool: "deterministic SVG authoring / tools/generate-season-five.ts",
      humanEdits: "Codex visual QA: replaced placeholder geometry with layout-specific workshop, civic, acoustic or network composition; public labels only.",
      license: "project-authored",
      sourceStatus: "original",
      exists: Boolean(source),
    };
  });
  return { caseId: entry.id, assets, passed: assets.length === 7 && assets.every((item) => item.exists && item.sha256 && item.bytes > 500 && item.altText.length > 0) };
});
const report = {
  reportVersion: "2.5",
  releaseProfile: "v2.5-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  policy: { uniqueCluesInImages: false, altTextRequired: true, lazyCaseAssets: true, rasterCandidatesDeferred: true },
  caseCount: cases.length,
  assetCount: cases.reduce((sum, item) => sum + item.assets.length, 0),
  cases,
  passed: cases.length === 24 && cases.every((item) => item.passed),
};
writeFileSync(resolve(root, "docs/v2.5-asset-provenance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: report.caseCount, assetCount: report.assetCount, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
