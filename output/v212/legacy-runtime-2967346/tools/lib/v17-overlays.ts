import type { CasePresentationPatch, QuestionAliasPack } from "../../packages/mystery-core/src/index.ts";

export function mergePresentationPatch(base: CasePresentationPatch | undefined, overlay: CasePresentationPatch | undefined): CasePresentationPatch | undefined {
  if (!base) return overlay;
  if (!overlay) return base;
  return {
    ...base,
    ...overlay,
    answerTemplates: { ...base.answerTemplates, ...overlay.answerTemplates },
    questionLabels: { ...base.questionLabels, ...overlay.questionLabels },
    feedbackCopy: { ...base.feedbackCopy, ...overlay.feedbackCopy },
    evidenceCopy: { ...base.evidenceCopy, ...overlay.evidenceCopy },
    hypothesisLabels: { ...base.hypothesisLabels, ...overlay.hypothesisLabels },
    chapterTitles: { ...base.chapterTitles, ...overlay.chapterTitles },
    replayCaptions: { ...base.replayCaptions, ...overlay.replayCaptions },
  };
}

export function mergeQuestionAliasPack(base: QuestionAliasPack | undefined, overlay: QuestionAliasPack | undefined): QuestionAliasPack | undefined {
  if (!base) return overlay;
  if (!overlay) return base;
  return {
    ...base,
    ...overlay,
    aliases: [...base.aliases, ...overlay.aliases],
    ambiguousPhrases: [...(base.ambiguousPhrases ?? []), ...(overlay.ambiguousPhrases ?? [])],
  };
}

export function mergeQuestionAliasPacks(base: QuestionAliasPack[], overlays: QuestionAliasPack[]): QuestionAliasPack[] {
  const baseByCase = new Map(base.map((pack) => [pack.caseId, pack]));
  const overlayByCase = new Map(overlays.map((pack) => [pack.caseId, pack]));
  return [...new Set([...baseByCase.keys(), ...overlayByCase.keys()])]
    .map((caseId) => mergeQuestionAliasPack(baseByCase.get(caseId), overlayByCase.get(caseId)))
    .filter((pack): pack is QuestionAliasPack => Boolean(pack));
}
