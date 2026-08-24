import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

const seeds: Array<[string, string]> = [
  ["这张票是在渡轮离港前被扫描的吗？", "query-left-before"], ["23:52是扫描发生的时间吗？", "query-sync-time"], ["这是一张普通乘客船票吗？", "query-passenger-ticket"], ["闸机当时断网了吗？", "query-terminal-offline"], ["渡轮23:50已经离港了吗？", "query-ferry-departed"], ["渡轮离港后还有乘客上船吗？", "query-late-boarding"], ["沈洛是在23:48通过闸机的吗？", "query-courier"], ["雨伞是什么颜色？", "query-umbrella-color"], ["闸机真的读到了这张票吗？", "query-ticket-real"],
];
export const c06QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c06-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-umbrella-color" ? ("irrelevant" as const) : ("positive" as const) }))),
];
