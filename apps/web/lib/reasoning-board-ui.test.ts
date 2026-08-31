import assert from "node:assert/strict";
import test from "node:test";
import { REASONING_BOARD_MODES, REASONING_BOARD_UI, REASONING_RELATION_LABELS } from "./reasoning-board-ui.ts";

test("every reasoning board has a localized direct interaction contract", () => {
  assert.equal(REASONING_BOARD_MODES.length, 23);
  assert.equal(new Set(REASONING_BOARD_MODES).size, REASONING_BOARD_MODES.length);
  for (const mode of REASONING_BOARD_MODES) {
    const contract = REASONING_BOARD_UI[mode];
    assert.ok(contract.label.length >= 3, `${mode} label`);
    assert.ok(contract.guide.length >= 18, `${mode} guide`);
    assert.equal(contract.direct, true, `${mode} direct interaction`);
  }
});

test("Season 5 relation verbs are localized instead of leaking protocol English", () => {
  for (const relation of ["triggers", "flows-in", "retains", "flows-out", "reaches", "crosses", "holds", "sees", "occludes", "reveals", "propagates-to", "reflects-at", "arrives-at", "ends-at", "if", "otherwise", "enters", "bounded-by", "backs-up"]) {
    assert.ok(REASONING_RELATION_LABELS[relation], relation);
    assert.doesNotMatch(REASONING_RELATION_LABELS[relation], /^[a-z-]+$/u);
  }
});
