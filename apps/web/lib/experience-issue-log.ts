import type { AiAssistErrorCode, CaseId } from "@turtle-soup/mystery-core";

export interface ExperienceIssueRecord {
  id: string;
  at: string;
  caseId: CaseId;
  rawQuestion: string;
  path: "unrecognized" | "ambiguous" | "undone";
  aiRecovered: boolean;
  confirmed: boolean;
  errorCode?: AiAssistErrorCode;
}

export function experienceIssuesCsv(records: ExperienceIssueRecord[]): string {
  const fields: Array<keyof ExperienceIssueRecord> = ["id", "at", "caseId", "rawQuestion", "path", "aiRecovered", "confirmed", "errorCode"];
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${fields.join(",")}\n${records.map((record) => fields.map((field) => cell(record[field])).join(",")).join("\n")}\n`;
}

export function downloadExperienceIssues(records: ExperienceIssueRecord[], format: "json" | "csv") {
  const contents = format === "json" ? `${JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records }, null, 2)}\n` : experienceIssuesCsv(records);
  const blob = new Blob([contents], { type: format === "json" ? "application/json" : "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `turtle-soup-experience-issues.${format}`; anchor.click(); URL.revokeObjectURL(url);
}
