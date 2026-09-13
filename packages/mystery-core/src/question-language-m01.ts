import { normalizeQuestion } from "./engine.ts";
import type { CaseFile, GameCommand, RuntimeState } from "./types.ts";

/** Immutable replay revision. Changes to accepted meaning require a new revision. */
interface Proposition {
  id: string;
  label: string;
  starter?: boolean;
  forms: RegExp[];
}
const p = (id: string, label: string, forms: RegExp[], starter = false): Proposition => ({ id, label, forms, starter });
const C01: Proposition[] = [
  p("query-person-inside", "敲击发生时，冷藏室里是否有人？", [
    /^(?:(?:敲门|敲击|敲击声|敲门声)(?:发生|响起)?(?:的?时候|时)|当时|凌晨两点|02:00)?(?:冷藏室|冷库)?(?:里|里面|内)(?:是否|当时)?(?:有|有没有)人(?:在|被关在)?(?:里面)?$/u,
    /^(?:当时|敲门时)?有人(?:被关)?在(?:冷藏室|冷库)(?:里|内|里面)?$/u,
  ], true),
  p("query-knock-source", "敲门声是人敲的吗？", [
    /^(?:那|这)?(?:三下)?(?:敲门声|敲击声|声音|声响)(?:是否)?是(?:人|人为|有人)(?:敲|敲出|弄出|造成|制造)(?:来)?的$/u,
    /^(?:那|这)?(?:三下)?(?:敲门声|敲击声)(?:是否)?(?:由人|人为)(?:造成|制造|发出)(?:的)?$/u,
  ]),
  p("query-door-mechanism", "这扇门关闭后会自动锁住吗？", [
    /^(?:这扇|那扇|冷藏室的|冷藏室)?门(?:关上|关闭|关好)?(?:之?后)?(?:是否|会不会|会)?自动(?:上锁|锁上|锁住|锁死)$/u,
  ], true),
  p("query-phone-inside", "手机在冷藏室里吗？", [
    /^(?:那部|这部)?手机(?:是否)?(?:在|放在)(?:冷藏室|冷库)(?:里|内|里面)?$/u,
    /^(?:冷藏室|冷库)(?:里|内|里面)(?:是否)?(?:有|有没有)(?:一部)?手机$/u,
  ]),
  p("query-lin-ownership", "留下的设备属于林澈吗？", [
    /^(?:留下的|那部|这部)?(?:手机|设备)(?:是否)?(?:属于林澈|是林澈的)$/u,
  ]),
  p("query-sample-location", "样本在外面的储物柜里吗？", [
    /^(?:那份|这份)?样本(?:是否)?(?:在|放在)(?:外面|外部|冷藏室外)(?:的)?储物柜(?:里|内|里面)?$/u,
  ]),
  p("query-lin-motive", "林澈这么做是为了拖延检查吗？", [
    /^林澈(?:这么做|这样做|的目的)(?:是否)?是为了(?:拖延|延迟|推迟)检查$/u,
  ]),
  p("query-fang-entered", "方砚后来进过冷藏室吗？", [
    /^方砚(?:后来|锁门后|在锁门后)(?:是否)?(?:进过|进入过|进入了)(?:冷藏室|冷库)$/u,
  ]),
  p("query-irrelevant-color", "金属托盘是什么颜色？", [/^(?:金属)?托盘(?:是)?什么颜色$/u]),
];
const C03: Proposition[] = [
  p("query-role-person", "台上的角色就是罗弈本人吗？", [
    /^(?:台上|舞台上)的(?:角色|红王子)(?:是否)?(?:就是|是)罗弈(?:本人)?$/u,
    /^(?:扮演|饰演)红王子的(?:人)?(?:一定|必定)(?:是)?罗弈$/u,
  ], true),
  p("query-two-people", "台上真的有两个人吗？", [
    /^(?:台上|舞台上)(?:真的|当时|实际上)?(?:是否)?(?:有|有没有)(?:两个人|两名演员|两个演员)$/u,
    /^第二(?:个|道)影子(?:是否)?是第二(?:个演员|名演员|个人)$/u,
  ], true),
  p("query-lighting-source", "第二个影子是灯光和遮影道具造成的吗？", [
    /^第二(?:个|道)影子(?:是否)?是(?:灯光|灯光和遮影道具|遮影道具)(?:造成|形成|制造)的$/u,
  ]),
  p("query-actor-present", "罗弈当时在后台吗？", [/^罗弈(?:本人)?(?:当时|午夜|在午夜)?(?:是否)?(?:在|待在|留在)后台$/u]),
  p("query-coat-owner", "穿披风的人就是罗弈吗？", [/^穿(?:着)?(?:那件)?披风的(?:人|演员)(?:是否)?(?:就是|是)罗弈(?:本人)?$/u]),
  p("query-call-sheet", "罗弈签过交班表吗？", [/^罗弈(?:是否|有没有)?(?:签过|签了|签署过)(?:那张)?交班表$/u]),
  p("query-understudy-role", "颜希是替补演员吗？", [/^颜希(?:是否)?是(?:正式的?)?(?:替补演员|替补)$/u, /^颜希(?:是否|有没有)?准备过(?:这个|红王子)(?:角色)?$/u]),
  p("query-unregistered", "剧院里有未登记的演员吗？", [/^(?:剧院里|剧院内|后台)(?:是否|还)?(?:有|有没有)(?:一个)?(?:未登记的?|没登记的?)演员$/u]),
  p("query-prop-color", "披风是什么颜色？", [/^(?:那件)?披风(?:是)?什么颜色$/u]),
];
const RECORD_TERMS: Record<string, string[]> = {
  "c61-missing-tape-turn": ["卷盘芯径", "胶带圈数", "剩余长度", "计数器", "校准曲线", "卷盘更换", "带材厚度", "长度测量", "标尺读数", "剩余材料"],
  "c84-handoff-after-stop": ["停止命令", "在途交接", "审计提交", "控制层接收", "完成时间", "消息顺序", "两个章节", "最后交接", "系统停止", "执行回执"],
};
function recordPropositions(caseId: string): Proposition[] | undefined {
  const terms = RECORD_TERMS[caseId];
  if (!terms) return undefined;
  const code = caseId.slice(0, 3);
  return terms.map((term, i) => p(`query-${code}-${String(i + 1).padStart(2, "0")}`,
    i === 9 ? `${term}与解释这件事有关吗？` : `有记录可以核对${term}吗？`,
    i === 9 ? [new RegExp(`^${term}(?:是否)?与(?:解释这件事|真相)有关$`, "u")] : [
      new RegExp(`^(?:有|有没有|是否有)(?:来源|材料|记录|证据)(?:可以|可|能|能够)(?:核对|核实|复核|确认)${term}$`, "u"),
      new RegExp(`^${term}(?:的)?(?:记录|来源|材料)?(?:是否|能否|可否)?(?:可以|可|能|能够)(?:核对|核实|复核|确认)$`, "u"),
      new RegExp(`^(?:能否|是否能|可以|能)(?:从|用|根据)(?:已有的?|现有的?)?(?:记录|材料|来源|证据)(?:核对|核实|复核|确认)${term}$`, "u"),
    ], code === "c61" ? [1, 2].includes(i) : [0, 2].includes(i)));
}
export function propositionPolicy(caseFile: CaseFile): Proposition[] | undefined {
  if (caseFile.id === "c01-cold-room-knock") return C01;
  if (caseFile.id === "c03-second-shadow") return C03;
  return recordPropositions(caseFile.id);
}
export function propositionCopy(caseFile: CaseFile, queryId: string): Proposition | undefined {
  return caseFile.questionLanguageRevision === "m01" ? propositionPolicy(caseFile)?.find(p => p.id === queryId) : undefined;
}
export function propositionVisible(caseFile: CaseFile, state: Pick<RuntimeState, "game">, queryId: string): boolean {
  const copy = propositionCopy(caseFile, queryId);
  if (!copy || copy.starter) return true;
  const query = caseFile.questionSemantics.find(q => q.id === queryId);
  const facts = query?.supportingFactIds ?? [];
  return facts.some(id => state.game.visibleFactIds.includes(id)) || (caseFile.evidenceItems ?? []).some(e =>
    state.game.discoveredEvidenceIds.includes(e.id) && e.sourceFactIds?.some(id => facts.includes(id)));
}
function clean(raw: string): string {
  // Courtesy only. Never delete a temporal clause, negation, subject or relation.
  return raw.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "")
    .replace(/^(?:请问|我想问一下|我想问|想确认一下|想确认|能告诉我|麻烦问一下|请帮我确认)/u, "")
    .replace(/(?:对吗|是吗|吗|么|呢|吧)$/u, "");
}
export interface PropositionResolution {
  status: "matched" | "ambiguous" | "unrecognized";
  queryId: string | null;
  candidateQueryIds: string[];
  explanation?: string;
}
function result(ids: string[], direct: boolean, explanation?: string): PropositionResolution {
  const unique = [...new Set(ids)];
  return { status: direct && unique.length === 1 ? "matched" : unique.length ? "ambiguous" : "unrecognized",
    queryId: direct && unique.length === 1 ? unique[0] : null, candidateQueryIds: unique, ...(explanation ? { explanation } : {}) };
}
export function resolvePropositionM01(caseFile: CaseFile, raw: string): PropositionResolution {
  const policy = propositionPolicy(caseFile);
  if (!policy) return normalizeQuestion(caseFile, raw); // Frozen legacy behavior for the other 80 cases.
  const text = clean(raw);
  const direct = (value: string) => policy.filter(p => clean(p.label) === value || p.forms.some(re => re.test(value))).map(p => p.id);
  const exact = direct(text);
  if (exact.length) return result(exact, true);
  const clauses = raw.split(/(?:而且|并且|同时还|以及|或者|还是|[；;。?？])/u).map(clean).filter(Boolean);
  if (clauses.length > 1) return result(clauses.flatMap(direct), false, "这句包含多个判断。请选择其中一句单独验证，或拆开改写；每次确认只计一个问题。");
  if (/(?:之前|之后|以前|以后|敲门[前后]|锁门[前后]|演出[前后]|昨天|明天|一直|始终|每次|\d+点|\d+:\d+)/u.test(text)) {
    return result([], false, "这个时间范围还不能与已定义的命题对应。请保留时间重新提问，或选择带明确时间的公开问题。");
  }
  const positive = text.replace(/(?:并非|并不是|不是)/gu, "是").replace(/(?:没有|没)人/gu, "有人")
    .replace(/不会/gu, "会").replace(/不在/gu, "在").replace(/不能/gu, "能").replace(/不可/gu, "可")
    .replace(/^难道/u, "");
  if (positive !== text) return result(direct(positive), false, "这句含有否定或反问。请确认下方完整命题；回答将针对确认的句子，不能直接当作原句的答案。");
  // Noun-only legacy prompts express a topic, not an asserted proposition.
  const terms = RECORD_TERMS[caseFile.id];
  if (terms) {
    const topics = terms.flatMap((term, i) => [term, `${term}是否成立`, `能确认${term}`].includes(text) ? [policy[i].id] : []);
    return result(topics, false, "需要区分‘记录能否核对’与具体数值、顺序或原因。当前材料只支持下方完整问题。");
  }
  return result([], false, "还不能确定这句的主体和关系。请一次只问一个事实；未识别的问题不计次。");
}
export function createPropositionCommand(caseFile: CaseFile, rawText: string): Extract<GameCommand, { type: "ask_proposition" }> {
  const resolution = resolvePropositionM01(caseFile, rawText.trim());
  return { type: "ask_proposition", rawText: rawText.trim(), resolverRevision: "m01", queryId: resolution.queryId, candidateQueryIds: resolution.candidateQueryIds };
}
