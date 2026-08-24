import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";
const seeds:Array<[string,string]>=[["录音是在江舟离开前录的吗？","query-recorded-before"],["录音被听到时房间里没人吗？","query-room-empty"],["录音是缓存后才写入的吗？","query-buffer"],["录音机后来没电了吗？","query-device-dead"],["录音是在20点后才听到的吗？","query-heard-time"],["是有人回来录的吗？","query-ghost"],["文件头能区分创建和修改时间吗？","query-file-header"],["旧采访是谁的声音？","query-old-audio"]];
export const c08QuestionCorpus:QueryCorpusEntry[]=seeds.flatMap(([q,id])=>wrappers.map((wrap,i)=>({id:`c08-${id}-${i}`,rawQuestion:wrap(q),expectedQueryId:id,category:id==='query-old-audio'?('irrelevant' as const):('positive' as const)})));
