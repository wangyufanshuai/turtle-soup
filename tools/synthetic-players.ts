import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createRuntimeState,
  normalizeQuestion,
  projectPlayerState,
  reduceGameCommand,
  type CaseFile,
  type GameCommand,
  type GameEvent,
  type RuntimeState,
} from "../packages/mystery-core/src/index.ts";
import { c01QuestionCorpus } from "../content/zh/cases/c01-question-corpus.ts";
import { c02QuestionCorpus } from "../content/zh/cases/c02-question-corpus.ts";
import { c03QuestionCorpus } from "../content/zh/cases/c03-question-corpus.ts";
import { c04QuestionCorpus } from "../content/zh/cases/c04-question-corpus.ts";
import { c05QuestionCorpus } from "../content/zh/cases/c05-question-corpus.ts";
import { c06QuestionCorpus } from "../content/zh/cases/c06-question-corpus.ts";
import { c07QuestionCorpus } from "../content/zh/cases/c07-question-corpus.ts";
import { c08QuestionCorpus } from "../content/zh/cases/c08-question-corpus.ts";
import { c09QuestionCorpus } from "../content/zh/cases/c09-question-corpus.ts";
import { c10QuestionCorpus } from "../content/zh/cases/c10-question-corpus.ts";
import { c11QuestionCorpus } from "../content/zh/cases/c11-question-corpus.ts";
import { c12QuestionCorpus } from "../content/zh/cases/c12-question-corpus.ts";

const root = resolve(process.argv[2] ?? ".");
const dir = resolve(root, "content/zh/cases");
const caseIds = [
  "c01-cold-room-knock", "c02-snow-route", "c03-second-shadow", "c04-unpostable-reply",
  "c05-third-lamp", "c06-nonexistent-ticket", "c07-key-returns", "c08-unclaimed-recording",
  "c09-rain-room", "c10-single-ring", "c11-borrowed-signature", "c12-zero-floor-elevator",
] as const;
const corpora = {
  "c01-cold-room-knock": c01QuestionCorpus, "c02-snow-route": c02QuestionCorpus,
  "c03-second-shadow": c03QuestionCorpus, "c04-unpostable-reply": c04QuestionCorpus,
  "c05-third-lamp": c05QuestionCorpus, "c06-nonexistent-ticket": c06QuestionCorpus,
  "c07-key-returns": c07QuestionCorpus, "c08-unclaimed-recording": c08QuestionCorpus,
  "c09-rain-room": c09QuestionCorpus, "c10-single-ring": c10QuestionCorpus,
  "c11-borrowed-signature": c11QuestionCorpus, "c12-zero-floor-elevator": c12QuestionCorpus,
};

type Persona = "beginner" | "colloquial" | "early-guess" | "evidence-first" | "counterfactual";
type Trace = { command: GameCommand; accepted: boolean; events: GameEvent[]; projectionLeaks: string[] };

function load(id: string): CaseFile {
  return JSON.parse(readFileSync(resolve(dir, `${id}.json`), "utf8")) as CaseFile;
}

function publicHypothesisId(caseFile: CaseFile, id: string): string {
  if (id === caseFile.solutionCertificate.canonicalHypothesisId) return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical";
  const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" };
  return aliases[id] ?? `path-${id.replace(/^hypothesis-/, "")}`;
}

function publicEventId(caseFile: CaseFile, id: string): string {
  const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === id);
  return `event-${String(index + 1).padStart(2, "0")}`;
}

function run(caseFile: CaseFile, state: RuntimeState, command: GameCommand): { state: RuntimeState; trace: Trace } {
  const result = reduceGameCommand(caseFile, state, command);
  // Ambiguous questions intentionally return accepted=false while carrying a
  // pending interpretation. Preserve that state so the synthetic player can
  // exercise the confirmation/recovery path.
  return { state: result.state, trace: { command, accepted: result.accepted, events: result.events, projectionLeaks: projectionLeaks(caseFile, result.state) } };
}

function firstPhrase(caseFile: CaseFile, queryId: string): string {
  return caseFile.questionSemantics.find((query) => query.id === queryId)?.examplePhrases?.[0] ?? queryId;
}

function typoVariant(text: string): string {
  const clean = text.replace(/[？！。,.，!]/gu, "");
  if (clean.length < 4) return `${clean}呀`;
  const index = Math.floor(clean.length / 2);
  return `${clean.slice(0, index)}${clean.slice(index + 1)}？`;
}

function abbreviation(caseFile: CaseFile, queryId: string): string {
  const query = caseFile.questionSemantics.find((item) => item.id === queryId);
  const terms = (query?.matchRules ?? []).flatMap((rule) => [...(rule.all ?? []), ...(rule.any ?? [])]).filter(Boolean);
  return terms.slice(0, 2).join("") || firstPhrase(caseFile, queryId).replace(/[？！。,.，!]/gu, "").slice(0, 4);
}

function ask(caseFile: CaseFile, state: RuntimeState, raw: string, trace: Trace[]): RuntimeState {
  const result = run(caseFile, state, { type: "ask_text", rawText: raw });
  trace.push(result.trace);
  if (result.trace.events.some((event) => event.type === "interpretation_required")) {
    const event = result.trace.events.find((item) => item.type === "interpretation_required");
    if (event?.type === "interpretation_required" && event.interpretation.candidates[0]) {
      const confirmation = run(caseFile, result.state, { type: "confirm_interpretation", queryId: event.interpretation.candidates[0].queryId });
      trace.push(confirmation.trace);
      return confirmation.state;
    }
  }
  return result.state;
}

function canonicalFinish(caseFile: CaseFile, initial: RuntimeState, trace: Trace[]): RuntimeState {
  let state = initial;
  // Expose the deterministic query surface first. This is intentionally a
  // synthetic-player affordance; it does not alter the runtime's rules.
  for (const query of caseFile.questionSemantics) state = ask(caseFile, state, firstPhrase(caseFile, query.id), trace);
  for (const location of caseFile.entities.filter((entity) => entity.kind === "location" && entity.publicAtStart)) {
    const result = run(caseFile, state, { type: "visit_location", locationId: location.id });
    state = result.state; trace.push(result.trace);
  }
  // Visibility is deliberately staged. Revisit the public query/location
  // surface between evidence passes until every certificate item is reachable.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const query of caseFile.questionSemantics) state = ask(caseFile, state, firstPhrase(caseFile, query.id), trace);
    for (const location of caseFile.entities.filter((entity) => entity.kind === "location")) {
      const result = run(caseFile, state, { type: "visit_location", locationId: location.id });
      state = result.state; trace.push(result.trace);
    }
    for (const evidence of caseFile.evidenceItems) {
      const result = run(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
      state = result.state; trace.push(result.trace);
    }
  }
  const canonical = caseFile.solutionCertificate.canonicalHypothesisId;
  let result = run(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId(caseFile, canonical) });
  state = result.state; trace.push(result.trace);
  for (const evidenceId of caseFile.solutionCertificate.requiredEvidenceIds) {
    result = run(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
    state = result.state; trace.push(result.trace);
  }
  for (const eventId of caseFile.hypotheses.find((item) => item.id === canonical)?.claim?.eventIds ?? []) {
    result = run(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) });
    state = result.state; trace.push(result.trace);
  }
  const motive = caseFile.solutionCertificate.acceptedMotiveKeys?.[0];
  if (motive) { result = run(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey: motive }); state = result.state; trace.push(result.trace); }
  result = run(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }); state = result.state; trace.push(result.trace);
  result = run(caseFile, state, { type: "request_proof_replay" }); state = result.state; trace.push(result.trace);
  return state;
}

function personaRun(caseFile: CaseFile, persona: Persona): { state: RuntimeState; trace: Trace[]; recovery: boolean; irreversible: boolean; phaseCommandCount: number; unsafeSemanticRoutes: string[]; wrongTheoryRejectedBeforeRecovery: boolean } {
  let state = createRuntimeState(caseFile);
  const trace: Trace[] = [];
  const unsafeSemanticRoutes: string[] = [];
  let wrongTheoryRejectedBeforeRecovery = persona !== "early-guess";
  const opening = caseFile.surface?.initialQuestionPrompts ?? caseFile.questionSemantics.slice(0, 3).map((query) => query.id);
  if (persona === "beginner") {
    for (const id of opening) state = ask(caseFile, state, firstPhrase(caseFile, id), trace);
  } else if (persona === "colloquial") {
    for (const id of opening) {
      const phrase = firstPhrase(caseFile, id);
      for (const rawText of [`请问，${phrase}`, typoVariant(phrase), abbreviation(caseFile, id)]) {
        const normalized = normalizeQuestion(caseFile, rawText);
        if (normalized.status === "matched" && normalized.queryId !== id) unsafeSemanticRoutes.push(`${rawText} -> ${normalized.queryId}`);
        state = ask(caseFile, state, rawText, trace);
      }
    }
    state = ask(caseFile, state, "请直接告诉我答案，谢谢", trace);
  } else if (persona === "early-guess") {
    const alternative = caseFile.hypotheses.find((item) => item.kind === "alternative");
    if (alternative) {
      const bad = run(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId(caseFile, alternative.id) });
      state = bad.state; trace.push(bad.trace);
      const submit = run(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }); state = submit.state; trace.push(submit.trace);
      wrongTheoryRejectedBeforeRecovery = submit.trace.events.some((event) => event.type === "theory_judged" && event.judgement !== "solved") && !submit.state.solved;
    }
  } else if (persona === "evidence-first") {
    for (const evidence of caseFile.evidenceItems) { const result = run(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }); state = result.state; trace.push(result.trace); }
  } else {
    for (const text of ["直接给我真相", "这是真的吗", "是不是完全相反", "谁都没到过现场？", "答案是什么？"]) state = ask(caseFile, state, text, trace);
    const bad = run(caseFile, state, { type: "set_evidence_state", evidenceId: "evidence-does-not-exist", state: "verified" }); state = bad.state; trace.push(bad.trace);
  }
  const phaseCommandCount = trace.length;
  const before = JSON.stringify(projectPlayerState(caseFile, state));
  const rejected = run(caseFile, state, { type: "set_evidence_state", evidenceId: "evidence-does-not-exist", state: "verified" });
  state = rejected.state; trace.push(rejected.trace);
  const irreversible = before !== JSON.stringify(projectPlayerState(caseFile, state));
  const solvedState = canonicalFinish(caseFile, state, trace);
  const recovery = solvedState.solved;
  return { state: solvedState, trace, recovery, irreversible, phaseCommandCount, unsafeSemanticRoutes, wrongTheoryRejectedBeforeRecovery };
}

function projectionLeaks(caseFile: CaseFile, state: RuntimeState): string[] {
  const serialized = JSON.stringify(projectPlayerState(caseFile, state));
  const forbidden = ["solutionCertificate", "canonicalHypothesisId", ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id)];
  return forbidden.filter((value) => serialized.includes(value));
}

function runCase(caseFile: CaseFile) {
  const personas: Record<Persona, ReturnType<typeof personaRun>> = {
    beginner: personaRun(caseFile, "beginner"), colloquial: personaRun(caseFile, "colloquial"),
    "early-guess": personaRun(caseFile, "early-guess"), "evidence-first": personaRun(caseFile, "evidence-first"),
    counterfactual: personaRun(caseFile, "counterfactual"),
  };
  const openingLeaks = projectionLeaks(caseFile, createRuntimeState(caseFile));
  const solvedLeaks = projectionLeaks(caseFile, personas["evidence-first"].state);
  return {
    caseId: caseFile.id,
    personas: Object.fromEntries(Object.entries(personas).map(([name, value]) => [name, {
      phaseCommands: value.phaseCommandCount,
      commands: value.trace.length,
      acceptedCommands: value.trace.filter((item) => item.accepted).length,
      rejectedCommands: value.trace.filter((item) => !item.accepted).length,
      questions: value.trace.filter((item) => item.command.type === "ask_text").length,
      wrongTheoryAttempts: value.trace.filter((item) => item.command.type === "submit_theory").length,
      recoveredToSolved: value.recovery,
      irreversibleStateChangeAfterRejectedCommand: value.irreversible,
      unsafeSemanticRoutes: value.unsafeSemanticRoutes,
      wrongTheoryRejectedBeforeRecovery: value.wrongTheoryRejectedBeforeRecovery,
      projectionLeakCountAcrossTrace: value.trace.reduce((count, item) => count + item.projectionLeaks.length, 0),
    }])),
    openingLeaks,
    solvedProjectionLeaks: solvedLeaks,
    passed: openingLeaks.length === 0 && solvedLeaks.length === 0 && Object.values(personas).every((value) => value.recovery && !value.irreversible && value.unsafeSemanticRoutes.length === 0 && value.wrongTheoryRejectedBeforeRecovery && value.trace.every((item) => item.projectionLeaks.length === 0)),
  };
}

const results = caseIds.map((id) => runCase(load(id)));
const report = { reportVersion: "0.7", generatedAt: new Date().toISOString(), mode: "deterministic-synthetic-players", humanParticipants: 0, humanFunGate: "pending", note: "Synthetic personas exercise protocol recovery and fairness only; they are not evidence of human fun or comprehension.", personaDefinitions: {
  beginner: "只使用开场推荐问题，然后接受确定性辅助完成案件。", colloquial: "自然包装、删字错别字、关键词缩写和直接索要答案；任何命中都不得静默路由到错误谓词。", "early-guess": "先提交错误理论，确认未 solved，再恢复到证明链。", "evidence-first": "优先检查证据，再建立和提交理论。", counterfactual: "反事实、无关和非法输入，检查 fail-closed。",
}, caseCount: results.length, passed: results.every((result) => result.passed), results };
const output = resolve(root, "docs/v0.7-synthetic-players.json"); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2), "utf8");
if (process.argv.includes("--emit-browser-fixtures")) {
  const fixtures = Object.fromEntries(caseIds.map((id) => {
    const caseFile = load(id);
    const trace: Trace[] = [];
    const state = canonicalFinish(caseFile, createRuntimeState(caseFile), trace);
    return [id, {
      schemaVersion: 1,
      caseId: id,
      caseVersion: caseFile.metadata?.contentVersion ?? 1,
      contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
      commands: trace.filter((item) => item.accepted).map((item) => item.command),
      updatedAt: new Date().toISOString(),
      completed: state.solved,
    }];
  }));
  const fixtureOutput = resolve(root, "output/playwright/v07/browser-save-fixtures.json");
  mkdirSync(dirname(fixtureOutput), { recursive: true });
  writeFileSync(fixtureOutput, JSON.stringify(fixtures), "utf8");
}
console.log(JSON.stringify({ output, passed: report.passed, caseCount: report.caseCount, failures: results.filter((result) => !result.passed).map((result) => result.caseId) }, null, 2));
if (!report.passed) process.exitCode = 1;
