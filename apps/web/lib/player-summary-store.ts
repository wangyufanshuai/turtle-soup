const PREFIX = "black-soup:player-truth:v1:";

export function playerSummaryKey(caseId: string, canonicalHash: string) {
  return `${PREFIX}${caseId}:${canonicalHash}`;
}

export function loadPlayerSummary(caseId: string, canonicalHash: string): string {
  try { return localStorage.getItem(playerSummaryKey(caseId, canonicalHash)) ?? ""; } catch { return ""; }
}

export function savePlayerSummary(caseId: string, canonicalHash: string, text: string) {
  try { localStorage.setItem(playerSummaryKey(caseId, canonicalHash), text.slice(0, 4_000)); } catch { /* optional player note */ }
}
