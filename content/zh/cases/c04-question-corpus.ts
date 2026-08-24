import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

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

const wrappers = [
  (s: string) => s, (s: string) => `${s}？`, (s: string) => ` ${s} `, (s: string) => `请问，${s}`, (s: string) => `我想确认：${s}`, (s: string) => `${s}！`, (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`, (s: string) => `邮局记录里，${s}`, (s: string) => `从封存现场看，${s}`, (s: string) => `请验证：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}。`, (s: string) => `我的问题是：${s}`, (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`, (s: string) => `请回答一个事实：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`, (s: string) => `关于这批邮件，${s}`, (s: string) => `记录是否支持：${s}`, (s: string) => `在这个案件里，${s}`,
];

export const c04QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c04-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-postcard-color" ? ("irrelevant" as const) : ("positive" as const) }))),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `c04-extra-${index + 1}`, rawQuestion: "邮戳机器的日期错了吗？", expectedQueryId: "query-clock-wrong", category: "positive" as const })),
];

