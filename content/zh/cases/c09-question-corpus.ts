import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

const seeds: Array<[string, string]> = [
  ["滴水前确实下过雨吗？", "query-rain-source"],
  ["22点雨已经停了吗？", "query-rain-stopped"],
  ["滴水时房间里有人吗？", "query-room-empty"],
  ["滴水是在雨停后发生的吗？", "query-drip-time"],
  ["屋顶天沟里有储存的水吗？", "query-reservoir"],
  ["水是沿排水管延迟下来的吗？", "query-pipe"],
  ["雨停后屋顶还在漏吗？", "query-roof-leak"],
  ["湿伞是滴水来源吗？", "query-umbrella"],
];

export const c09QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([question, queryId]) => wrappers.map((wrap, index) => ({
    id: `c09-${queryId}-${index}`,
    rawQuestion: wrap(question),
    expectedQueryId: queryId,
    category: queryId === "query-umbrella" ? "irrelevant" as const : "positive" as const,
  }))),
];
