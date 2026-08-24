import type { TestSessionExport } from "../../packages/mystery-core/src/test-session.ts";

export const FUN_GATE_CASE_ID = "c01-cold-room-knock" as const;

const SESSION_FIELDS = new Set([
  "schemaVersion", "sessionId", "testerId", "caseId", "startedAt", "endedAt", "firstActionAt",
  "durationSeconds", "firstActionSeconds", "questionCount", "repeatedQuestionCount", "ambiguityAttempts",
  "ambiguityRecoveries", "wrongTheoryCount", "hintUseCount", "solved", "replayOpened",
]);

const FORBIDDEN_KEY = /rawquestion|command|fact|event|evidence|solutioncertificate|canonicalhypothesis|answertext|spoiler/i;
const FRICTION_CATEGORIES = new Set(["", "case", "fairness", "language", "interaction", "presentation"]);

export interface FacilitatorObservation {
  batchId: string;
  sessionId: string;
  testerId: string;
  caseId: typeof FUN_GATE_CASE_ID;
  viewport: "desktop" | "mobile";
  answerKnownBeforeSession: boolean;
  understoodQuestionLoop: boolean;
  formedCorrectCausalChain: boolean;
  causalChainSeconds?: number;
  proofSatisfactionPrimary: boolean;
  proofSatisfactionScore: number;
  languageInterruption: boolean;
  irreversibleError: boolean;
  attemptedAlternativeTheory: boolean;
  frictionCategory: "" | "case" | "fairness" | "language" | "interaction" | "presentation";
}

export interface ParsedInput<T> {
  accepted: T[];
  rejected: Array<{ source: string; reasons: string[] }>;
}

export interface FunGateThresholdResult {
  numerator: number;
  denominator: number;
  ratePercent?: number;
  threshold: string;
  passed: boolean;
}

export interface FunGateAggregateReport {
  schemaVersion: 2;
  generatedAt: string;
  source: "local-session-json-plus-facilitator-observations";
  caseId: typeof FUN_GATE_CASE_ID;
  humanParticipants: number;
  sessionCount: number;
  uniqueTesterCount: number;
  solvedRate: number | null;
  solvedWithoutHintRate: number | null;
  replayOpenedRate: number | null;
  ambiguityRecoveryRate: number | null;
  averageSolveSeconds: number | null;
  averageQuestionCount: number | null;
  frictionCounts: Record<string, number>;
  funGate: {
    minimumSessions: 10;
    preferredSessions: 15;
    status: "insufficient-human-sessions" | "incomplete-observations" | "passed" | "failed";
    passed: boolean;
    gates: {
      understoodQuestionLoop: FunGateThresholdResult;
      causalChainInFiveToTwentyMinutes: FunGateThresholdResult;
      solvedFormalProofWithoutHint: FunGateThresholdResult;
      proofSatisfactionPrimary: FunGateThresholdResult;
      languageInterruption: FunGateThresholdResult;
      irreversibleErrors: FunGateThresholdResult;
      alternativeTheoryOrReplay: FunGateThresholdResult;
    };
    note: string;
  };
  inputAudit: {
    sessionFilesFound: number;
    acceptedSessionFiles: number;
    rejectedSessionFiles: number;
    observationRowsFound: number;
    acceptedObservationRows: number;
    rejectedObservationRows: number;
    matchedParticipantCount: number;
    unmatchedSessionCount: number;
    unmatchedObservationCount: number;
    duplicateSessionIdCount: number;
    duplicateTesterIdCount: number;
    onlyC01: boolean;
    rawQuestionOrTruthFieldsAccepted: false;
    allRequiredObservationsPresent: boolean;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(FORBIDDEN_KEY.test(key) ? [`${path}.${key}`] : []),
    ...findForbiddenKeys(child, `${path}.${key}`),
  ]);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function validateSessionExport(value: unknown, _source: string): { value?: TestSessionExport; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRecord(value)) return { reasons: ["session export must be a JSON object"] };
  const forbidden = findForbiddenKeys(value);
  if (forbidden.length) reasons.push(`forbidden or truth-bearing keys: ${forbidden.join(", ")}`);
  const unknown = Object.keys(value).filter((key) => !SESSION_FIELDS.has(key));
  if (unknown.length) reasons.push(`unknown fields: ${unknown.join(", ")}`);
  if (value.schemaVersion !== 1) reasons.push("schemaVersion must be 1");
  if (value.caseId !== FUN_GATE_CASE_ID) reasons.push(`caseId must be ${FUN_GATE_CASE_ID}`);
  if (typeof value.sessionId !== "string" || !/^session-[a-f0-9]{10}$/u.test(value.sessionId)) reasons.push("invalid anonymous sessionId");
  if (typeof value.testerId !== "string" || !/^tester-[a-f0-9]{10}$/u.test(value.testerId)) reasons.push("invalid anonymous testerId");
  if (typeof value.startedAt !== "string" || !Number.isFinite(Date.parse(value.startedAt))) reasons.push("invalid startedAt");
  if (typeof value.endedAt !== "string" || !Number.isFinite(Date.parse(value.endedAt))) reasons.push("endedAt is required for a completed test session export");
  if (!finiteNonNegative(value.durationSeconds)) reasons.push("durationSeconds must be non-negative");
  for (const field of ["questionCount", "repeatedQuestionCount", "ambiguityAttempts", "ambiguityRecoveries", "wrongTheoryCount", "hintUseCount"] as const) {
    if (!Number.isInteger(value[field]) || !finiteNonNegative(value[field])) reasons.push(`${field} must be a non-negative integer`);
  }
  if (typeof value.solved !== "boolean") reasons.push("solved must be boolean");
  if (typeof value.replayOpened !== "boolean") reasons.push("replayOpened must be boolean");
  if (reasons.length) return { reasons };
  return { value: value as unknown as TestSessionExport, reasons };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field.length || row.length) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function parseBinary(value: string, field: string, reasons: string[]): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  reasons.push(`${field} must be 0 or 1`);
  return false;
}

function parseNumber(value: string, field: string, reasons: string[], options: { min: number; max?: number; optional?: boolean }): number | undefined {
  const normalized = value.trim();
  if (!normalized && options.optional) return undefined;
  if (!normalized) {
    reasons.push(`${field} is required`);
    return undefined;
  }
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < options.min || (options.max !== undefined && number > options.max)) {
    reasons.push(`${field} must be a number between ${options.min} and ${options.max ?? "infinity"}`);
    return undefined;
  }
  return number;
}

export const REQUIRED_OBSERVATION_COLUMNS = [
  "batch_id", "session_id", "tester_id", "case_id", "viewport", "answer_known_before_session",
  "understood_question_loop", "formed_correct_causal_chain", "causal_chain_seconds",
  "proof_satisfaction_primary", "proof_satisfaction_score", "language_interruption", "irreversible_error",
  "attempted_alternative_theory", "friction_category", "verbatim_quote",
] as const;

export function parseObservationCsv(text: string): ParsedInput<FacilitatorObservation> & { rowCount: number } {
  const rows = parseCsv(text);
  if (!rows.length) return { accepted: [], rejected: [], rowCount: 0 };
  const headers = rows[0].map((value) => value.trim().replace(/^\uFEFF/u, ""));
  const missing = REQUIRED_OBSERVATION_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) return { accepted: [], rejected: [{ source: "header", reasons: [`missing columns: ${missing.join(", ")}`] }], rowCount: Math.max(0, rows.length - 1) };
  const accepted: FacilitatorObservation[] = [];
  const rejected: Array<{ source: string; reasons: string[] }> = [];
  rows.slice(1).forEach((cells, rowIndex) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
    const reasons: string[] = [];
    if (!/^C01-FG-(0[1-9]|1[0-5])$/u.test(record.batch_id)) reasons.push("invalid batch_id");
    if (!/^session-[a-f0-9]{10}$/u.test(record.session_id)) reasons.push("invalid session_id");
    if (!/^tester-[a-f0-9]{10}$/u.test(record.tester_id)) reasons.push("invalid tester_id");
    if (record.case_id !== FUN_GATE_CASE_ID) reasons.push(`case_id must be ${FUN_GATE_CASE_ID}`);
    if (!new Set(["desktop", "mobile"]).has(record.viewport)) reasons.push("viewport must be desktop or mobile");
    const answerKnownBeforeSession = parseBinary(record.answer_known_before_session, "answer_known_before_session", reasons);
    const understoodQuestionLoop = parseBinary(record.understood_question_loop, "understood_question_loop", reasons);
    const formedCorrectCausalChain = parseBinary(record.formed_correct_causal_chain, "formed_correct_causal_chain", reasons);
    const causalChainSeconds = parseNumber(record.causal_chain_seconds, "causal_chain_seconds", reasons, { min: 0, optional: !formedCorrectCausalChain });
    if (formedCorrectCausalChain && causalChainSeconds === undefined) reasons.push("causal_chain_seconds is required when a correct causal chain was formed");
    const proofSatisfactionPrimary = parseBinary(record.proof_satisfaction_primary, "proof_satisfaction_primary", reasons);
    const proofSatisfactionScore = parseNumber(record.proof_satisfaction_score, "proof_satisfaction_score", reasons, { min: 1, max: 5 });
    const languageInterruption = parseBinary(record.language_interruption, "language_interruption", reasons);
    const irreversibleError = parseBinary(record.irreversible_error, "irreversible_error", reasons);
    const attemptedAlternativeTheory = parseBinary(record.attempted_alternative_theory, "attempted_alternative_theory", reasons);
    if (!FRICTION_CATEGORIES.has(record.friction_category)) reasons.push("invalid friction_category");
    if (answerKnownBeforeSession) reasons.push("tester knew the answer before the session and is ineligible");
    if (reasons.length || proofSatisfactionScore === undefined) {
      rejected.push({ source: `observation row ${rowIndex + 2}`, reasons });
      return;
    }
    accepted.push({
      batchId: record.batch_id,
      sessionId: record.session_id,
      testerId: record.tester_id,
      caseId: FUN_GATE_CASE_ID,
      viewport: record.viewport as "desktop" | "mobile",
      answerKnownBeforeSession,
      understoodQuestionLoop,
      formedCorrectCausalChain,
      ...(causalChainSeconds === undefined ? {} : { causalChainSeconds }),
      proofSatisfactionPrimary,
      proofSatisfactionScore,
      languageInterruption,
      irreversibleError,
      attemptedAlternativeTheory,
      frictionCategory: record.friction_category as FacilitatorObservation["frictionCategory"],
    });
  });
  return { accepted, rejected, rowCount: Math.max(0, rows.length - 1) };
}

function percent(numerator: number, denominator: number): number | undefined {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : undefined;
}

function rateGate(numerator: number, denominator: number, threshold: string, predicate: (ratio: number) => boolean): FunGateThresholdResult {
  const rate = denominator ? numerator / denominator : 0;
  return { numerator, denominator, ...(denominator ? { ratePercent: percent(numerator, denominator) } : {}), threshold, passed: denominator >= 10 && predicate(rate) };
}

function countGate(numerator: number, denominator: number, threshold: string, predicate: (count: number) => boolean): FunGateThresholdResult {
  return { numerator, denominator, threshold, passed: denominator >= 10 && predicate(numerator) };
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function buildFunGateReport(input: {
  sessions: TestSessionExport[];
  observations: FacilitatorObservation[];
  sessionFilesFound: number;
  rejectedSessionFiles: number;
  observationRowsFound: number;
  rejectedObservationRows: number;
  generatedAt?: string;
}): FunGateAggregateReport {
  const sessionIdCounts = new Map<string, number>();
  const testerIdCounts = new Map<string, number>();
  for (const session of input.sessions) {
    sessionIdCounts.set(session.sessionId, (sessionIdCounts.get(session.sessionId) ?? 0) + 1);
    testerIdCounts.set(session.testerId, (testerIdCounts.get(session.testerId) ?? 0) + 1);
  }
  const duplicateSessionIds = new Set([...sessionIdCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const duplicateTesterIds = new Set([...testerIdCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const eligibleSessions = input.sessions.filter((session) => !duplicateSessionIds.has(session.sessionId) && !duplicateTesterIds.has(session.testerId));
  const observationsBySession = new Map(input.observations.map((observation) => [observation.sessionId, observation]));
  const duplicateObservationSessionCount = input.observations.length - observationsBySession.size;
  const matched = eligibleSessions.flatMap((session) => {
    const observation = observationsBySession.get(session.sessionId);
    return observation && observation.testerId === session.testerId ? [{ session, observation }] : [];
  });
  const matchedSessionIds = new Set(matched.map(({ session }) => session.sessionId));
  const unmatchedSessionCount = eligibleSessions.filter((session) => !matchedSessionIds.has(session.sessionId)).length;
  const unmatchedObservationCount = input.observations.filter((observation) => !matchedSessionIds.has(observation.sessionId)).length;
  const denominator = matched.length;
  const understood = matched.filter(({ observation }) => observation.understoodQuestionLoop).length;
  const causalWindow = matched.filter(({ observation }) => observation.formedCorrectCausalChain && observation.causalChainSeconds !== undefined && observation.causalChainSeconds >= 300 && observation.causalChainSeconds <= 1200).length;
  const solvedWithoutHint = matched.filter(({ session }) => session.solved && session.hintUseCount === 0).length;
  const proofSatisfaction = matched.filter(({ observation }) => observation.proofSatisfactionPrimary).length;
  const languageInterruptions = matched.filter(({ observation }) => observation.languageInterruption).length;
  const irreversibleErrors = matched.filter(({ observation }) => observation.irreversibleError).length;
  const alternativeOrReplay = matched.filter(({ session, observation }) => observation.attemptedAlternativeTheory || session.replayOpened).length;
  const gates = {
    understoodQuestionLoop: rateGate(understood, denominator, ">= 80%", (rate) => rate >= 0.8),
    causalChainInFiveToTwentyMinutes: rateGate(causalWindow, denominator, ">= 70%", (rate) => rate >= 0.7),
    solvedFormalProofWithoutHint: rateGate(solvedWithoutHint, denominator, ">= 60%", (rate) => rate >= 0.6),
    proofSatisfactionPrimary: rateGate(proofSatisfaction, denominator, ">= 70%", (rate) => rate >= 0.7),
    languageInterruption: rateGate(languageInterruptions, denominator, "<= 20%", (rate) => rate <= 0.2),
    irreversibleErrors: countGate(irreversibleErrors, denominator, "= 0", (count) => count === 0),
    alternativeTheoryOrReplay: countGate(alternativeOrReplay, denominator, ">= 3 participants", (count) => count >= 3),
  };
  const allRequiredObservationsPresent = input.rejectedSessionFiles === 0
    && input.rejectedObservationRows === 0
    && duplicateSessionIds.size === 0
    && duplicateTesterIds.size === 0
    && duplicateObservationSessionCount === 0
    && unmatchedSessionCount === 0
    && unmatchedObservationCount === 0
    && matched.length === input.sessions.length
    && matched.length === input.observations.length;
  const enough = denominator >= 10;
  const allGatesPassed = Object.values(gates).every((gate) => gate.passed);
  const status = !enough ? "insufficient-human-sessions" : !allRequiredObservationsPresent ? "incomplete-observations" : allGatesPassed ? "passed" : "failed";
  const solved = matched.filter(({ session }) => session.solved);
  const frictionCounts = Object.fromEntries(["case", "fairness", "language", "interaction", "presentation", "none"].map((category) => [category, matched.filter(({ observation }) => (observation.frictionCategory || "none") === category).length]));
  return {
    schemaVersion: 2,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: "local-session-json-plus-facilitator-observations",
    caseId: FUN_GATE_CASE_ID,
    humanParticipants: denominator,
    sessionCount: input.sessions.length,
    uniqueTesterCount: new Set(input.sessions.map((session) => session.testerId)).size,
    solvedRate: percent(solved.length, denominator) ?? null,
    solvedWithoutHintRate: percent(solvedWithoutHint, denominator) ?? null,
    replayOpenedRate: percent(matched.filter(({ session }) => session.replayOpened).length, denominator) ?? null,
    ambiguityRecoveryRate: (() => {
      const attempted = matched.filter(({ session }) => session.ambiguityAttempts > 0);
      return percent(attempted.filter(({ session }) => session.ambiguityRecoveries > 0).length, attempted.length) ?? null;
    })(),
    averageSolveSeconds: average(solved.map(({ session }) => session.durationSeconds ?? 0).filter((value) => value > 0)),
    averageQuestionCount: average(matched.map(({ session }) => session.questionCount)),
    frictionCounts,
    funGate: {
      minimumSessions: 10,
      preferredSessions: 15,
      status,
      passed: status === "passed",
      gates,
      note: denominator < 10
        ? "至少需要 10 位不知道答案的真人测试者及完整主持观察；不得补造缺失会话。"
        : !allRequiredObservationsPresent
          ? "存在缺失、重复或被拒绝的会话/观察记录；修复真实归档后才能判定。"
          : status === "passed"
            ? "所有既定 C01 真人 Fun Gate 门槛已由配对的产品导出与主持观察支持。"
            : "至少一个既定 C01 真人 Fun Gate 门槛未达到；只修订 C01 或共享交互。",
    },
    inputAudit: {
      sessionFilesFound: input.sessionFilesFound,
      acceptedSessionFiles: input.sessions.length,
      rejectedSessionFiles: input.rejectedSessionFiles,
      observationRowsFound: input.observationRowsFound,
      acceptedObservationRows: input.observations.length,
      rejectedObservationRows: input.rejectedObservationRows,
      matchedParticipantCount: denominator,
      unmatchedSessionCount,
      unmatchedObservationCount,
      duplicateSessionIdCount: duplicateSessionIds.size + duplicateObservationSessionCount,
      duplicateTesterIdCount: duplicateTesterIds.size,
      onlyC01: input.sessions.every((session) => session.caseId === FUN_GATE_CASE_ID) && input.observations.every((observation) => observation.caseId === FUN_GATE_CASE_ID),
      rawQuestionOrTruthFieldsAccepted: false,
      allRequiredObservationsPresent,
    },
  };
}
