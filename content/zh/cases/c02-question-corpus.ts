import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

const seeds: Array<[string, string]> = [
  ["顾遥已经离开了吗？", "query-gu-left"], ["门打开时顾遥才到家吗？", "query-door-arrival"], ["雪是什么时候开始下的？", "query-snow-start"], ["顾遥是走回家的吗？", "query-person-walked"], ["维护车用过了吗？", "query-cart-used"], ["雪地上的痕迹被清掉了吗？", "query-tracks-erased"], ["顾遥是从秘密通道进的吗？", "query-secret-passage"], ["包裹是什么颜色？", "query-parcel-color"],
];
export const c02QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c02-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-parcel-color" ? ("irrelevant" as const) : ("positive" as const) }))),
];
