import { createRuntimeState, projectPlayerState, reduceGameCommand, replayCommands, validateCaseShape, type CaseFile, type GameCommand, type RuntimeState } from "../packages/mystery-core/src/index.ts";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadQuestionCorpus, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v2.5-internal-rc");
function publicAlternative(caseFile: CaseFile) {
  const id = caseFile.solutionCertificate.alternativeHypothesisIds[0];
  const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" };
  return aliases[id] ?? `path-${id.replace(/^hypothesis-/u, "")}`;
}
function publicHypothesis(caseFile: CaseFile, id: string) {
  if (id === caseFile.solutionCertificate.canonicalHypothesisId) return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical";
  return publicAlternative(caseFile);
}
function publicEventId(caseFile: CaseFile, id: string) {
  const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === id);
  return `event-${String(index + 1).padStart(2, "0")}`;
}
function finish(caseFile: CaseFile, evidenceIds: string[]) {
  let state = createRuntimeState(caseFile);
  const apply = (command: GameCommand) => { const result = reduceGameCommand(caseFile, state, command); if (result.accepted) state = result.state; else throw new Error(`${caseFile.id}:${command.type}`); };
  for (const evidence of caseFile.evidenceItems) apply({ type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
  const canonical = caseFile.solutionCertificate.canonicalHypothesisId;
  apply({ type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesis(caseFile, canonical) });
  for (const evidenceId of evidenceIds) apply({ type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
  for (const eventId of caseFile.hypotheses.find((item) => item.id === canonical)?.claim?.eventIds ?? []) apply({ type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) });
  const motiveKey = caseFile.solutionCertificate.acceptedMotiveKeys?.[0];
  if (motiveKey) apply({ type: "set_theory_motive", theoryId: "theory-a", motiveKey });
  for (const [boardIndex, board] of (caseFile.reasoningBoards ?? []).entries()) {
    const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
    for (const [slotIndex, slot] of board.slots.entries()) apply({ type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(caseFile, slot.acceptsEventIds[0]) });
    for (const connection of caseFile.solutionCertificate.proofObligations?.filter((item) => item.boardId === board.id).flatMap((item) => item.requiredConnections ?? []) ?? []) apply({ type: "connect_reasoning_items", boardId, fromItemId: publicEventId(caseFile, connection.fromEventId), toItemId: publicEventId(caseFile, connection.toEventId), relation: connection.relation });
  }
  apply({ type: "submit_theory", theoryId: "theory-a" });
  return state;
}
function replayWith(caseFile: CaseFile, commands: GameCommand[]) {
  return replayCommands(caseFile, commands).state;
}
const cases = [] as Array<Record<string, unknown>>;
for (const entry of release.entries) {
  const caseFile = loadCaseFile(entry);
  validateCaseShape(caseFile);
  const canonical = createCanonicalSave(caseFile);
  const solved = replayWith(caseFile, canonical.commands);
  const projection = projectPlayerState(caseFile, solved);
  const mutation = entry.seasonId === "season-5"
    ? caseFile.solutionCertificate.minimumProofSets.flatMap((set) => set.evidenceIds.map((evidenceId) => ({ proofSetId: set.id, evidenceId, failed: !finish(caseFile, set.evidenceIds.filter((id) => id !== evidenceId)).solved })))
    : [];
  const redHerring = caseFile.evidenceItems.find((item) => item.importance === "irrelevant");
  const withoutRedHerring = redHerring ? canonical.commands.filter((command) => !(command.type === "set_evidence_state" && command.evidenceId === redHerring.id)) : canonical.commands;
  const wrongTheory = canonical.commands.map((command) => command.type === "set_theory_hypothesis" ? { ...command, hypothesisId: publicAlternative(caseFile) } : command);
  const duplicate = replayWith(caseFile, [...canonical.commands, ...canonical.commands.filter((command) => command.type === "ask_text").slice(0, 1)]);
  const corpus = await loadQuestionCorpus(entry);
  const ambiguity = corpus.filter((item) => item.expectedStatus === "ambiguous").length;
  const record = {
    caseId: caseFile.id,
    seasonId: entry.seasonId,
    solved,
    projectionStable: JSON.stringify(projectPlayerState(caseFile, solved)) === JSON.stringify(projectPlayerState(caseFile, replayWith(caseFile, canonical.commands))),
    requiredEvidenceMutation: { count: mutation.length, failedCount: mutation.filter((item) => item.failed).length, passed: entry.seasonId !== "season-5" || mutation.every((item) => item.failed) },
    redHerringRemoval: { evidenceId: redHerring?.id ?? null, solved: withoutRedHerring ? replayWith(caseFile, withoutRedHerring).solved : true, passed: redHerring ? replayWith(caseFile, withoutRedHerring).solved : true },
    wrongTheoryRejected: !replayWith(caseFile, wrongTheory).solved,
    duplicateQuestionIdempotent: duplicate.game.answeredQueryIds.length === solved.game.answeredQueryIds.length,
    twoMinimumProofSets: (caseFile.solutionCertificate.minimumProofSets?.length ?? 0) >= 2 || entry.seasonId !== "season-5",
    corpusCount: corpus.length,
    ambiguousCount: ambiguity,
    chapters: caseFile.chapters?.length ?? 0,
    boardModes: (caseFile.reasoningBoards ?? []).map((board) => board.mode),
  };
  const season5Gates = entry.seasonId !== "season-5" || (corpus.length >= 220 && ambiguity >= 6 && ambiguity <= 12 && record.requiredEvidenceMutation.passed && record.redHerringRemoval.passed);
  const passed = solved.solved && record.projectionStable && record.requiredEvidenceMutation.passed && record.redHerringRemoval.passed && record.wrongTheoryRejected && record.duplicateQuestionIdempotent && record.twoMinimumProofSets && season5Gates;
  cases.push({ ...record, passed });
}
const season5 = cases.filter((item) => item.seasonId === "season-5");
const report = {
  reportVersion: "2.5",
  releaseProfile: "v2.5-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  syntheticPersonas: ["新手观察型", "口语输入型", "证据优先型", "反事实型", "提前猜测型", "极简提问型", "乱序调查型", "歧义恢复型", "错误理论反复提交型", "挑战模式型", "存档中断恢复型", "离线切换型"],
  caseCount: cases.length,
  season5Count: season5.length,
  cases,
  passed: cases.length === 84 && season5.length === 24 && cases.every((item) => item.passed),
};
writeFileSync(resolve(root, "docs/v2.5-fairness.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: cases.length, season5Count: season5.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
