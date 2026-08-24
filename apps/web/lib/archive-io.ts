import {
  createSaveArchive,
  validateSaveArchive,
  type SaveEnvelope,
  type SaveIdentity,
  type SaveValidationResult,
  type SaveArchive,
} from "@turtle-soup/mystery-core";

export function downloadSaveArchive(saves: SaveEnvelope[], filename = "turtle-soup-saves.json") {
  const archive = createSaveArchive(saves);
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readSaveArchive(file: File, identities: Readonly<Record<string, SaveIdentity>>): Promise<SaveValidationResult<SaveArchive>> {
  if (file.size > 5 * 1024 * 1024) return { ok: false, code: "invalid", reason: "存档包超过 5 MB 限制" };
  try {
    return validateSaveArchive(JSON.parse(await file.text()) as unknown, identities);
  } catch {
    return { ok: false, code: "invalid", reason: "文件不是有效的 JSON 存档包" };
  }
}
