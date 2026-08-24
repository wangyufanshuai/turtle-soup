import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

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

export function buildC01QuestionCorpus(): QueryCorpusEntry[] {
  return seeds.flatMap(([text, queryId]) => wrappers.map((wrap, index) => ({
    id: `c01-${queryId}-${String(index + 1).padStart(2, "0")}`,
    rawQuestion: wrap(text),
    expectedQueryId: queryId,
    category: queryId === "query-irrelevant-color" ? "irrelevant" : "positive",
  })));
}

export const c01QuestionCorpus = buildC01QuestionCorpus();
