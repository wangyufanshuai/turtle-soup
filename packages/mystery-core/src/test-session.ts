import type { CaseId } from "./types.ts";

/**
 * Local-only Fun Gate telemetry. It intentionally contains aggregates and
 * anonymous identifiers, never commands, facts, certificates, or answer text.
 */
export interface TestSessionState {
  schemaVersion: 1;
  sessionId: string;
  testerId: string;
  caseId: CaseId;
  startedAt: string;
  endedAt?: string;
  firstActionAt?: string;
  questionCount: number;
  repeatedQuestionCount: number;
  ambiguityAttempts: number;
  ambiguityRecoveries: number;
  wrongTheoryCount: number;
  hintUseCount: number;
  solved: boolean;
  replayOpened: boolean;
}

export type TestSessionEvent =
  | { type: "start_test_session"; at: string }
  | { type: "record_test_marker"; marker: "first_action" | "question" | "repeat_question" | "ambiguity_attempt" | "ambiguity_recovery" | "wrong_theory" | "hint_used" | "solved" | "replay_opened"; at: string }
  | { type: "end_test_session"; at: string };

export interface TestSessionExport {
  schemaVersion: 1;
  sessionId: string;
  testerId: string;
  caseId: CaseId;
  startedAt: string;
  endedAt?: string;
  firstActionAt?: string;
  durationSeconds?: number;
  firstActionSeconds?: number;
  questionCount: number;
  repeatedQuestionCount: number;
  ambiguityAttempts: number;
  ambiguityRecoveries: number;
  wrongTheoryCount: number;
  hintUseCount: number;
  solved: boolean;
  replayOpened: boolean;
}

export function reduceTestSession(state: TestSessionState, event: TestSessionEvent): TestSessionState {
  if (event.type === "start_test_session") return { ...state, startedAt: event.at, endedAt: undefined };
  if (event.type === "end_test_session") return { ...state, endedAt: event.at };
  const next = { ...state };
  if (!next.firstActionAt && event.marker !== "hint_used") next.firstActionAt = event.at;
  switch (event.marker) {
    case "question": next.questionCount += 1; break;
    case "repeat_question": next.repeatedQuestionCount += 1; break;
    case "ambiguity_attempt": next.ambiguityAttempts += 1; break;
    case "ambiguity_recovery": next.ambiguityRecoveries += 1; break;
    case "wrong_theory": next.wrongTheoryCount += 1; break;
    case "hint_used": next.hintUseCount += 1; break;
    case "solved": next.solved = true; break;
    case "replay_opened": next.replayOpened = true; break;
    case "first_action": break;
  }
  return next;
}

export function toTestSessionExport(state: TestSessionState): TestSessionExport {
  const end = state.endedAt ? Date.parse(state.endedAt) : undefined;
  const start = Date.parse(state.startedAt);
  const first = state.firstActionAt ? Date.parse(state.firstActionAt) : undefined;
  return {
    schemaVersion: 1,
    sessionId: state.sessionId,
    testerId: state.testerId,
    caseId: state.caseId,
    startedAt: state.startedAt,
    ...(state.endedAt ? { endedAt: state.endedAt } : {}),
    ...(state.firstActionAt ? { firstActionAt: state.firstActionAt } : {}),
    ...(end !== undefined && Number.isFinite(end) ? { durationSeconds: Math.max(0, Math.round((end - start) / 1000)) } : {}),
    ...(first !== undefined && Number.isFinite(first) ? { firstActionSeconds: Math.max(0, Math.round((first - start) / 1000)) } : {}),
    questionCount: state.questionCount,
    repeatedQuestionCount: state.repeatedQuestionCount,
    ambiguityAttempts: state.ambiguityAttempts,
    ambiguityRecoveries: state.ambiguityRecoveries,
    wrongTheoryCount: state.wrongTheoryCount,
    hintUseCount: state.hintUseCount,
    solved: state.solved,
    replayOpened: state.replayOpened,
  };
}

export function testSessionCsv(report: TestSessionExport): string {
  const fields = Object.keys(report) as Array<keyof TestSessionExport>;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${fields.join(",")}\n${fields.map((field) => escape(report[field])).join(",")}\n`;
}

