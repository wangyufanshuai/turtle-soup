import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

const seeds: Array<[string, string]> = [
  ["台上的角色就是罗弈本人吗？", "query-role-person"], ["台上真的有两个人吗？", "query-two-people"], ["第二个影子是灯光造成的吗？", "query-lighting-source"], ["罗弈当时在后台吗？", "query-actor-present"], ["那件披风属于罗弈吗？", "query-coat-owner"], ["罗弈签过交班表吗？", "query-call-sheet"], ["颜希是替补演员吗？", "query-understudy-role"], ["剧院里有未登记演员吗？", "query-unregistered"], ["披风是什么颜色？", "query-prop-color"],
];
export const c03QuestionCorpus: QueryCorpusEntry[] = seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c03-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-prop-color" ? "irrelevant" : "positive" })));
