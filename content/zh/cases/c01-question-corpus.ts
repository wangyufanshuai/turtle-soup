import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["里面有人吗？", "query-person-inside"],
  ["敲门声是人敲的吗？", "query-knock-source"],
  ["这扇门会自动上锁吗？", "query-door-mechanism"],
  ["手机在冷藏室里吗？", "query-phone-inside"],
  ["那部手机是林澈的吗？", "query-lin-ownership"],
  ["样本在外面的储物柜里吗？", "query-sample-location"],
  ["他是想拖延检查吗？", "query-lin-motive"],
  ["方砚后来进过冷藏室吗？", "query-fang-entered"],
  ["托盘是不是蓝色的？", "query-irrelevant-color"],
];

const wrappers = [
  (text: string) => text,
  (text: string) => `${text}？`,
  (text: string) => ` ${text} `,
  (text: string) => `请问，${text}`,
  (text: string) => `我想确认：${text}`,
  (text: string) => `${text}！`,
  (text: string) => `现在能否确认${text.replace(/[？！]$/, "")}？`,
  (text: string) => `调查记录里，${text}`,
  (text: string) => `从现场看，${text}`,
  (text: string) => `请验证：${text}`,
  (text: string) => `${text.replace(/[？！]$/, "")}。`,
  (text: string) => `我的问题是：${text}`,
  (text: string) => `能不能判断${text.replace(/[？！]$/, "")}？`,
  (text: string) => `请回答一个事实：${text}`,
  (text: string) => `${text.replace(/[？！]$/, "")}（只回答事实）`,
  (text: string) => `关于这个案件，${text}`,
  (text: string) => `记录是否支持：${text}`,
];

export function buildC01QuestionCorpus(): QueryCorpusEntry[] {
  return seeds.flatMap(([text, queryId]) => wrappers.map((wrap, index) => ({
    id: `c01-${queryId}-${String(index + 1).padStart(2, "0")}`,
    rawQuestion: wrap(text),
    expectedQueryId: queryId,
    category: queryId === "query-irrelevant-color" ? "irrelevant" : "positive",
  })));
}

export const c01QuestionCorpus = buildC01QuestionCorpus();
