import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

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

export const c10QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([question, queryId]) => wrappers.map((wrap, index) => ({
    id: `c10-${queryId}-${index}`,
    rawQuestion: wrap(question),
    expectedQueryId: queryId,
    category: queryId === "query-fax" ? "irrelevant" as const : "positive" as const,
  }))),
];
