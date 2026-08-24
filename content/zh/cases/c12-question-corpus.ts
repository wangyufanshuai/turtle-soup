import type { QueryCorpusEntry } from "../../../packages/mystery-core/src/authoring.ts";
import { buildV15CorpusWrappers as wrappers } from "../question-aliases/v1.5/corpus-wrappers.ts";
const seeds: Array<[string,string]> = [
  ["大楼真的有0层吗？","query-floor-zero"],["电梯显示屏显示0吗？","query-display-zero"],["电梯轿厢真的移动到0层了吗？","query-cabin-motion"],["电梯当时在检修模式吗？","query-service-mode"],["0是控制器的虚拟编号吗？","query-virtual-index"],["电梯门是在B1打开的吗？","query-door-floor"],["有人乘电梯去了不存在的楼层吗？","query-passenger"],["送货车和0层显示有关吗？","query-cart"]
];
export const c12QuestionCorpus: QueryCorpusEntry[]=seeds.flatMap(([q,id])=>wrappers.map((wrap,i)=>({id:`c12-${id}-${i}`,rawQuestion:wrap(q),expectedQueryId:id,category:id==='query-cart'?('irrelevant' as const):('positive' as const)})));
