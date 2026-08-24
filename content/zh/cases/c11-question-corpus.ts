import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";

const seeds: Array<[string, string]> = [
  ["魏宁是在09:20才到档案室吗？", "query-signer-time"],
  ["签名是印章盖出来的吗？", "query-signature-source"],
  ["复写纸的压力能证明是盖章吗？", "query-carbon"],
  ["合同是在09:25封存的吗？", "query-seal-time"],
  ["这一定是魏宁亲手签的吗？", "query-hand-signature"],
  ["签名出现时魏宁已经在场吗？", "query-before-arrival"],
  ["印章后来归还了吗？", "query-stamp-return"],
  ["咖啡污渍是签名异常的原因吗？", "query-coffee"],
];
const wrappers = [
  (s: string) => s,(s: string) => `${s}？`,(s: string) => `请问，${s}`,(s: string) => `我想确认：${s}`,
  (s: string) => `现在能否确认${s.replace(/[？！]$/, "")}？`,(s: string) => `请核对：${s}`,
  (s: string) => `从文书记录看，${s}`,(s: string) => `请验证：${s}`,
  (s: string) => `${s.replace(/[？！]$/, "")}（只回答事实）`,(s: string) => `关于这份合同，${s}`,
  (s: string) => `记录是否支持：${s}`,(s: string) => `能不能判断${s.replace(/[？！]$/, "")}？`,
  (s: string) => `在这个案件里，${s}`,(s: string) => `我的问题是：${s}`,(s: string) => `请回答一个事实：${s}`,
  (s: string) => `调查一下：${s}`,(s: string) => `档案员记录里，${s}`,
];
export const c11QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([question, queryId]) => wrappers.map((wrap, index) => ({id:`c11-${queryId}-${index}`,rawQuestion:wrap(question),expectedQueryId:queryId,category:queryId === "query-coffee" ? "irrelevant" as const : "positive" as const}))),
  ...Array.from({length:20},(_,index)=>({id:`c11-extra-${index}`,rawQuestion:"签名是印章盖出来的吗？",expectedQueryId:"query-signature-source",category:"positive" as const})),
];
