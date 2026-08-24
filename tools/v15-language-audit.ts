import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyQuestionAliasPack, normalizeQuestion, validateQuestionAliasPack, type QuestionAliasPack } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.5-internal-rc");
const packs = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.5/packs.json"), "utf8")) as QuestionAliasPack[];
const packByCase = new Map(packs.map((pack) => [pack.caseId, pack]));
const cases = [];
for (const entry of release.entries.filter((item) => /^c(0[1-9]|1[0-2])-/.test(item.id))) {
  const base = loadCaseFile(entry);
  const pack = packByCase.get(entry.id);
  const validation = validateQuestionAliasPack(base, pack);
  const enhanced = applyQuestionAliasPack(base, pack);
  const corpus = await loadQuestionCorpus(entry);
  const normalized = corpus.map((item) => item.rawQuestion.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "")).filter(Boolean);
  const duplicateRate = normalized.length ? 1 - new Set(normalized).size / normalized.length : 1;
  const corpusMismatches = corpus.filter((item) => { const result = normalizeQuestion(enhanced, item.rawQuestion); return result.status !== (item.expectedStatus ?? "matched") || (item.expectedQueryId !== undefined && item.expectedQueryId !== result.queryId); }).map((item) => item.id);
  const aliasMismatches = (pack?.aliases ?? []).filter((alias) => { const result = normalizeQuestion(enhanced, alias.text); return result.status !== "matched" || result.queryId !== alias.queryId; }).map((alias) => alias.text);
  const ambiguityMismatches = (pack?.ambiguousPhrases ?? []).filter((ambiguity) => { const result = normalizeQuestion(enhanced, ambiguity.text); return result.status !== "ambiguous" || !ambiguity.candidateQueryIds.every((id) => result.candidateQueryIds.includes(id)); }).map((ambiguity) => ambiguity.text);
  cases.push({ caseId: entry.id, corpusCount: corpus.length, duplicateRate, aliasRevision: pack?.revision ?? 0, aliasCount: pack?.aliases.length ?? 0, ambiguityCount: pack?.ambiguousPhrases?.length ?? 0, categories: [...new Set(pack?.aliases.map((alias) => alias.category) ?? [])], validation, corpusMismatches, aliasMismatches, ambiguityMismatches, passed: corpus.length >= 150 && duplicateRate < .1 && validation.valid && corpusMismatches.length === 0 && aliasMismatches.length === 0 && ambiguityMismatches.length === 0 });
}
const report = { reportVersion: "1.5", generatedAt: new Date().toISOString(), releaseProfile: "v1.5-internal-rc", status: "internal-rc / human-evaluation-pending", humanParticipants: 0, packSchemaVersion: 1, caseCount: cases.length, totalCorpus: cases.reduce((sum, item) => sum + item.corpusCount, 0), totalAliases: cases.reduce((sum, item) => sum + item.aliasCount, 0), totalAmbiguities: cases.reduce((sum, item) => sum + item.ambiguityCount, 0), maximumDuplicateRate: Math.max(...cases.map((item) => item.duplicateRate)), cases, passed: cases.length === 12 && cases.every((item) => item.passed), qualification: "Alias packs only route to existing deterministic public queries. They do not alter facts, answer codes, proof certificates or save identity." };
writeFileSync(resolve(root, "docs/v1.5-language-coverage.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: report.caseCount, corpus: report.totalCorpus, aliases: report.totalAliases, ambiguities: report.totalAmbiguities, maximumDuplicateRate: report.maximumDuplicateRate, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
