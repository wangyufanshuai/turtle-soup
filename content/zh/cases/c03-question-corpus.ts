import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["台上的角色就是罗弈本人吗？", "query-role-person"], ["台上真的有两个人吗？", "query-two-people"], ["第二个影子是灯光造成的吗？", "query-lighting-source"], ["罗弈当时在后台吗？", "query-actor-present"], ["那件披风属于罗弈吗？", "query-coat-owner"], ["罗弈签过交班表吗？", "query-call-sheet"], ["颜希是替补演员吗？", "query-understudy-role"], ["剧院里有未登记演员吗？", "query-unregistered"], ["披风是什么颜色？", "query-prop-color"],
];
const wrappers = [
  (s: string) => s, (s: string) => `${s}？`, (s: string) => ` ${s} `, (s: string) => `请问，${s}`, (s: string) => `我想确认：${s}`, (s: string) => `${s}！`, (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`, (s: string) => `后台记录里，${s}`, (s: string) => `从舞台现场看，${s}`, (s: string) => `请验证：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}。`, (s: string) => `我的问题是：${s}`, (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`, (s: string) => `请回答一个事实：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`, (s: string) => `关于这个角色，${s}`, (s: string) => `证词是否支持：${s}`, (s: string) => `在这个案件里，${s}`,
];
export const c03QuestionCorpus: QueryCorpusEntry[] = seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c03-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-prop-color" ? "irrelevant" : "positive" })));
