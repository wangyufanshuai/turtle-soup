import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["这张票是在渡轮离港前被扫描的吗？", "query-left-before"], ["23:52是扫描发生的时间吗？", "query-sync-time"], ["这是一张普通乘客船票吗？", "query-passenger-ticket"], ["闸机当时断网了吗？", "query-terminal-offline"], ["渡轮23:50已经离港了吗？", "query-ferry-departed"], ["渡轮离港后还有乘客上船吗？", "query-late-boarding"], ["沈洛是在23:48通过闸机的吗？", "query-courier"], ["雨伞是什么颜色？", "query-umbrella-color"], ["闸机真的读到了这张票吗？", "query-ticket-real"],
];
const wrappers = [
  (s: string) => s, (s: string) => `${s}？`, (s: string) => ` ${s} `, (s: string) => `请问，${s}`, (s: string) => `我想确认：${s}`, (s: string) => `${s}！`, (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`, (s: string) => `码头记录里，${s}`, (s: string) => `从闸机现场看，${s}`, (s: string) => `请验证：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}。`, (s: string) => `我的问题是：${s}`, (s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`, (s: string) => `请回答一个事实：${s}`, (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`, (s: string) => `关于这次航班，${s}`, (s: string) => `记录是否支持：${s}`, (s: string) => `在这个案件里，${s}`,
];
export const c06QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([rawQuestion, expectedQueryId]) => wrappers.map((wrap, index) => ({ id: `c06-${expectedQueryId}-${index + 1}`, rawQuestion: wrap(rawQuestion), expectedQueryId, category: expectedQueryId === "query-umbrella-color" ? ("irrelevant" as const) : ("positive" as const) }))),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `c06-extra-${index + 1}`, rawQuestion: "闸机当时断网了吗？", expectedQueryId: "query-terminal-offline", category: "positive" as const })),
];

