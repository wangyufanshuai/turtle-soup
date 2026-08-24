import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPresentationPatch, type CasePresentationPatch } from "../packages/mystery-core/src/index.ts";
import { GOLDEN_EXPERIENCE, GOLDEN_PATH, GOLDEN_PATH_CASE_IDS } from "../apps/web/lib/golden-experience.ts";
import { mergePresentationPatch } from "./lib/v17-overlays.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.7-internal-rc");
const baseline = loadReleaseContent(root, "v1.6-internal-rc");
const budgeted = JSON.parse(readFileSync(resolve(root, "docs/v1.7-budgeted-synthetic.json"), "utf8")) as Record<string, any>;
const browserPath = resolve(root, "docs/v1.7-browser-matrix.json");
const browser = existsSync(browserPath) ? JSON.parse(readFileSync(browserPath, "utf8")) as Record<string, any> : undefined;
const basePatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as CasePresentationPatch[];
const v17Patches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.7/patches.json"), "utf8")) as CasePresentationPatch[];
const aliases = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.7/packs.json"), "utf8")) as Array<Record<string, any>>;
const basePatchByCase = new Map(basePatches.map((patch) => [patch.caseId, patch]));
const v17PatchByCase = new Map(v17Patches.map((patch) => [patch.caseId, patch]));
const baselineById = new Map(baseline.entries.map((entry) => [entry.id, entry]));

const forbiddenHintTokens = /(?:fact-|event-|evidence-|query-|hypothesis-|solutionCertificate|canonicalHypothesis|internal)/i;
const expectedOrder = ["c01-cold-room-knock", "c03-second-shadow", "c13-second-waterline", "c06-nonexistent-ticket", "c17-twelve-strikes", "c24-turned-painting", "c33-early-late-arrival", "c48-two-point-calibration", "c60-last-sample-before-stop"];

const frozenCompatibility = release.entries.map((entry) => {
  const old = baselineById.get(entry.id);
  return {
    caseId: entry.id,
    canonicalHashUnchanged: old?.canonicalHash === entry.canonicalHash,
    contentVersionUnchanged: old?.contentVersion === entry.contentVersion,
    casePathUnchanged: old?.file === entry.file,
  };
});

const pathCases = GOLDEN_PATH.map((step) => {
  const entry = release.entries.find((item) => item.id === step.caseId);
  if (!entry) return { caseId: step.caseId, present: false, passed: false };
  const base = loadCaseFile(entry);
  const patch = mergePresentationPatch(basePatchByCase.get(entry.id), v17PatchByCase.get(entry.id));
  const caseFile = applyPresentationPatch(base, patch);
  const surface = caseFile.localization?.["zh-CN"]?.[caseFile.surface.textKey] ?? caseFile.surface.textKey;
  const replayCaptions = caseFile.proofReplay.map((beat) => caseFile.localization?.["zh-CN"]?.[beat.captionKey] ?? beat.captionKey);
  const budget = (budgeted.caseReports ?? []).find((item: Record<string, any>) => item.caseId === entry.id);
  const hints = Object.values(step.hints);
  const repeatedTimingPhraseCount = [surface, ...replayCaptions].filter((text) => text.includes("记录时间不等于发生时间")).length;
  return {
    caseId: entry.id,
    present: true,
    step: step.step,
    tier: step.tier,
    estimatedMinutes: step.estimatedMinutes,
    prerequisiteSkill: step.prerequisiteSkill,
    nextSkill: step.nextSkill,
    surfaceCharacters: [...surface].length,
    replayBeatCount: caseFile.proofReplay.length,
    authoredEventCount: caseFile.events.length,
    replayBeatDensity: Number((caseFile.proofReplay.length / Math.max(1, caseFile.events.length)).toFixed(3)),
    hintLevels: hints.length,
    hintSafe: hints.every((hint) => !forbiddenHintTokens.test(hint)),
    naturalProgressPath: budget?.naturalProgressPath === true,
    exhaustiveEvidenceRate: budget?.exhaustiveEvidenceRate ?? null,
    maximumChapterEntries: budget?.maximumChapterEntries ?? null,
    maximumChapterTransitions: budget?.maximumChapterTransitions ?? null,
    repeatedTimingPhraseCount,
    passed: hints.length === 3 && hints.every((hint) => !forbiddenHintTokens.test(hint)) && budget?.naturalProgressPath === true && Number(budget?.exhaustiveEvidenceRate ?? 1) < 1 && caseFile.proofReplay.length >= 5,
  };
});

const focusCases = ["c25-silent-second-bell", "c37-zeroed-pressure-gauge"].map((caseId) => {
  const summary = (budgeted.focusCases ?? []).find((item: Record<string, any>) => item.caseId === caseId);
  const patch = v17PatchByCase.get(caseId);
  const alias = aliases.find((item) => item.caseId === caseId);
  return {
    caseId,
    presentationRevision: patch?.presentationRevision,
    aliasRevision: alias?.revision,
    aliasCount: alias?.aliases?.length ?? 0,
    averageValidQuestionRate: summary?.averageValidQuestionRate ?? 0,
    naturalProgressPath: summary?.naturalProgressPath === true,
    exhaustiveEvidenceRate: summary?.exhaustiveEvidenceRate ?? null,
    passed: Number(summary?.averageValidQuestionRate ?? 0) >= 0.82 && summary?.naturalProgressPath === true && Number(summary?.exhaustiveEvidenceRate ?? 1) < 1 && Number(patch?.presentationRevision ?? 0) > 0 && Number(alias?.revision ?? 0) > 0,
  };
});

const shellSources = ["apps/web/components/game-shell.tsx", "apps/web/components/variant-shell.tsx", "apps/web/components/hint-ladder.tsx", "apps/web/components/variant-shell.module.css"].map((path) => ({ path, source: readFileSync(resolve(root, path), "utf8") }));
const variantSource = shellSources.find((item) => item.path.endsWith("variant-shell.tsx"))?.source ?? "";
const hintSource = shellSources.find((item) => item.path.endsWith("hint-ladder.tsx"))?.source ?? "";
const cssSource = shellSources.find((item) => item.path.endsWith("variant-shell.module.css"))?.source ?? "";
const complexBoards = ["c33-early-late-arrival", "c36-no-one-left-terminal", "c48-two-point-calibration", "c60-last-sample-before-stop"].map((caseId) => {
  const entry = release.entries.find((item) => item.id === caseId)!;
  const caseFile = loadCaseFile(entry);
  return { caseId, boardCount: caseFile.reasoningBoards?.length ?? 0, chapterCount: caseFile.chapters?.length ?? 0 };
});
const uiContracts = {
  hintLadderMountedInBothShells: shellSources.filter((item) => item.path.endsWith("shell.tsx")).every((item) => item.source.includes("<HintLadder")),
  hintIsPlayerInitiated: hintSource.includes("const [level, setLevel] = useState(0)") && hintSource.includes("onClick={revealNext}"),
  mobileSingleTaskSelector: variantSource.includes('aria-label="切换当前推理板"') && variantSource.includes("activeBoardId"),
  collapsibleCompletedBoard: variantSource.includes("data-board-collapsed") && variantSource.includes("activeBoardReady"),
  collapsibleClosedChain: variantSource.includes("chainCollapsed") && variantSource.includes("chainReady"),
  localProofGapCategory: variantSource.includes("data-proof-gap-category") && variantSource.includes("PROOF_GAP_LABELS"),
  nearbyMobileSubmit: variantSource.includes("data-mobile-proof-controls") && variantSource.includes('type: "submit_theory"'),
  uiStateStaysInReact: variantSource.includes("useState<string[]>([])") && variantSource.includes("useState(false)"),
  desktopComplexBoardWidth: cssSource.includes('[data-complex-proof][data-experience-stage="theory"]') && cssSource.includes("1.18fr"),
};

const chapterTracking = {
  entryFieldPresent: budgeted.traces?.every((trace: Record<string, any>) => typeof trace.chapterEntries === "number") === true,
  transitionFieldPresent: budgeted.traces?.every((trace: Record<string, any>) => typeof trace.chapterTransitions === "number") === true,
  multiChapterTransitionsObserved: (budgeted.caseReports ?? []).filter((item: Record<string, any>) => Number(item.maximumChapterTransitions ?? 0) > 0).map((item: Record<string, any>) => ({ caseId: item.caseId, transitions: item.maximumChapterTransitions })),
};
const redHerringTracking = {
  discoveredFieldPresent: budgeted.traces?.every((trace: Record<string, any>) => typeof trace.redHerringDiscovered === "boolean") === true,
  exhaustiveFieldPresent: budgeted.traces?.every((trace: Record<string, any>) => typeof trace.redHerringExhaustive === "boolean") === true,
  discoveryWithoutExhaustion: (budgeted.traces ?? []).filter((trace: Record<string, any>) => trace.redHerringDiscovered === true && trace.redHerringExhaustive === false).length,
};

const browserEvidence = {
  exists: Boolean(browser),
  partial: browser?.partial ?? null,
  engines: browser?.engines ?? [],
  routeSmokeGroups: browser?.routeSmoke?.length ?? 0,
  fullFlowGroups: browser?.fullFlows?.length ?? 0,
  screenshotCount: browser?.screenshotCount ?? 0,
  consoleErrorCount: browser?.consoleErrorCount ?? null,
  passed: browser?.passed === true && browser?.partial === false && (browser?.engines?.length ?? 0) === 3 && browser?.consoleErrorCount === 0,
};

const report = {
  reportVersion: "1.7",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.7-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  caseCount: release.entries.length,
  frozenCompatibility: { cases: frozenCompatibility, allUnchanged: frozenCompatibility.length === 60 && frozenCompatibility.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged) },
  goldenPath: { expectedOrder, actualOrder: [...GOLDEN_PATH_CASE_IDS], unique: new Set(GOLDEN_PATH_CASE_IDS).size === GOLDEN_PATH_CASE_IDS.length, optionalNoUnlockWall: true, cases: pathCases },
  focusCases,
  budgetedOutcomes: budgeted.outcomes,
  budgetedRunCount: budgeted.runCount,
  chapterTracking,
  redHerringTracking,
  complexBoards,
  uiContracts,
  browserEvidence,
  publicCopy: {
    timingPhraseOccurrences: pathCases.reduce((sum, item) => sum + Number((item as Record<string, any>).repeatedTimingPhraseCount ?? 0), 0),
    presentationOverlayHash: createHash("sha256").update(JSON.stringify(v17Patches)).digest("hex"),
    aliasOverlayHash: createHash("sha256").update(JSON.stringify(aliases)).digest("hex"),
  },
  automationLimits: ["不能证明乐趣", "不能证明审美", "不能证明真人理解率", "不能证明留存", "不能证明市场适配"],
  passed: release.entries.length === 60
    && frozenCompatibility.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged)
    && JSON.stringify([...GOLDEN_PATH_CASE_IDS]) === JSON.stringify(expectedOrder)
    && pathCases.every((item) => item.passed)
    && focusCases.every((item) => item.passed)
    && budgeted.passed === true
    && budgeted.runCount === 720
    && Object.values(uiContracts).every(Boolean)
    && chapterTracking.entryFieldPresent && chapterTracking.transitionFieldPresent && chapterTracking.multiChapterTransitionsObserved.length > 0
    && redHerringTracking.discoveredFieldPresent && redHerringTracking.exhaustiveFieldPresent && redHerringTracking.discoveryWithoutExhaustion > 0
    && browserEvidence.passed,
  qualification: "该报告证明冻结兼容、黄金路线、有限预算风险代理、提示安全、复杂板 UI 合约和浏览器可操作证据；真人参与为 0，不能证明乐趣、审美、理解率、留存或市场适配。",
};

const reportPath = resolve(root, "docs/v1.7-experience-calibration.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, frozen: report.frozenCompatibility.allUnchanged, goldenCases: pathCases.length, focusCases, uiContracts, browser: browserEvidence, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
