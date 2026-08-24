import type { CaseId } from "@turtle-soup/mystery-core";
import { CASE_CATALOG, CASE_SAVE_IDENTITIES, RELEASE_PROFILE } from "@/.generated/public-catalog";

export { CASE_CATALOG, CASE_SAVE_IDENTITIES, RELEASE_PROFILE };

export function isCaseId(value: string): value is CaseId {
  return CASE_CATALOG.some((entry) => entry.id === value);
}
