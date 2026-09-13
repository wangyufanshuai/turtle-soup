"use client";

import type { SaveEnvelope } from "@turtle-soup/mystery-core";
import { useState } from "react";
import { downloadSaveArchive } from "@/lib/archive-io";

export function StorageRecovery({ issue, save, blocked = false, onRetry, onRestart }: { issue?: string; save?: SaveEnvelope; blocked?: boolean; onRetry: () => void; onRestart?: () => void }) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportBackup = () => {
    if (!save) return;
    try { downloadSaveArchive([save], `${save.caseId}-backup.json`); setExportError(""); }
    catch { setExportError("无法生成备份：存档超过导出大小限制或浏览器拒绝下载。原存档未修改，请暂勿重新开始。"); }
  };
  if (!issue) return null;
  return (
    <section className="storageRecovery" role="alert" aria-labelledby="storage-recovery-title">
      <div><strong id="storage-recovery-title">本地保存需要处理</strong><p>{issue}</p>{blocked && !save && <p>原数据仍保留在本机，但本版本无法生成可验证的备份。为防止丢失，暂不开放覆盖原档的重新开始。</p>}{exportError && <p role="status">{exportError}</p>}</div>
      <div>
        {!blocked && <button type="button" onClick={onRetry}>重新尝试保存</button>}
        <button type="button" disabled={!save} onClick={exportBackup}>{blocked ? "导出原存档备份" : "导出当前进度"}</button>
        {blocked && onRestart && (!confirmRestart ? <button type="button" disabled={!save} onClick={() => setConfirmRestart(true)}>重新开始本案…</button> : <div className="storageRestartConfirm"><p>重新开始会用空白调查替换本案当前存档。建议先导出上面的原档备份；其他案件不受影响。</p><button type="button" onClick={() => { setConfirmRestart(false); onRestart(); }}>确认重新开始本案</button><button type="button" onClick={() => setConfirmRestart(false)}>取消，保留原档</button></div>)}
      </div>
    </section>
  );
}
