"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { downloadSaveArchive, readSaveArchive } from "@/lib/archive-io";
import { CASE_SAVE_IDENTITIES } from "@/lib/case-catalog";
import { importCaseSaves, listCaseSaves } from "@/lib/save-store";

export function ArchiveTools({ onImported }: { onImported: () => void }) {
  const [status, setStatus] = useState("存档仅保存在这台设备。导出包不含真相图或证明证书。");
  const inputRef = useRef<HTMLInputElement>(null);
  const [offline, setOffline] = useState<{ done: number; total: number; failed: number }>();
  const [offlineBusy, setOfflineBusy] = useState(false);

  // Ask the service worker to fetch every case into the offline cache.
  const downloadAllCases = () => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      setStatus("离线缓存尚未就绪：请刷新页面一次后再试（本地开发模式不支持离线）。");
      return;
    }
    const channel = new MessageChannel();
    setOfflineBusy(true);
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; done: number; total: number; failed: number };
      setOffline({ done: data.done, total: data.total, failed: data.failed });
      if (data.type === "complete") {
        setOfflineBusy(false);
        setStatus(
          data.failed
            ? `离线下载完成，但有 ${data.failed} 个文件失败；联网后可再试一次。`
            : "全部 84 案已可离线游玩。",
        );
        channel.port1.close();
      }
    };
    controller.postMessage({ type: "CACHE_ALL" }, [channel.port2]);
  };

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
      setStatus(`未导入：${validation.reason}。请选择与当前案件身份兼容的存档包；原有存档未修改。`);
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
      <summary>
        本地存档与备份 <span>可导出全部案件进度</span>
      </summary>
      <div className="archiveToolsBody">
        <p id="archive-status" role="status" aria-live="polite">
          {status}
        </p>
        <div>
          <button type="button" onClick={() => void exportAll()}>
            导出全部存档
          </button>
          <button type="button" onClick={() => inputRef.current?.click()}>
            导入存档包
          </button>
          <button
            type="button"
            onClick={downloadAllCases}
            disabled={offlineBusy}
            aria-describedby="archive-status"
          >
            {offlineBusy && offline
              ? `离线下载中 ${Math.round((offline.done / Math.max(offline.total, 1)) * 100)}%`
              : "下载全部案件以离线游玩"}
          </button>
          <input
            ref={inputRef}
            type="file"
            name="save-archive"
            accept="application/json,.json"
            onChange={(event) => void importFile(event)}
            aria-describedby="archive-status"
          />
        </div>
      </div>
    </details>
  );
}
