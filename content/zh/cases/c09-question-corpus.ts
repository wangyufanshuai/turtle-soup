import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

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

const wrappers = [
  (s: string) => s,
  (s: string) => `${s}？`,
  (s: string) => `请问，${s}`,
  (s: string) => `我想确认：${s}`,
  (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`,
  (s: string) => `请核对：${s}`,
  (s: string) => `现场问题：${s}`,
  (s: string) => `请验证：${s}`,
  (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`,
  (s: string) => `请给出记录结论：${s}`,
  (s: string) => `记录支持这个说法吗：${s}`,
  (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`,
  (s: string) => `在这个案件里，${s}`,
  (s: string) => `我的问题是：${s}`,
  (s: string) => `请回答一个事实：${s}`,
  (s: string) => `调查一下：${s}`,
  (s: string) => `请从证据判断：${s}`,
];

export const c09QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([question, queryId]) => wrappers.map((wrap, index) => ({
    id: `c09-${queryId}-${index}`,
    rawQuestion: wrap(question),
    expectedQueryId: queryId,
    category: queryId === "query-umbrella" ? "irrelevant" as const : "positive" as const,
  }))),
  ...Array.from({ length: 20 }, (_, index) => ({
    id: `c09-extra-${index}`,
    rawQuestion: "水是沿排水管延迟下来的吗？",
    expectedQueryId: "query-pipe",
    category: "positive" as const,
  })),
];
