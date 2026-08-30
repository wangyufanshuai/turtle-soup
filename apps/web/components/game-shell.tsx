"use client";

import type { CaseId } from "@turtle-soup/mystery-core";
import { useEffect, useState } from "react";
import { useMysteryRuntime } from "@/lib/use-mystery-runtime";
import { InvestigationShell } from "./investigation-shell";
import styles from "./investigation-shell.module.css";

export function GameShell({ caseId = "c01-cold-room-knock" }: { caseId?: CaseId }) {
  const runtime = useMysteryRuntime(caseId);
  const [online, setOnline] = useState(true);
  useEffect(() => { const update = () => setOnline(navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);
  if (runtime.status === "error") return <main id="main-content" className={styles.boot}><b>!</b><h1>档案无法打开</h1><p>请刷新页面；其他案件和本地存档不会受到影响。</p></main>;
  if (runtime.status === "loading" || !runtime.projection) return <main id="main-content" className={styles.boot}><b>深</b><p>正在打开案件…</p></main>;
  return <InvestigationShell projection={runtime.projection} events={runtime.events} restoreStatus={runtime.restoreStatus} saveState={runtime.saveState} online={online} latestSave={runtime.latestSave} storageIssue={runtime.storageIssue} onRetrySave={runtime.retrySave} dispatch={runtime.dispatch} prepareQuestionRouting={runtime.prepareQuestionRouting} />;
}
