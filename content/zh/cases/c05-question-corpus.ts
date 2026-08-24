import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["仓库真的停电了吗？", "query-power-cut"], ["第三盏灯是反光造成的吗？", "query-reflection"], ["真的有第三条电路吗？", "query-real-circuit"], ["应急灯是电池供电吗？", "query-lamp-source"], ["走廊外有红色信标吗？", "query-beacon"], ["有人趁停电进入仓库吗？", "query-intruder"], ["严琪是在走廊看见的吗？", "query-witness-angle"], ["现场其实只有两个光源吗？", "query-two-sources"], ["电池是什么颜色？", "query-battery-color"],
];
const wrappers = [
  (s: string) => s, (s: string) => `${s}？`, (s: string) => ` ${s} `, (s: string) => `请问，${s}`, (s: string) => `我想确认：${s}`, (s: string) => `${s}！`, (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`, (s: string) => `仓库记录里，${s}`, (s: string) => `从现场角度看，${s}`, (s: string) => `请验证：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}。`, (s: string) => `我的问题是：${s}`, (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`, (s: string) => `请回答一个事实：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`, (s: string) => `关于这次停电，${s}`, (s: string) => `记录是否支持：${s}`, (s: string) => `在这个案件里，${s}`,
];
export const c05QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c05-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-battery-color" ? ("irrelevant" as const) : ("positive" as const) }))),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `c05-extra-${index + 1}`, rawQuestion: "第三盏灯是反光造成的吗？", expectedQueryId: "query-reflection", category: "positive" as const })),
];

