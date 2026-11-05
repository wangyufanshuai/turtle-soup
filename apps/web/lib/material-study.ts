import type { MaterialStudy } from "../../../content/zh/proposals/ts015/material-studies.ts";

export interface StudyDraft {
  read: string[];
  cited: string[];
  asked: string[];
  selected: string | null;
  notes: string;
  basis: string;
  length: string;
  balance: string;
  scope: string;
  counterfactual: string;
  order: string[];
}
export const studyStorageKey = (study: MaterialStudy) =>
  `black-soup:material-study:${study.id}:${study.revision}`;
export function freshStudyDraft(study: MaterialStudy): StudyDraft {
  return {
    read: [],
    cited: [],
    asked: [],
    selected: null,
    notes: "",
    basis: "",
    length: "",
    balance: "",
    scope: "",
    counterfactual: "",
    order: study.timeline.map((e) => e.id),
  };
}
export function normalizeStudyDraft(study: MaterialStudy, input: unknown): StudyDraft {
  const d = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const defaults = freshStudyDraft(study);
  const ids = (value: unknown, allowed: string[]) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id): id is string => typeof id === "string" && allowed.includes(id)),
          ),
        ]
      : [];
  const materials = study.materials.map((m) => m.id),
    questions = study.questions.map((q) => q.id),
    events = study.timeline.map((e) => e.id);
  const read = ids(d.read, materials),
    order = ids(d.order, events);
  const str = (key: string, max: number) =>
    typeof d[key] === "string" ? (d[key] as string).slice(0, max) : "";
  return {
    ...defaults,
    read,
    cited: ids(d.cited, read),
    asked: ids(d.asked, questions),
    selected: typeof d.selected === "string" && materials.includes(d.selected) ? d.selected : null,
    notes: str("notes", 6000),
    basis: str("basis", 40),
    length: str("length", 30),
    balance: str("balance", 30),
    scope: str("scope", 40),
    counterfactual: str("counterfactual", 40),
    order: order.length === events.length ? order : defaults.order,
  };
}
export function serializeStudyDraft(study: MaterialStudy, draft: StudyDraft): string {
  return JSON.stringify({
    kind: "material-study",
    schema: 1,
    studyId: study.id,
    revision: study.revision,
    draft: normalizeStudyDraft(study, draft),
  });
}
export function restoreStudyDraft(study: MaterialStudy, raw: string): StudyDraft | null {
  if (raw.length > 24000) return null;
  try {
    const data = JSON.parse(raw);
    if (
      data?.kind !== "material-study" ||
      data.schema !== 1 ||
      data.studyId !== study.id ||
      data.revision !== study.revision
    )
      return null;
    return normalizeStudyDraft(study, data.draft);
  } catch {
    return null;
  }
}
export interface StudyCheck {
  id: string;
  title: string;
  passed: boolean;
  message: string;
  sources: string[];
}
export interface StudyResult {
  supported: boolean;
  checks: StudyCheck[];
  explanation?: string;
  replay?: { text: string; sources: string[] }[];
}
