import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

const seeds: Array<[string, string]> = [
  ["仓库真的停电了吗？", "query-power-cut"], ["第三盏灯是反光造成的吗？", "query-reflection"], ["真的有第三条电路吗？", "query-real-circuit"], ["应急灯是电池供电吗？", "query-lamp-source"], ["走廊外有红色信标吗？", "query-beacon"], ["有人趁停电进入仓库吗？", "query-intruder"], ["严琪是在走廊看见的吗？", "query-witness-angle"], ["现场其实只有两个光源吗？", "query-two-sources"], ["电池是什么颜色？", "query-battery-color"],
];
export const c05QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c05-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-battery-color" ? ("irrelevant" as const) : ("positive" as const) }))),
];
