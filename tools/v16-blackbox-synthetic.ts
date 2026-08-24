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
  runProjectionOnlyCase,
  validateCompatibleSave,
  type CaseFile,
  type GameCommand,
  type GameEvent,
  type PlayerProjection,
  type ProjectionOnlyAdapter,
  type ProjectionOnlySnapshot,
  type SaveEnvelope,
  SYNTHETIC_PERSONA_IDS,
  type SyntheticPersonaId,
} from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.6-internal-rc");
const patches = JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v1.4/patches.json"), "utf8")) as Array<{ caseId: string; baseCanonicalHash: string; [key: string]: unknown }>;
const aliases = JSON.parse(readFileSync(resolve(root, "content/zh/question-aliases/v1.6/packs.json"), "utf8")) as Array<{ caseId: string; [key: string]: unknown }>;
const patchByCase = new Map(patches.map((patch) => [patch.caseId, patch]));
const aliasByCase = new Map(aliases.map((pack) => [pack.caseId, pack]));

type AdapterBundle = { adapter: ProjectionOnlyAdapter; leakFound: () => boolean; commandLog: () => GameCommand[] };

function makeSave(caseFile: CaseFile, commands: GameCommand[], solved: boolean): SaveEnvelope {
  return { schemaVersion: 1, caseId: caseFile.id, caseVersion: caseFile.metadata?.contentVersion ?? 1, contentHash: caseFile.metadata?.canonicalHash ?? "unversioned", commands, updatedAt: new Date(0).toISOString(), completed: solved };
}

function publicLeak(caseFile: CaseFile, projection: PlayerProjection): boolean {
  const serialized = JSON.stringify(projection);
  const forbidden = ["solutionCertificate", "requiredFactIds", "minimumProofSets", "canonicalHypothesisId", "canonicalHypothesis", "spoiler answer", "剧透答案"];
  if (forbidden.some((token) => serialized.includes(token))) return true;
  const hiddenIds = [
    ...caseFile.facts.map((item) => item.id),
    ...caseFile.events.map((item) => item.id),
    ...caseFile.hypotheses.map((item) => item.id),
  ];
  return hiddenIds.some((id) => {
    // Public event/evidence handles are intentionally present in commands
    // and projections; authored/internal identifiers are the leak boundary.
    if (/^event-\d{2}$/.test(id) || /^evidence-[a-z]+-\d+$/.test(id)) return false;
    return id.length > 8 && serialized.includes(id);
  });
}

function makeAdapter(source: CaseFile): AdapterBundle {
  const caseFile = applyQuestionAliasPack(applyPresentationPatch(source, patchByCase.get(source.id) as never), aliasByCase.get(source.id) as never);
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
      state = replayed.state; commands = [...compatible.value.commands];
      return snapshot(replayed.events, true);
    },
  };
  return { adapter, leakFound: () => leak, commandLog: () => [...commands] };
}

const traces: Array<Record<string, unknown>> = [];
for (const entry of release.entries) {
  const base = loadCaseFile(entry);
  for (const persona of SYNTHETIC_PERSONA_IDS) {
    const bundle = makeAdapter(base);
    const trace = await runProjectionOnlyCase(bundle.adapter, persona as SyntheticPersonaId);
    traces.push({ caseId: entry.id, persona, ...trace, publicLeak: bundle.leakFound(), commandDigest: createHash("sha256").update(JSON.stringify(bundle.commandLog().map((command) => command.type))).digest("hex") });
  }
}

const report = {
  reportVersion: "1.6",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.6-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  blackBoxBoundary: { runnerInputs: ["PlayerProjection", "GameEvent", "SaveEnvelope"], runnerCommands: "GameCommand", caseFileVisibleToRunner: false, certificateVisibleToRunner: false, canonicalSaveShortcut: false },
  personaCount: SYNTHETIC_PERSONA_IDS.length,
  caseCount: release.entries.length,
  runCount: traces.length,
  requiredRunCount: 720,
  traces,
  passed: release.entries.length === 60 && traces.length === 720 && traces.every((trace) => trace.solved === true && trace.replayReady === true && trace.publicLeak === false),
  qualification: "Black-box automation measures public-protocol reachability, deterministic recovery and leakage lower bounds. It does not prove fun, narrative impact, aesthetics, human comprehension or market fit.",
};
writeFileSync(resolve(root, "docs/v1.6-blackbox-synthetic.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: report.caseCount, personas: report.personaCount, runs: report.runCount, solved: traces.filter((trace) => trace.solved).length, leaks: traces.filter((trace) => trace.publicLeak).length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
