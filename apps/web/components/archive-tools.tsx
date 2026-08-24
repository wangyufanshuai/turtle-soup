"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { downloadSaveArchive, readSaveArchive } from "@/lib/archive-io";
import { CASE_SAVE_IDENTITIES } from "@/lib/case-catalog";
import { importCaseSaves, listCaseSaves } from "@/lib/save-store";

export function ArchiveTools({ onImported }: { onImported: () => void }) {
  const [status, setStatus] = useState("存档仅保存在这台设备。导出包不含真相图或证明证书。");
  const inputRef = useRef<HTMLInputElement>(null);

  const exportAll = async () => {
    try {
      const saves = await listCaseSaves();
      downloadSaveArchive(saves, `turtle-soup-saves-${new Date().toISOString().slice(0, 10)}.json`);
      setStatus(`已导出 ${saves.length} 个兼容存档。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导出失败，请检查浏览器存储权限。");
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = await readSaveArchive(file, CASE_SAVE_IDENTITIES);
    if (!validation.ok) {
      setStatus(`未导入：${validation.reason}。请选择由当前 v0.9 版本导出的存档包。`);
      event.target.value = "";
      return;
    }
    try {
      await importCaseSaves(validation.value.saves);
      setStatus(`已安全导入 ${validation.value.saves.length} 个存档；刷新案件页即可继续。`);
      onImported();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入失败，请检查浏览器存储权限。");
    }
    event.target.value = "";
  };

  return (
    <details className="archiveTools">
      <summary>存档与版本 <span translate="no">v0.9 SENSORY GOLD</span></summary>
      <div className="archiveToolsBody">
        <p id="archive-status" role="status" aria-live="polite">{status}</p>
        <div>
          <button type="button" onClick={() => void exportAll()}>导出全部存档</button>
          <button type="button" onClick={() => inputRef.current?.click()}>导入存档包</button>
          <input ref={inputRef} type="file" name="save-archive" accept="application/json,.json" onChange={(event) => void importFile(event)} aria-describedby="archive-status" />
        </div>
      </div>
    </details>
  );
}
