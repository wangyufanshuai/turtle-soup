import type { CaseId, GameEvent, ProofObligationKind, ReplayMode } from "./types.ts";

export interface LocalDiagnosticSession {
  schemaVersion: 1;
  sessionId: string;
  caseId: CaseId;
  caseVersion: number;
  canonicalHash: string;
  startedAt: string;
  endedAt?: string;
  firstActionMs?: number;
  durationMs?: number;
  questionCount: number;
  repeatedQuestionCount: number;
  ambiguityAttempts: number;
  ambiguityRecoveries: number;
  wrongTheoryCount: number;
  proofFailureCategories: ProofObligationKind[];
  hintUseCount: number;
  solved: boolean;
  replayOpened: boolean;
  replayMode: ReplayMode;
  errorCodes: string[];
}

export interface DiagnosticIdentity { caseId: CaseId; caseVersion: number; canonicalHash: string }

export function newDiagnosticSession(identity: DiagnosticIdentity, sessionId: string, startedAt = new Date().toISOString()): LocalDiagnosticSession {
  return { schemaVersion: 1, sessionId, ...identity, startedAt, questionCount: 0, repeatedQuestionCount: 0, ambiguityAttempts: 0, ambiguityRecoveries: 0, wrongTheoryCount: 0, proofFailureCategories: [], hintUseCount: 0, solved: false, replayOpened: false, replayMode: "standard", errorCodes: [] };
}

function firstAction(session: LocalDiagnosticSession, now: number) {
  if (session.firstActionMs === undefined) session.firstActionMs = Math.max(0, now - Date.parse(session.startedAt));
}

export function reduceDiagnosticSession(session: LocalDiagnosticSession, events: readonly GameEvent[], nowIso = new Date().toISOString()): LocalDiagnosticSession {
  const next: LocalDiagnosticSession = { ...session, proofFailureCategories: [...session.proofFailureCategories], errorCodes: [...session.errorCodes] };
  const now = Date.parse(nowIso);
  for (const event of events) {
    if (event.type === "case_started") continue;
    firstAction(next, Number.isFinite(now) ? now : Date.now());
    if (event.type === "question_answered") {
      next.questionCount += 1;
      if (event.entry.repeated) next.repeatedQuestionCount += 1;
      if (next.ambiguityAttempts > next.ambiguityRecoveries) next.ambiguityRecoveries += 1;
    } else if (event.type === "interpretation_required") next.ambiguityAttempts += 1;
    else if (event.type === "theory_judged") {
      if (event.judgement === "invalidated" || event.judgement === "unfounded") next.wrongTheoryCount += 1;
      if (event.proofFailureCategory && !next.proofFailureCategories.includes(event.proofFailureCategory)) next.proofFailureCategories.push(event.proofFailureCategory);
    } else if (event.type === "case_solved") next.solved = true;
    else if (event.type === "replay_ready") next.replayOpened = true;
    else if (event.type === "replay_mode_started") next.replayMode = event.mode;
    else if (event.type === "command_rejected") {
      if (/存档|worker|资源|加载|本地/i.test(event.message)) next.errorCodes.push("runtime_rejected");
    }
  }
  return next;
}

export function closeDiagnosticSession(session: LocalDiagnosticSession, endedAt = new Date().toISOString()): LocalDiagnosticSession {
  const end = Date.parse(endedAt);
  const start = Date.parse(session.startedAt);
  return { ...session, endedAt, durationMs: Number.isFinite(end) && Number.isFinite(start) ? Math.max(0, end - start) : undefined };
}

export function diagnosticCsv(sessions: readonly LocalDiagnosticSession[]): string {
  const fields: Array<keyof LocalDiagnosticSession> = ["schemaVersion", "sessionId", "caseId", "caseVersion", "canonicalHash", "startedAt", "endedAt", "firstActionMs", "durationMs", "questionCount", "repeatedQuestionCount", "ambiguityAttempts", "ambiguityRecoveries", "wrongTheoryCount", "proofFailureCategories", "hintUseCount", "solved", "replayOpened", "replayMode", "errorCodes"];
  const escape = (value: unknown) => `"${String(Array.isArray(value) ? value.join("|") : value ?? "").replaceAll('"', '""')}"`;
  return `${fields.join(",")}\n${sessions.map((session) => fields.map((field) => escape(session[field])).join(",")).join("\n")}\n`;
}
