import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["电话线在响铃前已经断开了吗？", "query-line-state"],
  ["电话是在23点响的吗？", "query-ring-time"],
  ["是外部来电打进来的吗？", "query-external-call"],
  ["留言是在响铃前进入队列的吗？", "query-voicemail"],
  ["是维护测试回放让电话响的吗？", "query-replay"],
  ["响声来自内部手柄端点吗？", "query-endpoint"],
  ["有人重新接通电话线吗？", "query-reconnect"],
  ["传真机的噪声是电话响声吗？", "query-fax"],
];

const wrappers = [
  (s: string) => s,
  (s: string) => `${s}？`,
  (s: string) => `请问，${s}`,
  (s: string) => `我想确认：${s}`,
  (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`,
  (s: string) => `请核对：${s}`,
  (s: string) => `从机房记录看，${s}`,
  (s: string) => `请验证：${s}`,
  (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`,
  (s: string) => `关于这次响铃，${s}`,
  (s: string) => `记录是否支持：${s}`,
  (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`,
  (s: string) => `在这个案件里，${s}`,
  (s: string) => `我的问题是：${s}`,
  (s: string) => `请回答一个事实：${s}`,
  (s: string) => `调查一下：${s}`,
  (s: string) => `维护单里，${s}`,
];

export const c10QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([question, queryId]) => wrappers.map((wrap, index) => ({
    id: `c10-${queryId}-${index}`,
    rawQuestion: wrap(question),
    expectedQueryId: queryId,
    category: queryId === "query-fax" ? "irrelevant" as const : "positive" as const,
  }))),
  ...Array.from({ length: 20 }, (_, index) => ({
    id: `c10-extra-${index}`,
    rawQuestion: "是维护测试回放让电话响的吗？",
    expectedQueryId: "query-replay",
    category: "positive" as const,
  })),
];
