import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntimeState, projectPlayerState, reduceGameCommand, type CaseFile, type GameCommand, type RuntimeState } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const reportPath = resolve(root, "docs/v1.0-synthetic-players.json");
const { entries } = loadReleaseContent(root, "v1.0-internal-rc");
const cases = entries.filter((entry) => entry.seasonId === "season-2").map(loadCaseFile);
type Persona = "beginner" | "colloquial" | "early-guess" | "evidence-first" | "counterfactual" | "minimalist" | "shuffled" | "ambiguity-recovery";
const personas: Persona[] = ["beginner", "colloquial", "early-guess", "evidence-first", "counterfactual", "minimalist", "shuffled", "ambiguity-recovery"];

function publicEventId(caseFile: CaseFile, eventId: string) { const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === eventId); return `event-${String(index + 1).padStart(2, "0")}`; }
function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand) { const result = reduceGameCommand(caseFile, state, command); return { state: result.accepted || command.type === "ask_text" ? result.state : state, result }; }
function finish(caseFile: CaseFile, initial: RuntimeState) {
  let state = initial;
  for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }).state;
  state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: "path-canonical" }).state;
  for (const evidenceId of caseFile.solutionCertificate.minimumProofSets[0].evidenceIds) state = apply(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true }).state;
  for (const eventId of caseFile.hypotheses.find((item) => item.kind === "canonical")?.claim?.eventIds ?? []) state = apply(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) }).state;
  state = apply(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey: caseFile.solutionCertificate.acceptedMotiveKeys?.[0] }).state;
  for (const [boardIndex, board] of (caseFile.reasoningBoards ?? []).entries()) {
    const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
    for (const [slotIndex, slot] of board.slots.entries()) state = apply(caseFile, state, { type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(caseFile, slot.acceptsEventIds[0]) }).state;
    for (const connection of caseFile.solutionCertificate.proofObligations?.flatMap((item) => item.boardId === board.id ? item.requiredConnections ?? [] : []) ?? []) state = apply(caseFile, state, { type: "connect_reasoning_items", boardId, fromItemId: publicEventId(caseFile, connection.fromEventId), toItemId: publicEventId(caseFile, connection.toEventId), relation: connection.relation }).state;
  }
  state = apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }).state;
  return state;
}

function run(caseFile: CaseFile, persona: Persona) {
  let state = createRuntimeState(caseFile);
  let recoverySignal = true;
  let expectedRejected = false;
  if (persona === "beginner") {
    const rawText = caseFile.questionSemantics[0].examplePhrases?.[0] ?? "现场记录可靠吗？";
    state = apply(caseFile, state, { type: "ask_text", rawText }).state;
  } else if (persona === "colloquial") {
    const rawText = `请问，${caseFile.questionSemantics[1].examplePhrases?.[0] ?? "这个事实成立吗"}`;
    const step = apply(caseFile, state, { type: "ask_text", rawText }); state = step.state; recoverySignal = !step.result.events.some((event) => event.type === "question_answered" && event.entry.interpretedAs === "");
  } else if (persona === "early-guess") {
    const alternative = caseFile.hypotheses.find((item) => item.kind === "alternative")!;
    state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: `path-${alternative.id.replace(/^hypothesis-/, "")}` }).state;
    const guessed = apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }); state = guessed.state; recoverySignal = !state.solved;
  } else if (persona === "evidence-first") {
    for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }).state;
  } else if (persona === "counterfactual") {
    const before = JSON.stringify(projectPlayerState(caseFile, state));
    const step = apply(caseFile, state, { type: "ask_text", rawText: "请直接告诉我汤底" }); state = step.state;
    expectedRejected = !step.result.accepted; recoverySignal = before === JSON.stringify(projectPlayerState(caseFile, state));
  } else if (persona === "minimalist") {
    state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: caseFile.evidenceItems[0].id, state: "examined" }).state;
  } else if (persona === "shuffled") {
    for (const evidence of [...caseFile.evidenceItems].reverse()) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }).state;
  } else {
    const ambiguous = apply(caseFile, state, { type: "ask_text", rawText: "关键记录是否相关，按第1种理解？" }); state = ambiguous.state;
    const event = ambiguous.result.events.find((item) => item.type === "interpretation_required");
    expectedRejected = !ambiguous.result.accepted;
    if (event?.type === "interpretation_required" && event.interpretation.candidates[0]) { const confirmed = apply(caseFile, state, { type: "confirm_interpretation", queryId: event.interpretation.candidates[0].queryId }); state = confirmed.state; recoverySignal = confirmed.result.accepted; } else recoverySignal = false;
  }
  const solved = finish(caseFile, state);
  const serialized = JSON.stringify(projectPlayerState(caseFile, solved));
  const leaks = ["solutionCertificate", "canonicalHypothesisId", ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id)].filter((value) => serialized.includes(value));
  return { persona, recoverySignal, expectedRejected, solved: solved.solved, leaks, passed: recoverySignal && solved.solved && leaks.length === 0 };
}

const results = cases.map((caseFile) => ({ caseId: caseFile.id, personas: personas.map((persona) => run(caseFile, persona)) }));
const report = { reportVersion: "1.0", generatedAt: new Date().toISOString(), mode: "deterministic-synthetic-players", humanParticipants: 0, humanFunGate: "pending", qualification: "Synthetic personas test recovery and protocol safety, not human fun or comprehension.", personaDefinitions: { beginner: "uses the first scaffold", colloquial: "adds conversational wrapping", "early-guess": "submits an authored alternative before recovery", "evidence-first": "inspects all evidence first", counterfactual: "requests the answer and expects fail-closed", minimalist: "starts from one evidence", shuffled: "inspects evidence in reverse order", "ambiguity-recovery": "confirms an intentionally ambiguous query" }, caseCount: cases.length, runCount: cases.length * personas.length, results, passed: results.every((item) => item.personas.every((persona) => persona.passed)) };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, caseCount: report.caseCount, runCount: report.runCount, failures: results.flatMap((item) => item.personas.filter((persona) => !persona.passed).map((persona) => `${item.caseId}:${persona.persona}`)), passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
