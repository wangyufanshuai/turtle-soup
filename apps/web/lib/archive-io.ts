import {
  createSaveArchive,
  validateSaveArchive,
  type SaveEnvelope,
  type SaveIdentity,
  type SaveValidationResult,
  type SaveArchive,
} from "@turtle-soup/mystery-core";

/** Shared serialized UTF-8 budget: an exported package must be importable unchanged. */
export const MAX_SAVE_ARCHIVE_BYTES = 16 * 1024 * 1024;
const SIZE_ERROR = "存档包超过 16 MiB 字节限制。未创建备份文件；可尝试按案导出。若单案仍超限，请保留本机原档并反馈，不要删除进度。";
const encoder = new TextEncoder();

export function serializeSaveArchive(saves: SaveEnvelope[], exportedAt?: string): string {
  const archive = createSaveArchive(saves, exportedAt);
  const chunks: string[] = [];
  let bytes = 0;
  const append = (chunk: string) => {
    bytes += encoder.encode(chunk).byteLength;
    if (bytes > MAX_SAVE_ARCHIVE_BYTES) throw new Error(SIZE_ERROR);
    chunks.push(chunk);
  };
  const { saves: archiveSaves, ...header } = archive;
  append(`${JSON.stringify(header).slice(0, -1)},"saves":[`);
  for (const [saveIndex, save] of archiveSaves.entries()) {
    if (saveIndex) append(",");
    const { commands, ...identityAndSettings } = save;
    append(`${JSON.stringify(identityAndSettings).slice(0, -1)},"commands":[`);
    for (const [commandIndex, command] of commands.entries()) {
      if (commandIndex) append(",");
      // One bounded command at a time: never allocate a giant complete archive just to reject it.
      append(JSON.stringify(command));
    }
    append("]}");
  }
  append("]}");
  return chunks.join("");
}

export function downloadSaveArchive(saves: SaveEnvelope[], filename = "turtle-soup-saves.json") {
  const serialized = serializeSaveArchive(saves);
  const blob = new Blob([serialized], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser's download handler time to consume the Blob before it
  // is released. Immediate revocation can cancel downloads in webviews.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readSaveArchive(file: File, identities: Readonly<Record<string, SaveIdentity>>): Promise<SaveValidationResult<SaveArchive>> {
  if (file.size > MAX_SAVE_ARCHIVE_BYTES) return { ok: false, code: "invalid", reason: "存档包超过 16 MiB 字节限制；请选择按案拆分的备份文件" };
  try {
    const serialized = await file.text();
    if (encoder.encode(serialized).byteLength > MAX_SAVE_ARCHIVE_BYTES) return { ok: false, code: "invalid", reason: "存档包超过 16 MiB 字节限制" };
    return validateSaveArchive(JSON.parse(serialized) as unknown, identities);
  } catch {
    return { ok: false, code: "invalid", reason: "文件不是有效的 JSON 存档包" };
  }
}
