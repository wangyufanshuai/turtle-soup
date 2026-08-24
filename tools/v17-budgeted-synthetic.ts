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
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import { mergePresentationPatch, mergeQuestionAliasPacks } from "./lib/v17-overlays.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.7-internal-rc");
const basePatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as CasePresentationPatch[];
const overlayPatches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.7/patches.json"), "utf8")) as CasePresentationPatch[];
const baseAliases = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.6/packs.json"), "utf8")) as QuestionAliasPack[];
const overlayAliases = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.7/packs.json"), "utf8")) as QuestionAliasPack[];
const aliases = mergeQuestionAliasPacks(baseAliases, overlayAliases);
const basePatchByCase = new Map(basePatches.map((patch) => [patch.caseId, patch]));
const overlayPatchByCase = new Map(overlayPatches.map((patch) => [patch.caseId, patch]));
const patchByCase = new Map(release.entries.map((entry) => [entry.id, mergePresentationPatch(basePatchByCase.get(entry.id), overlayPatchByCase.get(entry.id))]).filter(([, patch]) => Boolean(patch)));
const aliasByCase = new Map(aliases.map((pack) => [pack.caseId, pack]));

type AdapterBundle = { adapter: ProjectionOnlyAdapter; leakFound: () => boolean; commandLog: () => GameCommand[] };

function makeSave(caseFile: CaseFile, commands: GameCommand[], solved: boolean): SaveEnvelope {
  return { schemaVersion: 1, caseId: caseFile.id, caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned", commands, updatedAt: new Date(0).toISOString(), completed: solved };
}

function publicLeak(caseFile: CaseFile, projection: PlayerProjection): boolean {
  const serialized = JSON.stringify(projection);
  const forbidden = ["solutionCertificate", "requiredFactIds", "minimumProofSets", "canonicalHypothesisId", "canonicalHypothesis", "spoiler answer", "剧透答案"];
  if (forbidden.some((token) => serialized.includes(token))) return true;
  const hiddenIds = [...caseFile.facts.map((item) => item.id), ...caseFile.events.map((item) => item.id), ...caseFile.hypotheses.map((item) => item.id)];
  return hiddenIds.some((id) => {
    if (/^event-\d{2}$/.test(id) || /^evidence-[a-z]+-\d+$/.test(id)) return false;
    return id.length > 8 && serialized.includes(id);
  });
}

function makeAdapter(source: CaseFile): AdapterBundle {
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
      const keepsInterpretationPending = result.events.some((event) => event.type === "interpretation_required");
      if (result.accepted || keepsInterpretationPending) {
        state = result.state;
        if (result.accepted && command.type !== "start_case") commands = [...commands, command];
      }
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
  return { adapter, leakFound: () => leak, commandLog: () => [...commands] };
}

function deterministicSeed(caseId: string, persona: string): number {
  return Number.parseInt(createHash("sha256").update(`${caseId}:${persona}:v1.7`).digest("hex").slice(0, 8), 16) >>> 0;
}

const traces: Array<Record<string, unknown>> = [];
for (const entry of release.entries) {
  const base = loadCaseFile(entry);
  const redHerringIds = new Set(base.evidenceItems.filter((item) => item["importance"] === "irrelevant").map((item) => item.id));
  for (const persona of SYNTHETIC_PERSONA_IDS) {
    const seed = deterministicSeed(entry.id, persona);
    const bundle = makeAdapter(base);
    const trace = await runBudgetedProjectionOnlyCase(bundle.adapter, persona as SyntheticPersonaId, {
      seed,
      questionLimit: 20 + seed % 11,
      evidenceLimit: 6 + seed % 3,
      theoryLimit: 3,
      locationLimit: 2 + seed % 2,
      noProgressLimit: 5,
    });
    const { inspectedEvidenceIds, ...publicTrace } = trace;
    const redHerringDiscovered = inspectedEvidenceIds.some((id) => redHerringIds.has(id));
    traces.push({
      caseId: entry.id,
      persona,
      ...publicTrace,
      inspectedEvidenceCount: inspectedEvidenceIds.length,
      totalEvidenceCount: base.evidenceItems.length,
      redHerringDiscovered,
      redHerringExhaustive: trace.inspectedAllVisibleEvidence,
      publicLeak: bundle.leakFound(),
      commandTypeDigest: createHash("sha256").update(JSON.stringify(bundle.commandLog().map((command) => command.type))).digest("hex"),
    });
  }
}

const caseReports = release.entries.map((entry) => {
  const rows = traces.filter((trace) => trace.caseId === entry.id);
  const solved = rows.filter((trace) => trace.outcome === "solved").length;
  const average = (field: string) => rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0) / Math.max(1, rows.length);
  return {
    caseId: entry.id,
    runs: rows.length,
    solved,
    abandoned: rows.filter((trace) => trace.outcome === "abandoned").length,
    budgetExhausted: rows.filter((trace) => trace.outcome === "budget_exhausted").length,
    solveRate: solved / Math.max(1, rows.length),
    averageValidQuestionRate: average("validQuestionRate"),
    averageQuestionBudgetUsed: average("questionBudgetUsed"),
    averageEvidenceBudgetUsed: average("evidenceBudgetUsed"),
    averageTheoryBudgetUsed: average("theoryBudgetUsed"),
    naturalPathSolved: rows.some((trace) => trace.outcome === "solved" && Number(trace.inspectedEvidenceCount) < Number(trace.totalEvidenceCount)),
    naturalProgressPath: rows.some((trace) => Number(trace.theoryBudgetUsed) > 0 && (trace.outcome === "solved" || Boolean(trace.finalProofFailureCategory)) && Number(trace.inspectedEvidenceCount) < Number(trace.totalEvidenceCount)),
    redHerringDiscoveryRate: rows.filter((trace) => trace.redHerringDiscovered === true).length / Math.max(1, rows.length),
    exhaustiveEvidenceRate: rows.filter((trace) => trace.redHerringExhaustive === true).length / Math.max(1, rows.length),
    maximumChapterEntries: Math.max(...rows.map((trace) => Number(trace.chapterEntries ?? 0))),
    maximumChapterTransitions: Math.max(...rows.map((trace) => Number(trace.chapterTransitions ?? 0))),
  };
});

const solvedCount = traces.filter((trace) => trace.outcome === "solved").length;
const abandonedCount = traces.filter((trace) => trace.outcome === "abandoned").length;
const budgetExhaustedCount = traces.filter((trace) => trace.outcome === "budget_exhausted").length;
const focusCases = caseReports.filter((item) => ["c25-silent-second-bell", "c37-zeroed-pressure-gauge"].includes(item.caseId));
const goldenPathIds = ["c01-cold-room-knock", "c03-second-shadow", "c13-second-waterline", "c06-nonexistent-ticket", "c17-twelve-strikes", "c24-turned-painting", "c33-early-late-arrival", "c48-two-point-calibration", "c60-last-sample-before-stop"];
const report = {
  reportVersion: "1.7",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.7-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  blackBoxBoundary: { runnerInputs: ["PlayerProjection", "GameEvent", "SaveEnvelope"], runnerCommands: "GameCommand", caseFileVisibleToRunner: false, certificateVisibleToRunner: false, canonicalSaveShortcut: false, combinationSearch: false },
  budgets: { question: "20-30", evidence: "6-8", theory: "max-3", allowAbandonment: true, fixedSeeds: true },
  personaCount: SYNTHETIC_PERSONA_IDS.length,
  caseCount: release.entries.length,
  runCount: traces.length,
  outcomes: { solved: solvedCount, abandoned: abandonedCount, budgetExhausted: budgetExhaustedCount },
  traces,
  caseReports,
  focusCases,
  goldenPath: caseReports.filter((item) => goldenPathIds.includes(item.caseId)),
  gates: {
    bounded: traces.every((trace) => Number(trace.questionBudgetUsed) <= Number(trace.questionBudget) && Number(trace.evidenceBudgetUsed) <= Number(trace.evidenceBudget) && Number(trace.theoryBudgetUsed) <= Number(trace.theoryBudget)),
    noPublicSearch: traces.every((trace) => trace.publicSearchAttempts === 0),
    honestDistribution: solvedCount > 0 && abandonedCount > 0 && budgetExhaustedCount > 0,
    noLeaks: traces.every((trace) => trace.publicLeak === false),
    focusQuestionEffectiveness: focusCases.every((item) => item.averageValidQuestionRate >= 0.82),
    goldenNaturalPaths: caseReports.filter((item) => goldenPathIds.includes(item.caseId)).every((item) => item.naturalProgressPath),
    chapterTracking: caseReports.filter((item) => ["c33-early-late-arrival", "c36-no-one-left-terminal", "c60-last-sample-before-stop"].includes(item.caseId)).every((item) => item.maximumChapterEntries >= 2 && item.maximumChapterTransitions >= 1),
  },
  passed: false,
  qualification: "预算型自动化只测量有限公开操作下的可达性、放弃分布和体验风险代理；真人参与为 0，不能证明乐趣、审美、理解率、留存或市场适配。",
};
report.passed = Object.values(report.gates).every(Boolean);
writeFileSync(resolve(root, "docs/v1.7-budgeted-synthetic.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: report.caseCount, personas: report.personaCount, runs: report.runCount, outcomes: report.outcomes, focusCases, goldenNaturalPaths: report.gates.goldenNaturalPaths, chapterTracking: report.gates.chapterTracking, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
