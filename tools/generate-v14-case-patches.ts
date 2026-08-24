import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseFile, CasePresentationPatch } from "../packages/mystery-core/src/index.ts";
import { loadReleaseContent } from "./lib/release-content.ts";
import { V14_FOCUSED_COPY, V14_NATURAL_FIRST_QUESTIONS } from "./lib/v14-focused-copy.ts";

const root = resolve(process.argv[2] ?? ".");
const patchPath = resolve(root, "content/zh/presentation/v1.4/patches.json");
const patches = JSON.parse(readFileSync(patchPath, "utf8")) as CasePresentationPatch[];
const manifest = JSON.parse(readFileSync(resolve(root, "content/zh/cases/manifest.season4.v1.3.json"), "utf8")) as { cases: Array<{ id: string; file: string }> };
const styles = ["实验台记录", "校准台记录", "控制室记录", "维护单", "采样日志", "复核照片"];
const observationTemplates = [
  (style: string, keyword: string) => `${style}标出了“${keyword}”的原始状态；它只能证明这一层观察，不能替代上下游来源。`,
  (style: string, keyword: string) => `在${style}中，“${keyword}”带有可复核时间戳；还需确认记录时间和事件时间是否相同。`,
  (style: string, keyword: string) => `${style}保留了“${keyword}”的局部读数；读数成立，但基准条件仍要另行证明。`,
  (style: string, keyword: string) => `“${keyword}”出现在${style}的来源链上；它说明信息经过这里，不说明整条链没有缓存或变换。`,
  (style: string, keyword: string) => `${style}将“${keyword}”固定在一个空间位置；位置真实，采用的参照系仍需核对。`,
  (style: string, keyword: string) => `${style}确认了“${keyword}”这一状态转换；触发条件和后续输出尚未因此自动成立。`,
  (style: string, keyword: string) => `复核${style}可见“${keyword}”确实存在；它是边界条件，而不是结案答案。`,
  (style: string, keyword: string) => `${style}把“${keyword}”与相邻记录分开保存；是否连续、重复或合并仍要由其他来源验证。`,
];
const replayTemplates = [
  (title: string, focus: string) => `${title}先由${focus}固定一个可复核的观察边界。`,
  (_title: string, focus: string, next: string) => `随后核对${focus}；它与${next}不再被当成同一事件。`,
  (_title: string, focus: string) => `沿${focus}向前追溯，第一条直觉解释失去必要前提。`,
  (_title: string, focus: string, next: string) => `${focus}与${next}交叉印证，记录时间和事件时间被分开。`,
  (_title: string, focus: string) => `把${focus}放回对应位置后，来源链出现了唯一连续方向。`,
  (title: string, focus: string) => `${focus}完成最后一次约束，${title}的异常由此闭合。`,
  (_title: string, focus: string, next: string) => `复核${focus}时保留${next}作为边界条件，替代路径不再自洽。`,
  (_title: string, focus: string) => `${focus}只证明这一层状态；下一拍继续追踪它如何传递。`,
  (_title: string, focus: string, next: string) => `从${focus}到${next}的顺序成立，显示结果不再替代真实过程。`,
  (title: string, focus: string) => `${title}在${focus}处留下独立来源，可与前后记录复算。`,
  (_title: string, focus: string) => `排除无关记录后，${focus}仍是证明链中的必要环节。`,
  (_title: string, focus: string, next: string) => `${focus}解释当前观察，${next}负责排除剩余备选路径。`,
];

function localized(file: CaseFile, key: unknown, fallback: string) {
  return typeof key === "string" ? file.localization?.["zh-CN"]?.[key] ?? fallback : fallback;
}

function buildReplayCaptions(file: CaseFile, caseNumber: number) {
  const title = localized(file, file.surface?.titleKey ?? file.metadata?.titleKey, file.id);
  const evidence = file.evidenceItems.filter((item) => item.importance !== "irrelevant");
  return Object.fromEntries(file.proofReplay.map((beat, index) => {
    const source = evidence.find((item) => item.sourceEventIds?.includes(beat.eventId)) ?? evidence[index % Math.max(1, evidence.length)];
    const nextSource = evidence[(index + 1) % Math.max(1, evidence.length)];
    const focus = String(source?.assetAlt ?? `第${index + 1}项记录`);
    const next = String(nextSource?.assetAlt ?? "相邻记录");
    const template = replayTemplates[(index + caseNumber) % replayTemplates.length];
    return [beat.id, template(title, focus, next)];
  }));
}
for (const entry of manifest.cases) {
  const file = JSON.parse(readFileSync(resolve(root, "content/zh/cases", entry.file), "utf8")) as CaseFile;
  const existing = patches.find((patch) => patch.caseId === entry.id);
  const caseNumber = Number(entry.id.match(/c(\d+)/)?.[1] ?? 0);
  const focusedCopy = V14_FOCUSED_COPY[entry.id];
  if (existing && focusedCopy) {
    Object.assign(existing, focusedCopy);
    existing.presentationRevision = 3;
    continue;
  }
  if (existing) {
    existing.evidenceCopy = Object.fromEntries(file.evidenceItems.map((evidence, index) => {
      const keyword = String(evidence.assetAlt ?? `证据 ${index + 1}`);
      const style = styles[(index + caseNumber) % styles.length];
      return [evidence.id, { title: `${style} · ${keyword}`, observation: observationTemplates[(index * 3 + caseNumber) % observationTemplates.length](style, keyword) }];
    }));
    existing.replayCaptions = buildReplayCaptions(file, caseNumber);
    continue;
  }
  const evidenceCopy: Record<string, { title: string; observation: string }> = {};
  file.evidenceItems.forEach((evidence, index) => {
    const keyword = String(evidence.assetAlt ?? `证据 ${index + 1}`);
    const style = styles[(index + Number(entry.id.match(/c(\d+)/)?.[1] ?? 0)) % styles.length];
    evidenceCopy[evidence.id] = {
      title: `${style} · ${keyword}`,
      observation: observationTemplates[(index * 3 + Number(entry.id.match(/c(\d+)/)?.[1] ?? 0)) % observationTemplates.length](style, keyword),
    };
  });
  patches.push({ caseId: entry.id, baseCanonicalHash: file.metadata?.canonicalHash ?? "", presentationRevision: 2, evidenceCopy, replayCaptions: buildReplayCaptions(file, caseNumber) });
}
// The six deep-review cases span the frozen seasons as well as Season 4. They
// receive the same public-copy-only evidence treatment without touching their
// truth graphs or canonical hashes.
for (const entry of loadReleaseContent(root, "v1.4-internal-rc").entries) {
  const focusedCopy = V14_FOCUSED_COPY[entry.id];
  if (!focusedCopy) continue;
  const file = JSON.parse(readFileSync(entry.casePath, "utf8")) as CaseFile;
  let existing = patches.find((patch) => patch.caseId === entry.id);
  if (!existing) {
    existing = { caseId: entry.id, baseCanonicalHash: file.metadata?.canonicalHash ?? "", presentationRevision: 3 };
    patches.push(existing);
  }
  Object.assign(existing, focusedCopy);
  existing.presentationRevision = 3;
}
for (const entry of loadReleaseContent(root, "v1.4-internal-rc").entries) {
  const firstQuestion = V14_NATURAL_FIRST_QUESTIONS[entry.id];
  if (!firstQuestion) continue;
  const file = JSON.parse(readFileSync(entry.casePath, "utf8")) as CaseFile;
  if (!file.questionSemantics.some((query) => query.id === firstQuestion.queryId)) throw new Error(`${entry.id} 的自然首问引用了未知 query ${firstQuestion.queryId}`);
  let existing = patches.find((patch) => patch.caseId === entry.id);
  if (!existing) {
    existing = { caseId: entry.id, baseCanonicalHash: file.metadata?.canonicalHash ?? "", presentationRevision: 2 };
    patches.push(existing);
  }
  existing.questionLabels = { ...(existing.questionLabels ?? {}), [firstQuestion.queryId]: firstQuestion.label };
}
for (const entry of loadReleaseContent(root, "v1.4-internal-rc").entries) {
  const file = JSON.parse(readFileSync(entry.casePath, "utf8")) as CaseFile;
  if ((file.replayChallenges?.length ?? 0) >= 3) continue;
  let existing = patches.find((patch) => patch.caseId === entry.id);
  if (!existing) {
    existing = { caseId: entry.id, baseCanonicalHash: file.metadata?.canonicalHash ?? "", presentationRevision: 2 };
    patches.push(existing);
  }
  existing.replayChallenges = [
    { mode: "limited-questions", questionLimit: 12 },
    { mode: "minimal-proof" },
    { mode: "no-scaffolds" },
  ];
}
writeFileSync(patchPath, `${JSON.stringify(patches, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ patchCount: patches.length, season4Patched: patches.filter((patch) => /^c(3[7-9]|4\d|5\d|60)-/.test(patch.caseId)).length }, null, 2));
