import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  applyPresentationPatch,
  applyQuestionAliasPack,
  validateQuestionAliasPack,
  type CaseFile,
  type CasePresentationPatch,
  type QuestionAliasEntry,
  type QuestionAliasPack,
} from "../packages/mystery-core/src/index.ts";
import { mergeQuestionAliasPack } from "./lib/v17-overlays.ts";
import { mergePresentationPatch } from "./lib/v17-overlays.ts";

const root = resolve(process.argv[2] ?? ".");
const focusCases = ["c25-silent-second-bell", "c37-zeroed-pressure-gauge"];
const basePacks = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.6/packs.json"), "utf8")) as QuestionAliasPack[];
const basePatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as CasePresentationPatch[];
const overlayPatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.7/patches.json"), "utf8")) as CasePresentationPatch[];

function uniqueAliases(entries: QuestionAliasEntry[]): QuestionAliasEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.queryId}:${entry.text.normalize("NFKC").replace(/\s+/g, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const overlays: QuestionAliasPack[] = focusCases.map((caseId) => {
  const source = JSON.parse(readFileSync(resolve(root, `content/zh/cases/${caseId}.json`), "utf8")) as CaseFile;
  const caseFile = applyPresentationPatch(source, mergePresentationPatch(basePatches.find((patch) => patch.caseId === caseId), overlayPatches.find((patch) => patch.caseId === caseId)));
  const zh = caseFile.localization?.["zh-CN"] ?? {};
  const aliases = uniqueAliases(caseFile.questionSemantics.flatMap((query) => {
    const label = String(zh[String(query.labelKey)] ?? query.examplePhrases?.[0] ?? "").trim();
    if (!label) return [];
    const variants: QuestionAliasEntry[] = [
      { text: label, queryId: query.id, category: "colloquial" },
      { text: `那${label}`, queryId: query.id, category: "colloquial" },
      { text: `所以说，${label}`, queryId: query.id, category: "colloquial" },
      { text: `只确认：${label}`, queryId: query.id, category: "ellipsis" },
      { text: `从记录看，${label}`, queryId: query.id, category: "time-qualifier" },
    ];
    if (label.includes("吗")) variants.push({ text: label.replaceAll("吗", "嘛"), queryId: query.id, category: "typo" });
    if (label.includes("记录")) variants.push({ text: label.replaceAll("记录", "记绿"), queryId: query.id, category: "typo" });
    if (label.includes("时间")) variants.push({ text: label.replaceAll("时间", "时问"), queryId: query.id, category: "typo" });
    return variants;
  }));
  const overlay: QuestionAliasPack = {
    schemaVersion: 1,
    releaseProfile: "v1.7-internal-rc",
    caseId,
    baseCanonicalHash: source.metadata?.canonicalHash ?? "unversioned",
    revision: 2,
    aliases,
    ambiguousPhrases: [],
  };
  const merged = mergeQuestionAliasPack(basePacks.find((pack) => pack.caseId === caseId), overlay);
  if (!merged) throw new Error(`${caseId}: alias merge failed`);
  const validation = validateQuestionAliasPack(applyQuestionAliasPack(caseFile, undefined), merged);
  if (!validation.valid) throw new Error(`${caseId}: ${validation.failures.join("; ")}`);
  return overlay;
});

const outputPath = resolve(root, "content/zh/question-aliases/v1.7/packs.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(overlays, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, cases: overlays.length, aliases: overlays.reduce((sum, pack) => sum + pack.aliases.length, 0), revisions: overlays.map((pack) => ({ caseId: pack.caseId, revision: pack.revision })) }, null, 2));
