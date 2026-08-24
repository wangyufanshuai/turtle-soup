"use client";

import type { SaveEnvelope } from "@turtle-soup/mystery-core";
import { downloadSaveArchive } from "@/lib/archive-io";

export function StorageRecovery({ issue, save, onRetry }: { issue?: string; save?: SaveEnvelope; onRetry: () => void }) {
  if (!issue) return null;
  return (
    <section className="storageRecovery" role="alert" aria-labelledby="storage-recovery-title">
      <div><strong id="storage-recovery-title">本地保存需要处理</strong><p>{issue}</p></div>
      <div>
        <button type="button" onClick={onRetry}>重新尝试保存</button>
        <button type="button" disabled={!save} onClick={() => save && downloadSaveArchive([save], `${save.caseId}-backup.json`)}>导出当前进度</button>
      </div>
    </section>
  );
}
