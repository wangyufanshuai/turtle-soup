/**
 * Semantically empty but textually distinct conversational frames. The
 * deterministic normalizer strips exactly one frame before matching, so the
 * corpus measures useful language coverage instead of punctuation noise.
 */
export const buildV15CorpusWrappers = [
  (text: string) => text,
  (text: string) => `请问，${text}`,
  (text: string) => `我想确认：${text}`,
  (text: string) => `现在能否确认${text.replace(/[？！]$/, "")}？`,
  (text: string) => `请核对：${text}`,
  (text: string) => `现场问题：${text}`,
  (text: string) => `请验证：${text}`,
  (text: string) => `我的问题是：${text}`,
  (text: string) => `能不能判断${text.replace(/[？！]$/, "")}？`,
  (text: string) => `请回答一个事实：${text}`,
  (text: string) => `${text.replace(/[？！]$/, "")}（只回答事实）`,
  (text: string) => `记录是否支持：${text}`,
  (text: string) => `在这个案件里，${text}`,
  (text: string) => `请给出记录结论：${text}`,
  (text: string) => `调查一下：${text}`,
  (text: string) => `请从证据判断：${text}`,
  (text: string) => `能否核实：${text}`,
  (text: string) => `请从档案确认：${text}`,
  (text: string) => `请依据来源判断：${text}`,
];
