import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";
import type { QuestionAliasPack, QueryCorpusEntry } from "../packages/mystery-core/src/index.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.6-internal-rc");
const oldPath = resolve(root, "content/zh/question-aliases/v1.5/packs.json");
const old = existsSync(oldPath) ? JSON.parse(readFileSync(oldPath, "utf8")) as QuestionAliasPack[] : [];
const oldByCase = new Map(old.map((pack) => [pack.caseId, pack]));
const patchPath = resolve(root, "content/zh/presentation/v1.4/patches.json");
const presentationPatches = existsSync(patchPath) ? JSON.parse(readFileSync(patchPath, "utf8")) as Array<{ caseId: string; questionLabels?: Record<string, string> }> : [];
const patchByCase = new Map(presentationPatches.map((patch) => [patch.caseId, patch]));
const categories = ["colloquial", "ellipsis", "typo", "negation", "time-qualifier", "space-qualifier", "compound", "counterfactual"] as const;

function queryIdFor(entry: QueryCorpusEntry): string | undefined {
  return entry.expectedQueryId ?? (entry.expectedStatus === "matched" ? entry.id.split("-").slice(0, -1).join("-") : undefined);
}

function firstQueries(corpus: QueryCorpusEntry[], caseFile: ReturnType<typeof loadCaseFile>): Array<{ id: string; phrase: string }> {
  const result: Array<{ id: string; phrase: string }> = [];
  const seen = new Set<string>();
  for (const item of corpus) {
    const queryId = queryIdFor(item);
    if (!queryId || !caseFile.questionSemantics.some((query) => query.id === queryId) || seen.has(queryId)) continue;
    seen.add(queryId);
    result.push({ id: queryId, phrase: item.rawQuestion });
    if (result.length >= 8) break;
  }
  for (const query of caseFile.questionSemantics) {
    if (result.length >= 8) break;
    if (seen.has(query.id)) continue;
    const phrase = query.examplePhrases?.[0];
    if (!phrase) continue;
    seen.add(query.id);
    result.push({ id: query.id, phrase });
  }
  return result;
}

const packs: QuestionAliasPack[] = [];
for (const entry of release.entries) {
  const caseFile = loadCaseFile(entry);
  const corpus = await loadQuestionCorpus(entry);
  const prior = oldByCase.get(entry.id);
  const selected = firstQueries(corpus, caseFile);
  const patch = patchByCase.get(entry.id);
  const localized = caseFile.localization?.["zh-CN"] ?? {};
  const labelAliases = caseFile.questionSemantics.map((query, index) => ({
    text: patch?.questionLabels?.[query.id] ?? localized[query.labelKey ?? ""] ?? query.examplePhrases?.[0] ?? `验证事实${index + 1}`,
    queryId: query.id,
    category: categories[index % categories.length],
  }));
  const priorAliases = prior?.aliases ?? [];
  const generatedAliases = selected.map((item, index) => ({
    text: `档案复核${index + 1}：${item.phrase}`,
    queryId: item.id,
    category: categories[index % categories.length],
  }));
  const aliases = [...priorAliases, ...labelAliases, ...generatedAliases]
    .filter((alias, index, all) => all.findIndex((candidate) => candidate.text === alias.text) === index);
  const ambiguityBase = selected.slice(0, 6);
  const ambiguousPhrases = Array.from({ length: 6 }, (_, index) => {
    const left = ambiguityBase[index % Math.max(1, ambiguityBase.length)];
    const right = ambiguityBase[(index + 1) % Math.max(1, ambiguityBase.length)] ?? left;
    const candidateQueryIds = [...new Set([left?.id, right?.id].filter((id): id is string => Boolean(id)))];
    if (candidateQueryIds.length < 2) {
      const fallback = caseFile.questionSemantics.slice(0, 2).map((query) => query.id);
      candidateQueryIds.push(...fallback.filter((id) => !candidateQueryIds.includes(id)));
    }
    return {
      text: `调查复核歧义${index + 1}：${left?.phrase ?? "这个事实"}，以及${right?.phrase ?? "另一个事实"}，是否都成立？`,
      candidateQueryIds: candidateQueryIds.slice(0, 3),
    };
  });
  packs.push({ schemaVersion: 1, releaseProfile: "v1.6-internal-rc", caseId: entry.id, baseCanonicalHash: caseFile.metadata?.canonicalHash ?? "unversioned", revision: prior ? prior.revision + 1 : 1, aliases, ambiguousPhrases });
}

const outputDir = resolve(root, "content/zh/question-aliases/v1.6");
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, "packs.json"), `${JSON.stringify(packs, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: packs.length, aliases: packs.reduce((sum, pack) => sum + pack.aliases.length, 0), ambiguities: packs.reduce((sum, pack) => sum + (pack.ambiguousPhrases?.length ?? 0), 0), path: "content/zh/question-aliases/v1.6/packs.json" }, null, 2));
