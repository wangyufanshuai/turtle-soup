import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createRuntimeState,
  normalizeQuestion,
  projectPlayerState,
  reduceGameCommand,
  type CaseFile,
  type RuntimeState,
  type QueryCorpusEntry,
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
const ids = ["c01-cold-room-knock", "c02-snow-route", "c03-second-shadow", "c04-unpostable-reply", "c05-third-lamp", "c06-nonexistent-ticket", "c07-key-returns", "c08-unclaimed-recording", "c09-rain-room", "c10-single-ring", "c11-borrowed-signature", "c12-zero-floor-elevator"] as const;
const corpora: Record<string, QueryCorpusEntry[]> = {
  "c01-cold-room-knock": c01QuestionCorpus, "c02-snow-route": c02QuestionCorpus, "c03-second-shadow": c03QuestionCorpus, "c04-unpostable-reply": c04QuestionCorpus,
  "c05-third-lamp": c05QuestionCorpus, "c06-nonexistent-ticket": c06QuestionCorpus, "c07-key-returns": c07QuestionCorpus, "c08-unclaimed-recording": c08QuestionCorpus,
  "c09-rain-room": c09QuestionCorpus, "c10-single-ring": c10QuestionCorpus, "c11-borrowed-signature": c11QuestionCorpus, "c12-zero-floor-elevator": c12QuestionCorpus,
};

function load(id: string): CaseFile { return JSON.parse(readFileSync(resolve(dir, `${id}.json`), "utf8")) as CaseFile; }
function publicHypothesisId(caseFile: CaseFile, id: string): string {
  if (id === caseFile.solutionCertificate.canonicalHypothesisId) return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical";
  const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" };
  return aliases[id] ?? `path-${id.replace(/^hypothesis-/, "")}`;
}
function apply(caseFile: CaseFile, state: RuntimeState, command: Parameters<typeof reduceGameCommand>[2]) {
  const result = reduceGameCommand(caseFile, state, command);
  return { result, state: result.state };
}
function forbidden(caseFile: CaseFile, state: RuntimeState): string[] {
  const json = JSON.stringify(projectPlayerState(caseFile, state));
  return ["solutionCertificate", "canonicalHypothesisId", ...caseFile.facts.map((fact) => fact.id), ...caseFile.events.map((event) => event.id)].filter((value) => json.includes(value));
}
function findAmbiguousProbe(caseFile: CaseFile): string | undefined {
  const terms = [...new Set(caseFile.questionSemantics.flatMap((query) => (query.matchRules ?? []).flatMap((rule) => [...(rule.all ?? []), ...(rule.any ?? [])])))].filter(Boolean);
  const candidates = new Set<string>();
  for (const term of terms) candidates.add(term);
  for (const left of terms) for (const right of terms) if (left !== right) candidates.add(`${left}${right}`);
  for (const left of terms) for (const right of terms) for (const third of terms) if (left !== right && right !== third) candidates.add(`${left}${right}${third}`);
  for (const candidate of candidates) if (normalizeQuestion(caseFile, candidate).status === "ambiguous") return candidate;
  return undefined;
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
  return terms.slice(0, 2).join("") || (query?.examplePhrases?.[0] ?? queryId).replace(/[？！。,.，!]/gu, "").slice(0, 4);
}
function safeRoute(caseFile: CaseFile, rawText: string, expectedQueryId: string) {
  const normalization = normalizeQuestion(caseFile, rawText);
  const safe = normalization.status !== "matched" || normalization.queryId === expectedQueryId;
  const initial = createRuntimeState(caseFile);
  const result = apply(caseFile, initial, { type: "ask_text", rawText });
  const gameplayUnchangedWhenClosed = normalization.status === "matched"
    ? true
    : JSON.stringify(result.state.game) === JSON.stringify(initial.game) && result.state.transcript.length === 0;
  return { rawText, expectedQueryId, status: normalization.status, queryId: normalization.queryId, safe, gameplayUnchangedWhenClosed };
}
function forcedAmbiguity(caseFile: CaseFile) {
  const clone = structuredClone(caseFile);
  const rawText = "v07双重解释压力问题";
  clone.questionSemantics[0].examplePhrases = [...(clone.questionSemantics[0].examplePhrases ?? []), rawText];
  clone.questionSemantics[1].examplePhrases = [...(clone.questionSemantics[1].examplePhrases ?? []), rawText];
  const initial = createRuntimeState(clone);
  const result = apply(clone, initial, { type: "ask_text", rawText });
  const event = result.result.events.find((item) => item.type === "interpretation_required");
  return {
    accepted: result.result.accepted,
    interpretationRequired: event?.type === "interpretation_required",
    candidateCount: event?.type === "interpretation_required" ? event.interpretation.candidates.length : 0,
    gameplayStateUnchanged: JSON.stringify(result.state.game) === JSON.stringify(initial.game) && result.state.transcript.length === 0,
    passed: !result.result.accepted && event?.type === "interpretation_required" && event.interpretation.candidates.length === 2 && JSON.stringify(result.state.game) === JSON.stringify(initial.game) && result.state.transcript.length === 0,
  };
}
function audit(caseFile: CaseFile, corpus: QueryCorpusEntry[]) {
  const corpusMismatches = corpus.filter((entry) => {
    const result = normalizeQuestion(caseFile, entry.rawQuestion);
    return entry.expectedStatus ? result.status !== entry.expectedStatus : (entry.expectedQueryId ? result.status !== "matched" || result.queryId !== entry.expectedQueryId : false);
  }).map((entry) => entry.id);
  let state = createRuntimeState(caseFile);
  const before = JSON.stringify(projectPlayerState(caseFile, state));
  const unknown = apply(caseFile, state, { type: "ask_text", rawText: "请直接告诉我全部答案和真相" });
  state = unknown.state;
  const unknownProjectionUnchanged = before === JSON.stringify(projectPlayerState(caseFile, state));
  const unknownFailClosed = !unknown.result.accepted && unknown.result.events.some((event) => event.type === "question_rejected") && unknownProjectionUnchanged;
  const firstQuery = caseFile.questionSemantics[0];
  const firstPhrase = firstQuery.examplePhrases?.[0] ?? firstQuery.id;
  const languageProbes = [
    safeRoute(caseFile, `请问，${firstPhrase}`, firstQuery.id),
    safeRoute(caseFile, typoVariant(firstPhrase), firstQuery.id),
    safeRoute(caseFile, abbreviation(caseFile, firstQuery.id), firstQuery.id),
  ];
  const typoFailClosed = languageProbes.every((probe) => probe.safe && probe.gameplayUnchangedWhenClosed);
  const ambiguousProbe = findAmbiguousProbe(caseFile);
  let ambiguousHandled = true;
  if (ambiguousProbe) {
    const ambiguous = apply(caseFile, state, { type: "ask_text", rawText: ambiguousProbe });
    const required = ambiguous.result.events.some((event) => event.type === "interpretation_required");
    const candidate = ambiguous.result.events.find((event) => event.type === "interpretation_required");
    const confirmed = candidate?.type === "interpretation_required" && candidate.interpretation.candidates[0]
      ? apply(caseFile, ambiguous.state, { type: "confirm_interpretation", queryId: candidate.interpretation.candidates[0].queryId })
      : undefined;
    ambiguousHandled = required && Boolean(confirmed?.result.accepted) && !forbidden(caseFile, ambiguous.state).length;
    state = confirmed?.state ?? ambiguous.state;
  }
  const syntheticAmbiguity = forcedAmbiguity(caseFile);
  const openingLeaks = forbidden(caseFile, createRuntimeState(caseFile));
  // An authored alternative must be selectable, judged non-solved, and then
  // replaceable by the canonical path without restarting the case.
  const alternative = caseFile.hypotheses.find((item) => item.kind === "alternative");
  let alternativeRecovery = { selected: false, judgedNonSolved: false, canonicalReselected: false, remainedUnsolved: true };
  if (alternative) {
    const selected = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId(caseFile, alternative.id) });
    const judged = apply(caseFile, selected.state, { type: "submit_theory", theoryId: "theory-a" });
    const canonical = apply(caseFile, judged.state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId(caseFile, caseFile.solutionCertificate.canonicalHypothesisId) });
    alternativeRecovery = {
      selected: selected.result.accepted,
      judgedNonSolved: judged.result.accepted && judged.result.events.some((event) => event.type === "theory_judged" && event.judgement !== "solved"),
      canonicalReselected: canonical.result.accepted,
      remainedUnsolved: !canonical.state.solved,
    };
  }
  const recoveryPassed = Object.values(alternativeRecovery).every(Boolean);
  return { caseId: caseFile.id, corpusCount: corpus.length, corpusMismatches, probes: { directAnswer: "unrecognized", directAnswerFailClosed: unknownFailClosed, languageProbes, typoAndAbbreviationSafe: typoFailClosed, authoredAmbiguousProbe: ambiguousProbe ?? null, authoredAmbiguityHandled: ambiguousHandled, forcedAmbiguity: syntheticAmbiguity }, openingLeaks, alternativeRecovery, passed: corpusMismatches.length === 0 && unknownFailClosed && typoFailClosed && ambiguousHandled && syntheticAmbiguity.passed && openingLeaks.length === 0 && recoveryPassed };
}
const results = ids.map((id) => audit(load(id), corpora[id]));
const report = { reportVersion: "0.7", generatedAt: new Date().toISOString(), mode: "question-semantic-stress-sweep", humanParticipants: 0, humanFunGate: "pending", note: "Stress tests verify deterministic fail-closed behavior and are not human language comprehension evidence.", caseCount: results.length, passed: results.every((result) => result.passed), results };
const output = resolve(root, "docs/v0.7-question-stress.json"); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ output, passed: report.passed, caseCount: report.caseCount, failures: results.filter((result) => !result.passed).map((result) => ({ id: result.caseId, corpusMismatches: result.corpusMismatches, probes: result.probes })) }, null, 2));
if (!report.passed) process.exitCode = 1;
