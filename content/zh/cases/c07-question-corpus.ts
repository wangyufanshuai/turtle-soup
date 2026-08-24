import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";
const seeds: Array<[string,string]> = [["钥匙被什么东西拉走了吗？","query-key-moved"],["有人进过锁柜吗？","query-entry"],["维修缆线接在钥匙上吗？","query-cable"],["钥匙是被配重拉回去的吗？","query-counterweight"],["是另一把钥匙吗？","query-duplicate"],["锁柜有维修孔吗？","query-slot"],["监控时间可靠吗？","query-camera-time"],["备用钥匙是什么颜色？","query-spare-color"]];
export const c07QuestionCorpus: QueryCorpusEntry[]=seeds.flatMap(([q,id])=>wrappers.map((wrap,i)=>({id:`c07-${id}-${i}`,rawQuestion:wrap(q),expectedQueryId:id,category:id==='query-spare-color'?('irrelevant' as const):('positive' as const)})));
