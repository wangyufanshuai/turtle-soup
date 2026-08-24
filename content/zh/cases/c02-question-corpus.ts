import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["顾遥已经离开了吗？", "query-gu-left"], ["门打开时顾遥才到家吗？", "query-door-arrival"], ["雪是什么时候开始下的？", "query-snow-start"], ["顾遥是走回家的吗？", "query-person-walked"], ["维护车用过了吗？", "query-cart-used"], ["雪地上的痕迹被清掉了吗？", "query-tracks-erased"], ["顾遥是从秘密通道进的吗？", "query-secret-passage"], ["包裹是什么颜色？", "query-parcel-color"],
];
const wrappers = [
  (s: string) => s, (s: string) => `${s}？`, (s: string) => ` ${s} `, (s: string) => `请问，${s}`, (s: string) => `我想确认：${s}`, (s: string) => `${s}！`, (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`, (s: string) => `调查记录里，${s}`, (s: string) => `从雪地现场看，${s}`, (s: string) => `请验证：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}。`, (s: string) => `我的问题是：${s}`, (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`, (s: string) => `请回答一个事实：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`, (s: string) => `关于这条路线，${s}`, (s: string) => `记录是否支持：${s}`, (s: string) => `在这个案件里，${s}`,
];
export const c02QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c02-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-parcel-color" ? ("irrelevant" as const) : ("positive" as const) }))),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `c02-extra-${index + 1}`, rawQuestion: "顾遥已经离开了吗？", expectedQueryId: "query-gu-left", category: "positive" as const })),
];
