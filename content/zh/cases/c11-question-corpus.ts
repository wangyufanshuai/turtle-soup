import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";

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
export const c11QuestionCorpus: QueryCorpusEntry[] = [
  ...seeds.flatMap(([question, queryId]) => wrappers.map((wrap, index) => ({id:`c11-${queryId}-${index}`,rawQuestion:wrap(question),expectedQueryId:queryId,category:queryId === "query-coffee" ? "irrelevant" as const : "positive" as const}))),
];
