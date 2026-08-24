import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

const seeds: Array<[string, string]> = [
  ["这封信是在盖邮戳前写的吗？", "query-written-before"],
  ["邮戳机器的日期错了吗？", "query-clock-wrong"],
  ["有空白信封被拿来测试吗？", "query-test-envelope"],
  ["信已经离开邮局了吗？", "query-left-room"],
  ["封好的邮袋后来被打开了吗？", "query-bag-opened"],
  ["这真的是明天的邮戳吗？", "query-postmark-future"],
  ["这封信是伪造的吗？", "query-forged-letter"],
  ["邮袋封条完整吗？", "query-seal-intact"],
  ["明信片是什么颜色？", "query-postcard-color"],
];

export const c04QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c04-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-postcard-color" ? ("irrelevant" as const) : ("positive" as const) }))),
];
