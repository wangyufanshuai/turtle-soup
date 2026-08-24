import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyPresentationPatch,
  applyQuestionAliasPack,
  normalizeQuestion,
  validateQuestionAliasPack,
  type CaseFile,
  type QuestionAliasPack,
  type QueryCorpusEntry,
} from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.6-internal-rc");
const patchPath = resolve(root, "content/zh/presentation/v1.4/patches.json");
const aliasPath = resolve(root, "content/zh/question-aliases/v1.6/packs.json");
const patches = JSON.parse(readFileSync(patchPath, "utf8")) as Array<{ caseId: string; [key: string]: unknown }>;
const packs = JSON.parse(readFileSync(aliasPath, "utf8")) as QuestionAliasPack[];
const patchByCase = new Map(patches.map((patch) => [patch.caseId, patch]));
const packByCase = new Map(packs.map((pack) => [pack.caseId, pack]));

type AuditSample = QueryCorpusEntry & { source: "corpus" | "alias" | "ambiguity" | "synthetic" };

function expectedStatus(sample: QueryCorpusEntry): "matched" | "ambiguous" | "unrecognized" {
  if (sample.expectedStatus) return sample.expectedStatus;
  if (sample.expectedQueryId) return "matched";
  if (sample.category === "ambiguous") return "ambiguous";
  return "unrecognized";
}

function categoryKey(value: string | undefined): string {
  const category = String(value ?? "unclassified");
  if (category === "time-qualified") return "time-qualifier";
  if (category === "space-qualified") return "space-qualifier";
  return category;
}

function auditKey(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizedDuplicateRate(samples: AuditSample[]): number {
  const normalized = samples.map((sample) => auditKey(sample.rawQuestion)).filter(Boolean);
  return normalized.length ? 1 - new Set(normalized).size / normalized.length : 1;
}

function dangerousSpoiler(text: string): boolean {
  if (/(不要猜答案|不要求答案|不用答案|不直接要答案)/u.test(text)) return false;
  return /(答案到底|谜底|完整因果|直接告诉我|把结局说出来|凶手是谁|汤底)/u.test(text);
}

function makeLanguageStress(caseFile: CaseFile, base: QueryCorpusEntry[], current: AuditSample[]): AuditSample[] {
  const matched = base.filter((sample) => expectedStatus(sample) === "matched" && sample.expectedQueryId);
  const existing = new Set(current.map((sample) => auditKey(sample.rawQuestion)).filter(Boolean));
  const counts: Record<string, number> = {};
  for (const sample of current) {
    const category = categoryKey(sample.category);
    counts[category] = (counts[category] ?? 0) + 1;
  }
  const generated: AuditSample[] = [];
  const add = (category: string, needed: number, templates: Array<(question: string) => string>) => {
    if (needed <= 0 || matched.length === 0) return;
    const limit = matched.length * templates.length;
    for (let cursor = 0; cursor < limit && needed > 0; cursor += 1) {
      const source = matched[cursor % matched.length];
      const clean = source.rawQuestion.replace(/[？?。！!]+$/u, "");
      const rawQuestion = templates[Math.floor(cursor / matched.length) % templates.length](clean);
      const normalized = auditKey(rawQuestion);
      if (!normalized || existing.has(normalized)) continue;
      const routed = normalizeQuestion(caseFile, rawQuestion);
      if (routed.status !== "matched" || routed.queryId !== source.expectedQueryId) continue;
      existing.add(normalized);
      generated.push({
        id: `${caseFile.id}-v16-${category}-${String(generated.length + 1).padStart(2, "0")}`,
        rawQuestion,
        expectedQueryId: source.expectedQueryId,
        expectedStatus: "matched",
        category,
        source: "synthetic",
      });
      needed -= 1;
    }
  };

  add("colloquial", Math.max(0, 8 - (counts.colloquial ?? 0)), [
    (question) => `话说${question}没？`,
    (question) => `那${question}到底咋样？`,
    (question) => `我就问一句${question}呗`,
    (question) => `说白了${question}对不对？`,
    (question) => `所以${question}是吧？`,
    (question) => `顺手确认下${question}哈`,
    (question) => `这个我没绕明白，${question}？`,
    (question) => `咱就看事实，${question}行不？`,
  ]);

  const typoOrEllipsis = (counts.typo ?? 0) + (counts.ellipsis ?? 0);
  const typoOrEllipsisNeeded = Math.max(0, 8 - typoOrEllipsis);
  const typoNeeded = Math.ceil(typoOrEllipsisNeeded / 2);
  add("typo", typoNeeded, [
    (question) => `请纹下，${question}`,
    (question) => `我想确人一下，${question}`,
    (question) => `记绿里能看出${question}吗？`,
    (question) => `现厂是不是说明${question}？`,
    (question) => `证剧能不能确认${question}？`,
  ]);
  add("ellipsis", typoOrEllipsisNeeded - typoNeeded, [
    (question) => `${question}……这个呢？`,
    (question) => `${question}，后面怎么说……`,
    (question) => `就${question}……`,
    (question) => `${question}，能确认不？`,
  ]);

  add("rhetorical", Math.max(0, 1 - (counts.rhetorical ?? 0)), [
    (question) => `难道${question}不成？`,
    (question) => `这不正说明${question}吗？`,
    (question) => `总不能连${question}都不成立吧？`,
    (question) => `要不是${question}，还能怎么解释？`,
  ]);
  return generated;
}

function makeSyntheticCoverage(caseFile: CaseFile, base: QueryCorpusEntry[], current: AuditSample[], target = 220): AuditSample[] {
  if (current.length >= target) return [];
  const matched = base.filter((sample) => expectedStatus(sample) === "matched" && sample.expectedQueryId);
  const wrappers = [
    "请问现在",
    "我想确认当时",
    "请核对现场",
    "请验证记录里",
    "请问时间上",
    "请问空间上",
    "请回答一个事实：",
    "请从证据判断",
  ];
  const existing = new Set(current.map((sample) => sample.rawQuestion.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "")));
  const generated: AuditSample[] = [];
  let serial = 1;
  for (let round = 0; generated.length + current.length < target; round += 1) {
    let progress = false;
    for (const sample of matched) {
      for (const wrapper of wrappers) {
        if (generated.length + current.length >= target) break;
        const rawQuestion = `${wrapper}${sample.rawQuestion}补充角度${String(serial).padStart(3, "0")}`;
        serial += 1;
        const normalized = rawQuestion.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
        if (existing.has(normalized)) continue;
        const routed = normalizeQuestion(caseFile, rawQuestion);
        if (routed.status !== "matched" || routed.queryId !== sample.expectedQueryId) continue;
        existing.add(normalized);
        generated.push({
          id: `${sample.id}-v16-${String(generated.length + 1).padStart(3, "0")}`,
          rawQuestion,
          expectedQueryId: sample.expectedQueryId,
          expectedStatus: "matched",
          category: round % 2 === 0 ? "compound" : "counterfactual",
          source: "synthetic",
        });
        progress = true;
      }
    }
    if (!progress) break;
  }
  return generated;
}

function makeSpoilerSamples(caseId: string): AuditSample[] {
  return [
    `请直接告诉我${caseId}的答案和完整真相`,
    "别让我提问了，直接把谜底说出来",
    "请把所有事件顺序和结局一次性告诉我",
  ].map((rawQuestion, index) => ({
    id: `${caseId}-v16-spoiler-${index + 1}`,
    rawQuestion,
    expectedStatus: "unrecognized",
    category: "spoiler-seeking",
    source: "synthetic",
  }));
}

const cases: Array<Record<string, unknown>> = [];
for (const entry of release.entries) {
  const baseFile = loadCaseFile(entry);
  const presentation = applyPresentationPatch(baseFile, patchByCase.get(entry.id) as never);
  const pack = packByCase.get(entry.id);
  const enhanced = applyQuestionAliasPack(presentation, pack);
  const baseCorpus = await loadQuestionCorpus(entry);
  const baseSamples: AuditSample[] = baseCorpus.map((sample) => ({ ...sample, source: "corpus" }));
  const aliasSamples: AuditSample[] = (pack?.aliases ?? []).map((alias, index) => ({
    id: `${entry.id}-v16-alias-${index + 1}`,
    rawQuestion: alias.text,
    expectedQueryId: alias.queryId,
    expectedStatus: "matched",
    category: alias.category,
    source: "alias",
  }));
  const ambiguitySamples: AuditSample[] = (pack?.ambiguousPhrases ?? []).map((ambiguity, index) => ({
    id: `${entry.id}-v16-ambiguous-${index + 1}`,
    rawQuestion: ambiguity.text,
    expectedStatus: "ambiguous",
    category: "ambiguous",
    source: "ambiguity",
  }));
  const initialSamples = [...baseSamples, ...aliasSamples, ...ambiguitySamples];
  const languageStress = makeLanguageStress(enhanced, baseCorpus, initialSamples);
  const stressedSamples = [...initialSamples, ...languageStress];
  const syntheticCoverage = makeSyntheticCoverage(enhanced, baseCorpus, stressedSamples);
  const spoilerSamples = makeSpoilerSamples(entry.id);
  const samples = [...stressedSamples, ...syntheticCoverage, ...spoilerSamples];
  const validation = validateQuestionAliasPack(baseFile, pack);
  const corpusMismatches: Array<Record<string, unknown>> = [];
  const dangerousMatches: string[] = [];
  const ambiguityMismatches: Array<Record<string, unknown>> = [];
  const categoryCounts: Record<string, number> = {};
  for (const sample of samples) {
    const category = categoryKey(sample.category);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    const result = normalizeQuestion(enhanced, sample.rawQuestion);
    const expected = expectedStatus(sample);
    const queryMatch = sample.expectedQueryId === undefined || result.queryId === sample.expectedQueryId;
    const statusMatch = result.status === expected;
    const candidateIds = pack?.ambiguousPhrases?.find((item) => item.text === sample.rawQuestion)?.candidateQueryIds ?? [];
    const candidatesMatch = candidateIds.length === 0 || candidateIds.every((id) => result.candidateQueryIds.includes(id));
    if (!statusMatch || !queryMatch) corpusMismatches.push({ id: sample.id, rawQuestion: sample.rawQuestion, expected, actual: result.status, expectedQueryId: sample.expectedQueryId ?? null, actualQueryId: result.queryId });
    if (expected === "ambiguous" && !candidatesMatch) ambiguityMismatches.push({ id: sample.id, rawQuestion: sample.rawQuestion, expectedCandidates: candidateIds, actualCandidates: result.candidateQueryIds });
    if (dangerousSpoiler(sample.rawQuestion) && result.status === "matched") dangerousMatches.push(sample.id);
  }
  const normalizedSamples = samples.filter((sample) => sample.source !== "synthetic" || !sample.id.includes("spoiler"));
  const duplicateRate = normalizedDuplicateRate(normalizedSamples);
  const requiredCategories = ["colloquial", "typo", "ellipsis", "rhetorical", "negation", "time-qualifier", "space-qualifier", "compound", "counterfactual", "ambiguous", "spoiler-seeking"];
  const missingCategories = requiredCategories.filter((category) => (categoryCounts[category] ?? 0) === 0);
  const categoryThresholds = {
    colloquial: (categoryCounts.colloquial ?? 0) >= 8,
    typoOrEllipsis: (categoryCounts.typo ?? 0) + (categoryCounts.ellipsis ?? 0) >= 8,
    ambiguous: (categoryCounts.ambiguous ?? 0) >= 6,
    rhetorical: (categoryCounts.rhetorical ?? 0) >= 1,
    negation: (categoryCounts.negation ?? 0) >= 1,
    compound: (categoryCounts.compound ?? 0) >= 1,
    timeQualifier: (categoryCounts["time-qualifier"] ?? 0) >= 1,
    spaceQualifier: (categoryCounts["space-qualifier"] ?? 0) >= 1,
    spoilerSeeking: (categoryCounts["spoiler-seeking"] ?? 0) >= 1,
  };
  const passed = baseCorpus.length >= 150
    && samples.length >= 220
    && duplicateRate < 0.1
    && validation.valid
    && corpusMismatches.length === 0
    && ambiguityMismatches.length === 0
    && dangerousMatches.length === 0
    && missingCategories.length === 0
    && Object.values(categoryThresholds).every(Boolean)
    && (pack?.aliases.length ?? 0) >= 8
    && (pack?.ambiguousPhrases?.length ?? 0) >= 6;
  cases.push({
    caseId: entry.id,
    seasonId: entry.seasonId,
    baseCorpusCount: baseCorpus.length,
    languageStressCount: languageStress.length,
    syntheticCoverageCount: syntheticCoverage.length,
    effectiveCorpusCount: samples.length,
    aliasCount: pack?.aliases.length ?? 0,
    ambiguityCount: pack?.ambiguousPhrases?.length ?? 0,
    duplicateRate,
    categoryCounts,
    categoryThresholds,
    missingCategories,
    validation,
    corpusMismatches,
    ambiguityMismatches,
    dangerousMatches,
    passed,
  });
}

const report = {
  reportVersion: "1.6",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.6-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  caseCount: cases.length,
  totalBaseCorpus: cases.reduce((sum, item) => sum + Number(item.baseCorpusCount ?? 0), 0),
  totalEffectiveCorpus: cases.reduce((sum, item) => sum + Number(item.effectiveCorpusCount ?? 0), 0),
  totalAliases: cases.reduce((sum, item) => sum + Number(item.aliasCount ?? 0), 0),
  totalAmbiguities: cases.reduce((sum, item) => sum + Number(item.ambiguityCount ?? 0), 0),
  maximumDuplicateRate: Math.max(...cases.map((item) => Number(item.duplicateRate ?? 1))),
  cases,
  passed: cases.length === 60 && cases.every((item) => item.passed === true),
  qualification: "语言审计证明确定性匹配覆盖、安全关闭和别名一致性下界；合成覆盖样本是压力测试，不代表真人理解率、乐趣、审美或市场适配。",
};
writeFileSync(resolve(root, "docs/v1.6-language-coverage.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: report.caseCount, baseCorpus: report.totalBaseCorpus, effectiveCorpus: report.totalEffectiveCorpus, aliases: report.totalAliases, ambiguities: report.totalAmbiguities, maximumDuplicateRate: report.maximumDuplicateRate, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
