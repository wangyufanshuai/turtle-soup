import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  analyzeCaseQuality,
  createRuntimeState,
  judgeTheory,
  normalizeQuestion,
  projectPlayerState,
  reduceGameCommand,
  validateCaseShape,
  type CaseFile,
  type GameCommand,
  type QueryCorpusEntry,
  type RuntimeState,
} from "../packages/mystery-core/src/index.ts";
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
const caseDir = resolve(root, "content/zh/cases");
const cases = [
  ["c02-snow-route", c02QuestionCorpus], ["c03-second-shadow", c03QuestionCorpus],
  ["c04-unpostable-reply", c04QuestionCorpus], ["c05-third-lamp", c05QuestionCorpus],
  ["c06-nonexistent-ticket", c06QuestionCorpus], ["c07-key-returns", c07QuestionCorpus],
  ["c08-unclaimed-recording", c08QuestionCorpus], ["c09-rain-room", c09QuestionCorpus],
  ["c10-single-ring", c10QuestionCorpus], ["c11-borrowed-signature", c11QuestionCorpus],
  ["c12-zero-floor-elevator", c12QuestionCorpus],
] as const;

function load(id: string): CaseFile {
  return JSON.parse(readFileSync(resolve(caseDir, `${id}.json`), "utf8")) as CaseFile;
}

function publicHypothesisId(caseFile: CaseFile, id: string): string {
  if (id === caseFile.solutionCertificate.canonicalHypothesisId) return "path-canonical";
  return `path-${id.replace(/^hypothesis-/, "")}`;
}

function publicEventId(caseFile: CaseFile, id: string): string {
  const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === id);
  return `event-${String(index + 1).padStart(2, "0")}`;
}

function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand): { state: RuntimeState; accepted: boolean; message: string } {
  const result = reduceGameCommand(caseFile, state, command);
  const event = result.events.find((item) => item.type === "command_rejected");
  return { state: result.state, accepted: result.accepted, message: event?.type === "command_rejected" ? event.message : "" };
}

function canonicalSession(caseFile: CaseFile): { state: RuntimeState; failures: string[] } {
  let state = createRuntimeState(caseFile);
  const failures: string[] = [];
  const run = (command: GameCommand) => {
    const result = apply(caseFile, state, command);
    if (!result.accepted) failures.push(`${command.type}: ${result.message}`);
    state = result.state;
  };
  for (const evidenceId of caseFile.solutionCertificate.requiredEvidenceIds) run({ type: "set_evidence_state", evidenceId, state: "examined" });
  run({ type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId(caseFile, caseFile.solutionCertificate.canonicalHypothesisId) });
  for (const evidenceId of caseFile.solutionCertificate.requiredEvidenceIds) run({ type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
  for (const eventId of caseFile.hypotheses.find((item) => item.id === caseFile.solutionCertificate.canonicalHypothesisId)?.claim?.eventIds ?? []) run({ type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) });
  run({ type: "set_theory_motive", theoryId: "theory-a", motiveKey: caseFile.solutionCertificate.acceptedMotiveKeys?.[0] });
  run({ type: "submit_theory", theoryId: "theory-a" });
  run({ type: "request_proof_replay" });
  return { state, failures };
}

function projectionLeaks(caseFile: CaseFile): string[] {
  const serialized = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile)));
  const forbidden = ["solutionCertificate", "canonicalHypothesisId", ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id)];
  return forbidden.filter((value) => serialized.includes(value));
}

function orderConverges(caseFile: CaseFile): boolean {
  const available = caseFile.evidenceItems.filter((item) => item.defaultState === "available").map((item) => item.id);
  const orders = [available, [...available].reverse(), [...available].sort()];
  const projections = orders.map((order) => {
    let state = createRuntimeState(caseFile);
    for (const evidenceId of order) {
      const result = apply(caseFile, state, { type: "set_evidence_state", evidenceId, state: "examined" });
      state = result.state;
    }
    return projectPlayerState(caseFile, state);
  });
  const first = JSON.stringify(projections[0].evidence.map((item) => item.state));
  return projections.every((projection) => JSON.stringify(projection.evidence.map((item) => item.state)) === first);
}

function audit(caseFile: CaseFile, corpus: QueryCorpusEntry[]) {
  const errors: string[] = [];
  validateCaseShape(caseFile);
  const quality = analyzeCaseQuality(caseFile, corpus);
  const corpusMismatches = corpus.filter((entry) => {
    const result = normalizeQuestion(caseFile, entry.rawQuestion);
    return result.status !== "matched" || result.queryId !== entry.expectedQueryId;
  }).map((entry) => entry.id);
  if (corpusMismatches.length) errors.push(`corpus mismatches: ${corpusMismatches.length}`);
  const leaks = projectionLeaks(caseFile);
  if (leaks.length) errors.push(`opening projection leak: ${leaks.join(", ")}`);
  const session = canonicalSession(caseFile);
  if (session.failures.length) errors.push(`canonical command failures: ${session.failures.join(" | ")}`);
  const projection = projectPlayerState(caseFile, session.state);
  if (!projection.solved) errors.push("canonical proof did not solve");
  const replayCount = projection.replay.length;
  if (replayCount !== caseFile.proofReplay.length) errors.push(`replay count ${replayCount}/${caseFile.proofReplay.length}`);
  const alternatives = caseFile.hypotheses.filter((item) => item.kind === "alternative").map((hypothesis) => {
    const judgement = judgeTheory(caseFile, session.state.game, { hypothesisId: hypothesis.id, evidenceIds: session.state.game.discoveredEvidenceIds, eventIds: [caseFile.events[0]?.id], motiveKey: hypothesis.claim?.motiveKey });
    return { id: hypothesis.id, judgement: judgement.judgement };
  });
  if (alternatives.some((item) => item.judgement !== "invalidated")) errors.push("an authored alternative survived contradiction testing");
  if (!orderConverges(caseFile)) errors.push("evidence order did not converge");
  return { id: caseFile.id, quality: quality.metrics, corpusMismatches: corpusMismatches.length, openingLeaks: leaks, commandFailures: session.failures, solved: projection.solved, replayCount, alternatives, orderConverges: orderConverges(caseFile), passed: errors.length === 0, errors };
}

const results = cases.map(([id, corpus]) => audit(load(id), corpus));
const report = { reportVersion: "0.6", generatedAt: new Date().toISOString(), mode: "automated-fairness-sweep", humanParticipants: 0, note: "This report is not a substitute for human comprehension or satisfaction measurements.", caseCount: results.length, passed: results.every((result) => result.passed), results };
const output = resolve(root, "docs/fairness-reports/v0.6-c02-c12.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ output, passed: report.passed, caseCount: report.caseCount, failures: results.filter((result) => !result.passed).map((result) => ({ id: result.id, errors: result.errors })) }, null, 2));
if (!report.passed) process.exitCode = 1;
