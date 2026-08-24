import type { AnswerCode, CaseFile, CasePresentationPatch } from "./types.ts";

const ANSWER_CODES: AnswerCode[] = ["yes", "no", "partial", "invalid_premise", "unknown", "irrelevant", "unanswerable", "unrecognized"];

export type PresentationPatchValidation =
  | { ok: true; value: CasePresentationPatch }
  | { ok: false; reason: string };

/** A small deterministic hash, suitable for cache/report identity but not for security. */
export function presentationPatchHash(patch: CasePresentationPatch): string {
  const source = JSON.stringify({
    caseId: patch.caseId,
    baseCanonicalHash: patch.baseCanonicalHash,
    presentationRevision: patch.presentationRevision,
    title: patch.title,
    surface: patch.surface,
    answerTemplates: patch.answerTemplates,
    questionLabels: patch.questionLabels,
    feedbackCopy: patch.feedbackCopy,
    evidenceCopy: patch.evidenceCopy,
    hypothesisLabels: patch.hypothesisLabels,
    chapterTitles: patch.chapterTitles,
    replayCaptions: patch.replayCaptions,
    replayChallenges: patch.replayChallenges,
    sceneAsset: patch.sceneAsset,
    sceneAssetMobile: patch.sceneAssetMobile,
    evidenceVisualMode: patch.evidenceVisualMode,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function validatePresentationPatch(value: unknown, caseFile?: Pick<CaseFile, "id" | "metadata">): PresentationPatchValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "patch 不是对象" };
  const raw = value as Record<string, unknown>;
  if (typeof raw.caseId !== "string" || typeof raw.baseCanonicalHash !== "string" || !Number.isInteger(raw.presentationRevision)) return { ok: false, reason: "patch 身份字段无效" };
  if (caseFile && raw.caseId !== caseFile.id) return { ok: false, reason: "patch 案件 ID 不匹配" };
  const expectedHash = caseFile?.metadata?.canonicalHash;
  if (caseFile && expectedHash && raw.baseCanonicalHash !== expectedHash) return { ok: false, reason: "patch 基线 hash 不匹配" };
  for (const key of ["title", "surface", "sceneAsset", "sceneAssetMobile", "evidenceVisualMode"] as const) if (raw[key] !== undefined && typeof raw[key] !== "string") return { ok: false, reason: `${key} 必须是文本` };
  for (const key of ["sceneAsset", "sceneAssetMobile"] as const) if (typeof raw[key] === "string" && (!raw[key].startsWith("/") || /(?:\.\.|https?:|data:)/i.test(raw[key]))) return { ok: false, reason: `${key} 必须是本地绝对资源路径` };
  if (raw.answerTemplates !== undefined) {
    if (!raw.answerTemplates || typeof raw.answerTemplates !== "object" || Array.isArray(raw.answerTemplates)) return { ok: false, reason: "answerTemplates 无效" };
    for (const [key, text] of Object.entries(raw.answerTemplates as Record<string, unknown>)) {
      if (!ANSWER_CODES.includes(key as AnswerCode) || typeof text !== "string" || text.length > 800) return { ok: false, reason: "answerTemplates 包含非法字段" };
    }
  }
  for (const key of ["questionLabels", "feedbackCopy"] as const) {
    if (raw[key] === undefined) continue;
    if (!raw[key] || typeof raw[key] !== "object" || Array.isArray(raw[key])) return { ok: false, reason: `${key} 无效` };
    for (const text of Object.values(raw[key] as Record<string, unknown>)) if (typeof text !== "string" || text.length > 400) return { ok: false, reason: `${key} 包含非法文本` };
  }
  for (const key of ["hypothesisLabels", "chapterTitles", "replayCaptions"] as const) {
    if (raw[key] === undefined) continue;
    if (!raw[key] || typeof raw[key] !== "object" || Array.isArray(raw[key])) return { ok: false, reason: `${key} 无效` };
    for (const text of Object.values(raw[key] as Record<string, unknown>)) if (typeof text !== "string" || text.length > 600) return { ok: false, reason: `${key} 包含非法文本` };
  }
  if (raw.evidenceCopy !== undefined) {
    if (!raw.evidenceCopy || typeof raw.evidenceCopy !== "object" || Array.isArray(raw.evidenceCopy)) return { ok: false, reason: "evidenceCopy 无效" };
    for (const value of Object.values(raw.evidenceCopy as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "evidenceCopy 条目无效" };
      for (const text of Object.values(value as Record<string, unknown>)) if (typeof text !== "string" || text.length > 800) return { ok: false, reason: "evidenceCopy 文本无效" };
    }
  }
  if (raw.replayChallenges !== undefined) {
    if (!Array.isArray(raw.replayChallenges)) return { ok: false, reason: "replayChallenges 必须是数组" };
    const allowedModes = new Set(["limited-questions", "minimal-proof", "no-scaffolds"]);
    const seen = new Set<string>();
    for (const item of raw.replayChallenges) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, reason: "replayChallenges 条目无效" };
      const challenge = item as Record<string, unknown>;
      if (typeof challenge.mode !== "string" || !allowedModes.has(challenge.mode) || seen.has(challenge.mode)) return { ok: false, reason: "replayChallenges 模式无效或重复" };
      if (challenge.questionLimit !== undefined && (!Number.isInteger(challenge.questionLimit) || Number(challenge.questionLimit) < 1 || Number(challenge.questionLimit) > 100)) return { ok: false, reason: "replayChallenges 问题上限无效" };
      if (Object.keys(challenge).some((key) => !["mode", "questionLimit"].includes(key))) return { ok: false, reason: "replayChallenges 含未允许字段" };
      seen.add(challenge.mode);
    }
  }
  // These are the only accepted keys. Rejecting truth-shaped fields catches accidental leakage at authoring time.
  const allowed = new Set(["caseId", "baseCanonicalHash", "presentationRevision", "title", "surface", "answerTemplates", "questionLabels", "feedbackCopy", "evidenceCopy", "hypothesisLabels", "chapterTitles", "replayCaptions", "replayChallenges", "sceneAsset", "sceneAssetMobile", "evidenceVisualMode"]);
  const unknown = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, reason: `patch 含不允许字段 ${unknown}` };
  if (caseFile) {
    const fullCase = caseFile as CaseFile;
    const references: Array<[string, unknown, Set<string>]> = [
      ["questionLabels", raw.questionLabels, new Set((fullCase.questionSemantics ?? []).map((item) => item.id))],
      ["evidenceCopy", raw.evidenceCopy, new Set((fullCase.evidenceItems ?? []).map((item) => item.id))],
      ["hypothesisLabels", raw.hypothesisLabels, new Set((fullCase.hypotheses ?? []).map((item) => item.id))],
      ["chapterTitles", raw.chapterTitles, new Set((fullCase.chapters ?? []).map((item) => item.id))],
      ["replayCaptions", raw.replayCaptions, new Set((fullCase.proofReplay ?? []).map((item) => item.id))],
    ];
    for (const [field, entries, ids] of references) {
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
      const missing = Object.keys(entries as Record<string, unknown>).find((id) => !ids.has(id));
      if (missing) return { ok: false, reason: `${field} 引用了不存在的公开对象 ${missing}` };
    }
  }
  return { ok: true, value: value as CasePresentationPatch };
}

/** Apply only public copy; the returned CaseFile retains all truth-bearing structures by reference. */
export function applyPresentationPatch(caseFile: CaseFile, patch: CasePresentationPatch | undefined): CaseFile {
  if (!patch) return caseFile;
  const validation = validatePresentationPatch(patch, caseFile);
  if (!validation.ok) return caseFile;
  const nextLocalization = { ...(caseFile.localization ?? {}) };
  const zh = { ...(nextLocalization["zh-CN"] ?? {}) };
  if (patch.title) {
    zh["__presentation_patch.title"] = patch.title;
  }
  if (patch.surface) {
    zh["__presentation_patch.surface"] = patch.surface;
  }
  for (const [queryId, label] of Object.entries(patch.questionLabels ?? {})) zh[`__presentation_patch.question.${queryId}`] = label;
  for (const [feedbackId, copy] of Object.entries(patch.feedbackCopy ?? {})) zh[`__presentation_patch.feedback.${feedbackId}`] = copy;
  for (const [evidenceId, copy] of Object.entries(patch.evidenceCopy ?? {})) {
    if (copy.title) zh[`__presentation_patch.evidence.${evidenceId}.title`] = copy.title;
    if (copy.observation) zh[`__presentation_patch.evidence.${evidenceId}.observation`] = copy.observation;
  }
  for (const [hypothesisId, label] of Object.entries(patch.hypothesisLabels ?? {})) zh[`__presentation_patch.hypothesis.${hypothesisId}`] = label;
  for (const [chapterId, title] of Object.entries(patch.chapterTitles ?? {})) zh[`__presentation_patch.chapter.${chapterId}`] = title;
  for (const [beatId, caption] of Object.entries(patch.replayCaptions ?? {})) zh[`__presentation_patch.replay.${beatId}`] = caption;
  nextLocalization["zh-CN"] = zh;
  return {
    ...caseFile,
    surface: {
      ...(caseFile.surface ?? {}),
      ...(patch.title ? { titleKey: "__presentation_patch.title" } : {}),
      ...(patch.surface ? { textKey: "__presentation_patch.surface" } : {}),
    },
    answerPolicy: {
      ...caseFile.answerPolicy,
      templates: { ...(caseFile.answerPolicy.templates ?? {}), ...(patch.answerTemplates ?? {}) },
    },
    presentation: {
      ...(caseFile.presentation ?? { layoutId: "cold-room", sceneAsset: "/scene-cold-room.svg", palette: "black-soup", accent: "#b8cf79", questionPromptMode: "host", evidenceVisualMode: "archive-cards", mobileNavigation: ["现场", "提问", "推理"] }),
      ...(patch.sceneAsset ? { sceneAsset: patch.sceneAsset } : {}),
      ...(patch.sceneAssetMobile ? { sceneAssetMobile: patch.sceneAssetMobile } : {}),
      ...(patch.evidenceVisualMode ? { evidenceVisualMode: patch.evidenceVisualMode } : {}),
    },
    questionSemantics: (caseFile.questionSemantics ?? []).map((query) => {
      const label = patch.questionLabels?.[query.id];
      return label ? { ...query, labelKey: `__presentation_patch.question.${query.id}` } : query;
    }),
    evidenceItems: (caseFile.evidenceItems ?? []).map((evidence) => {
      const copy = patch.evidenceCopy?.[evidence.id];
      if (!copy) return evidence;
      return { ...evidence, ...(copy.title ? { titleKey: `__presentation_patch.evidence.${evidence.id}.title` } : {}), ...(copy.observation ? { observationKey: `__presentation_patch.evidence.${evidence.id}.observation` } : {}) };
    }),
    hypotheses: (caseFile.hypotheses ?? []).map((hypothesis) => patch.hypothesisLabels?.[hypothesis.id] ? { ...hypothesis, labelKey: `__presentation_patch.hypothesis.${hypothesis.id}` } : hypothesis),
    chapters: (caseFile.chapters ?? []).map((chapter) => patch.chapterTitles?.[chapter.id] ? { ...chapter, titleKey: `__presentation_patch.chapter.${chapter.id}` } : chapter),
    proofReplay: (caseFile.proofReplay ?? []).map((beat) => patch.replayCaptions?.[beat.id] ? { ...beat, captionKey: `__presentation_patch.replay.${beat.id}` } : beat),
    replayChallenges: patch.replayChallenges ?? caseFile.replayChallenges,
    metadata: {
      ...(caseFile.metadata ?? {}),
      presentationRevision: patch.presentationRevision,
      presentationPatchHash: presentationPatchHash(patch),
    },
    localization: nextLocalization,
  };
}
