import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyPresentationPatch,
  applyQuestionAliasPack,
  createRuntimeState,
  projectPlayerState,
  reduceGameCommand,
  replayCommands,
  runBudgetedProjectionOnlyCase,
  validateCompatibleSave,
  type CaseFile,
  type CasePresentationPatch,
  type GameCommand,
  type GameEvent,
  type PlayerProjection,
  type ProjectionOnlyAdapter,
  type ProjectionOnlySnapshot,
  type QuestionAliasPack,
  type SaveEnvelope,
  SYNTHETIC_PERSONA_IDS,
  type SyntheticPersonaId,
} from "../packages/mystery-core/src/index.ts";
import { deriveInvestigationMomentum } from "../apps/web/lib/investigation-momentum.ts";
import { GOLDEN_PATH_CASE_IDS, goldenExperience } from "../apps/web/lib/golden-experience.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import { mergePresentationPatch, mergeQuestionAliasPacks } from "./lib/v17-overlays.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.8-internal-rc");
const basePatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as CasePresentationPatch[];
const overlayPatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.7/patches.json"), "utf8")) as CasePresentationPatch[];
const aliases = mergeQuestionAliasPacks(
  JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.6/packs.json"), "utf8")) as QuestionAliasPack[],
  JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.7/packs.json"), "utf8")) as QuestionAliasPack[],
);
const basePatchByCase = new Map(basePatches.map((patch) => [patch.caseId, patch]));
const overlayPatchByCase = new Map(overlayPatches.map((patch) => [patch.caseId, patch]));
const patchByCase = new Map(release.entries.map((entry) => [entry.id, mergePresentationPatch(basePatchByCase.get(entry.id), overlayPatchByCase.get(entry.id))]).filter(([, patch]) => Boolean(patch)));
const aliasByCase = new Map(aliases.map((pack) => [pack.caseId, pack]));

function makeSave(caseFile: CaseFile, commands: GameCommand[], solved: boolean): SaveEnvelope {
  return { schemaVersion: 1, caseId: caseFile.id, caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned", commands, updatedAt: new Date(0).toISOString(), completed: solved };
}

function publicLeak(caseFile: CaseFile, projection: PlayerProjection): boolean {
  const serialized = JSON.stringify(projection);
  const forbidden = ["solutionCertificate", "requiredFactIds", "minimumProofSets", "canonicalHypothesisId", "canonicalHypothesis", "spoiler answer", "剧透答案"];
  if (forbidden.some((token) => serialized.includes(token))) return true;
  return [...caseFile.facts, ...caseFile.events, ...caseFile.hypotheses].some((item) => item.id.length > 8 && !/^event-\d{2}$/.test(item.id) && serialized.includes(item.id));
}

function makeAdapter(source: CaseFile) {
  const caseFile = applyQuestionAliasPack(applyPresentationPatch(source, patchByCase.get(source.id)), aliasByCase.get(source.id));
  let state = createRuntimeState(caseFile);
  let commands: GameCommand[] = [];
  let leak = false;
  const snapshot = (events: GameEvent[] = [], accepted = true): ProjectionOnlySnapshot => {
    const projection = projectPlayerState(caseFile, state);
    leak ||= publicLeak(caseFile, projection);
    return { projection, events, accepted, save: makeSave(caseFile, commands, state.solved) };
  };
  const adapter: ProjectionOnlyAdapter = {
    async initialize() { state = createRuntimeState(caseFile); commands = []; return snapshot([{ type: "case_started" }]); },
    async dispatch(command) {
      const result = reduceGameCommand(caseFile, state, command);
      if (result.accepted || result.events.some((event) => event.type === "interpretation_required")) {
        state = result.state;
        if (result.accepted && command.type !== "start_case") commands.push(command);
      }
      leak ||= publicLeak(caseFile, result.projection);
      return { projection: result.projection, events: result.events, accepted: result.accepted, save: makeSave(caseFile, commands, state.solved) };
    },
    async restore(save) {
      const compatible = validateCompatibleSave(save, caseFile.id, { caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned" });
      if (!compatible.ok) return snapshot([{ type: "command_rejected", message: "save incompatible" }], false);
      const replayed = replayCommands(caseFile, compatible.value.commands);
      state = replayed.state;
      commands = [...compatible.value.commands];
      return snapshot(replayed.events, true);
    },
  };
  return { adapter, leakFound: () => leak };
}

function seed(caseId: string, persona: string) {
  return Number.parseInt(createHash("sha256").update(`${caseId}:${persona}:v1.8-momentum`).digest("hex").slice(0, 8), 16) >>> 0;
}

type PublicFrame = { score: number; progressUnits: number; stage: string; beatCount: number; collectionRisk: boolean; linked: number; inspected: number; held: number; proofAttempt: boolean };
const traces: Array<Record<string, unknown>> = [];
for (const entry of release.entries) {
  const source = loadCaseFile(entry);
  for (const persona of SYNTHETIC_PERSONA_IDS) {
    const bundle = makeAdapter(source);
    const frames: PublicFrame[] = [];
    const trace = await runBudgetedProjectionOnlyCase(bundle.adapter, persona as SyntheticPersonaId, {
      seed: seed(entry.id, persona), questionLimit: 20 + seed(entry.id, persona) % 11, evidenceLimit: 6 + seed(entry.id, persona) % 3, theoryLimit: 3, locationLimit: 2 + seed(entry.id, persona) % 2, noProgressLimit: 5,
    }, (projection, events) => {
      const value = deriveInvestigationMomentum(projection, events, goldenExperience(entry.id)?.openingMoves);
      const active = projection.theoryDrafts.find((draft) => draft.id === projection.activeTheoryId);
      const progressUnits = projection.locations.filter((item) => item.visited).length
        + projection.transcript.filter((item) => !item.repeated).length
        + value.inspectedEvidenceCount
        + value.linkedEvidenceCount
        + (active?.eventIds.length ?? 0)
        + projection.chapters.filter((chapter) => chapter.unlocked).length
        + projection.reasoningBoards.reduce((sum, board) => sum + board.slots.filter((slot) => slot.itemId).length + board.connections.length, 0)
        + (projection.canSubmit ? 1 : 0)
        + (projection.solved ? 1 : 0);
      frames.push({ score: value.score, progressUnits, stage: value.stage, beatCount: value.beats.filter((beat) => beat.done).length, collectionRisk: value.collectionRisk, linked: value.linkedEvidenceCount, inspected: value.inspectedEvidenceCount, held: value.heldEvidenceCount, proofAttempt: events.some((event) => event.type === "theory_judged") });
    });
    let pulses = 0;
    let earlyPulses = 0;
    let unchanged = 0;
    let longestUnchanged = 0;
    frames.forEach((frame, index) => {
      if (index > 0 && frame.progressUnits > Math.max(...frames.slice(0, index).map((prior) => prior.progressUnits))) { pulses += 1; if (index <= 12) earlyPulses += 1; unchanged = 0; }
      else if (index > 0) { unchanged += 1; longestUnchanged = Math.max(longestUnchanged, unchanged); }
    });
    traces.push({
      caseId: entry.id,
      persona,
      outcome: trace.outcome,
      frameCount: frames.length,
      distinctStages: [...new Set(frames.map((frame) => frame.stage))],
      progressPulseCount: pulses,
      earlyProgressPulseCount: earlyPulses,
      longestUnchangedRun: longestUnchanged,
      firstThreeOperationsReached: frames.some((frame) => frame.beatCount === 3),
      reversibleCommitBeforeExhaustion: frames.some((frame) => frame.linked > 0 && frame.inspected < frame.held),
      collectionRiskObserved: frames.some((frame) => frame.collectionRisk),
      collectionRiskExitedByCommit: frames.some((frame, index) => index > 0 && frames.slice(0, index).some((prior) => prior.collectionRisk) && frame.linked > 0),
      proofAttemptObserved: frames.some((frame) => frame.proofAttempt),
      finalScore: frames.at(-1)?.score ?? 0,
      maximumConsecutiveNoProgress: trace.maximumConsecutiveNoProgress,
      publicLeak: bundle.leakFound(),
    });
  }
}

const percentile = (values: number[], ratio: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;
const caseReports = release.entries.map((entry) => {
  const rows = traces.filter((trace) => trace.caseId === entry.id);
  const average = (field: string) => rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0) / rows.length;
  return {
    caseId: entry.id,
    runs: rows.length,
    averageProgressPulses: average("progressPulseCount"),
    averageEarlyProgressPulses: average("earlyProgressPulseCount"),
    p90LongestUnchangedRun: percentile(rows.map((row) => Number(row.longestUnchangedRun)), .9),
    firstThreeCoverage: rows.filter((row) => row.firstThreeOperationsReached).length / rows.length,
    reversibleCommitCoverage: rows.filter((row) => row.reversibleCommitBeforeExhaustion).length / rows.length,
    collectionExitCoverage: rows.filter((row) => row.collectionRiskExitedByCommit).length / rows.length,
    proofAttemptCoverage: rows.filter((row) => row.proofAttemptObserved).length / rows.length,
  };
});
const goldenReports = GOLDEN_PATH_CASE_IDS.map((caseId) => caseReports.find((item) => item.caseId === caseId)!);
const gates = {
  projectionOnly: traces.length === 720,
  noHiddenLeak: traces.every((trace) => trace.publicLeak === false),
  firstThreeObservable: goldenReports.every((item) => item.firstThreeCoverage > 0),
  earlyProgressPulses: goldenReports.every((item) => item.averageEarlyProgressPulses >= 2),
  reversibleCommit: goldenReports.every((item) => item.reversibleCommitCoverage > 0),
  proofFeedbackReached: goldenReports.every((item) => item.proofAttemptCoverage > 0),
};
const report = {
  reportVersion: "1.8",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.8-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  runCount: traces.length,
  definition: "持续推进代理只衡量公开操作是否产生新的可见阶段、取舍或可检验结构；不衡量答案正确率、乐趣、留存或市场适配。",
  goldenPath: [...GOLDEN_PATH_CASE_IDS],
  caseReports,
  goldenReports,
  traces,
  gates,
  passed: Object.values(gates).every(Boolean),
  automationLimits: ["不能证明乐趣", "不能证明审美", "不能证明真人理解率", "不能证明留存", "不能证明市场适配"],
};
writeFileSync(resolve(root, "docs/v1.8-momentum-proxy.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runs: report.runCount, goldenReports, gates, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
