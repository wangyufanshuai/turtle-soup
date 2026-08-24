"use client";

import type { TestSessionExport } from "@turtle-soup/mystery-core";
import { useState } from "react";

export function FunGateTools({ report, onHint, onExport }: { report: TestSessionExport; onHint: () => void; onExport: (format: "json" | "csv") => void }) {
  const [open, setOpen] = useState(false);
  return <div className="funGateTools" data-open={open || undefined} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button className="funGateButton" onClick={() => setOpen((value) => !value)} aria-expanded={open}>测试模式</button>
    {open && <div className="funGateMenu" role="region" aria-label="Fun Gate 测试工具">
      <strong>本地 Fun Gate</strong>
      <small>匿名 {report.testerId} · {report.questionCount} 问题 · {report.solved ? "已结案" : "进行中"}</small>
      <button onClick={() => { onHint(); setOpen(false); }}>记录一次提示使用</button>
      <div><button onClick={() => onExport("json")}>导出 JSON</button><button onClick={() => onExport("csv")}>导出 CSV</button></div>
      <small>导出只含聚合体验指标，不含真相、事实或证书。</small>
    </div>}
  </div>;
}
