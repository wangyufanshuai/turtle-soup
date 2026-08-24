"use client";

import type { CaseId, GameEvent, TestSessionExport, TestSessionState } from "@turtle-soup/mystery-core";
import { reduceTestSession, testSessionCsv, toTestSessionExport } from "@turtle-soup/mystery-core";
import { useCallback, useEffect, useRef, useState } from "react";

function randomId(prefix: string): string {
  const bytes = typeof crypto !== "undefined" && "getRandomValues" in crypto ? crypto.getRandomValues(new Uint8Array(5)) : new Uint8Array(5).map(() => Math.floor(Math.random() * 256));
  return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function initialState(caseId: CaseId): TestSessionState {
  const now = new Date().toISOString();
  return { schemaVersion: 1, sessionId: randomId("session"), testerId: randomId("tester"), caseId, startedAt: now, questionCount: 0, repeatedQuestionCount: 0, ambiguityAttempts: 0, ambiguityRecoveries: 0, wrongTheoryCount: 0, hintUseCount: 0, solved: false, replayOpened: false };
}

export function useFunGateSession(caseId: CaseId, events: GameEvent[]) {
  const [session, setSession] = useState<TestSessionState>(() => initialState(caseId));
  const pendingAmbiguity = useRef(false);

  useEffect(() => {
    setSession(initialState(caseId));
    pendingAmbiguity.current = false;
  }, [caseId]);

  useEffect(() => {
    if (events.length === 0) return;
    const at = new Date().toISOString();
    setSession((current) => {
      let next = current;
      for (const event of events) {
        if (event.type === "case_started") continue;
        if (event.type === "question_answered") {
          next = reduceTestSession(next, { type: "record_test_marker", marker: "first_action", at });
          next = reduceTestSession(next, { type: "record_test_marker", marker: "question", at });
          if (event.entry.repeated) next = reduceTestSession(next, { type: "record_test_marker", marker: "repeat_question", at });
          if (pendingAmbiguity.current) {
            next = reduceTestSession(next, { type: "record_test_marker", marker: "ambiguity_recovery", at });
            pendingAmbiguity.current = false;
          }
        } else if (event.type === "interpretation_required") {
          next = reduceTestSession(next, { type: "record_test_marker", marker: "first_action", at });
          next = reduceTestSession(next, { type: "record_test_marker", marker: "ambiguity_attempt", at });
          pendingAmbiguity.current = true;
        } else if (event.type === "theory_judged") {
          next = reduceTestSession(next, { type: "record_test_marker", marker: "first_action", at });
          if (event.judgement === "invalidated" || event.judgement === "unfounded") next = reduceTestSession(next, { type: "record_test_marker", marker: "wrong_theory", at });
        } else if (event.type === "case_solved") {
          next = reduceTestSession(next, { type: "record_test_marker", marker: "solved", at });
        } else if (event.type === "replay_ready") {
          next = reduceTestSession(next, { type: "record_test_marker", marker: "replay_opened", at });
        } else if (event.type === "evidence_updated" || event.type === "location_visited") {
          next = reduceTestSession(next, { type: "record_test_marker", marker: "first_action", at });
        }
      }
      return next;
    });
  }, [events]);

  const markHintUsed = useCallback(() => {
    setSession((current) => reduceTestSession(current, { type: "record_test_marker", marker: "hint_used", at: new Date().toISOString() }));
  }, []);

  const exportSession = useCallback((format: "json" | "csv") => {
    const endedAt = new Date().toISOString();
    const report = toTestSessionExport({ ...session, endedAt });
    const body = format === "json" ? JSON.stringify(report, null, 2) : testSessionCsv(report);
    const blob = new Blob([body], { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `turtle-soup-${caseId}-${report.sessionId}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSession((current) => ({ ...current, endedAt }));
    return report;
  }, [caseId, session]);

  return { session, report: toTestSessionExport(session), markHintUsed, exportSession };
}

export type FunGateReport = TestSessionExport;
