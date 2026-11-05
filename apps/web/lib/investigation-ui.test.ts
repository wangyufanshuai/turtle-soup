import assert from "node:assert/strict";
import test from "node:test";
import type {
  GameEvent,
  PlayerProjection,
  ReasoningBoardProjection,
} from "@turtle-soup/mystery-core";
import {
  DEFAULT_EVENT_CHAIN_COPY,
  questionPlaceholder,
  questionRecoverySurface,
  questionStarters,
  shouldPrepareQuestionRecovery,
  validConnectionSelection,
} from "./investigation-ui.ts";

test("question examples are case-public, de-duplicated and do not teach noun templates", () => {
  const scaffolds = [
    "卷盘芯径是否成立？",
    "现场使用过卷盘吗？",
    "现场使用过卷盘吗？",
    "记录有时间标记吗？",
    "按第1种理解？",
    "材料来自同一现场吗？",
  ].map((label, index) => ({
    label,
    queryId: `q-${index}`,
    target: "公开对象",
    predicate: "公开关系",
  })) as PlayerProjection["questionScaffolds"];
  const before = JSON.stringify(scaffolds);
  assert.deepEqual(
    questionStarters(scaffolds).map((item) => item.label),
    ["现场使用过卷盘吗？", "记录有时间标记吗？", "材料来自同一现场吗？"],
  );
  assert.equal(questionPlaceholder(scaffolds), "例如：现场使用过卷盘吗？");
  assert.doesNotMatch(questionPlaceholder([]), /门|锁/u);
  assert.equal(JSON.stringify(scaffolds), before);
});

test("generic event chain never falls back to C01-specific causal roles", () => {
  assert.equal(DEFAULT_EVENT_CHAIN_COPY.title, "我的事件链");
  assert.deepEqual(DEFAULT_EVENT_CHAIN_COPY.roles, ["事件"]);
  assert.doesNotMatch(JSON.stringify(DEFAULT_EVENT_CHAIN_COPY), /敲击|冷藏|锁止|声音|离开/u);
});

test("removed and cross-board connection selections cannot be reused", () => {
  const board = {
    slots: [
      { id: "s1", itemId: "a" },
      { id: "s2", itemId: "b" },
    ],
  } as ReasoningBoardProjection;
  assert.deepEqual(validConnectionSelection(board, "a", "b"), { fromItemId: "a", toItemId: "b" });
  assert.deepEqual(validConnectionSelection(board, "old-board-item", "b"), {
    fromItemId: "",
    toItemId: "",
  });
  assert.deepEqual(validConnectionSelection(board, "a", "removed"), {
    fromItemId: "a",
    toItemId: "",
  });
  assert.deepEqual(validConnectionSelection(board, "a", "a"), { fromItemId: "a", toItemId: "" });
});

test("new question recovery takes precedence over an older saved ambiguity", () => {
  const pending = (rawText: string) => ({
    status: "ambiguous" as const,
    rawText,
    requiresConfirmation: true,
    candidates: [{ label: "公开候选", queryId: "public-q", target: "记录", predicate: "来源" }],
  });
  const a = pending("A"),
    c = pending("C");
  assert.equal(
    questionRecoverySurface(a, undefined),
    "native",
    "refresh has no local attempt and restores saved A",
  );
  assert.equal(
    questionRecoverySurface(a, { rawText: "A", answered: false }, "A"),
    "native",
    "native A is shown exactly once",
  );
  assert.equal(
    questionRecoverySurface(a, { rawText: "B", answered: false }),
    "none",
    "B request must not display stale A while waiting",
  );
  assert.equal(
    questionRecoverySurface(a, { rawText: "B", answered: false }, "B"),
    "offered",
    "A ambiguous then B unknown shows B recovery",
  );
  assert.equal(
    questionRecoverySurface(c, { rawText: "C", answered: false }, "B"),
    "native",
    "B slow AI then C ambiguous shows C only",
  );
  assert.equal(
    questionRecoverySurface(a, { rawText: "C", answered: true }, "B"),
    "none",
    "B slow AI then C matched never resurrects stale offers",
  );
  assert.equal(
    questionRecoverySurface(a, { rawText: "B", answered: false }, "A"),
    "none",
    "an offer must belong to the submitted attempt",
  );
});

test("each repeated unknown submission can prepare recovery while rerenders are deduplicated", () => {
  const first: GameEvent = {
    type: "question_rejected",
    interpretation: {
      status: "unrecognized",
      rawText: "B",
      candidates: [],
      requiresConfirmation: false,
    },
  };
  const second: GameEvent = { ...first, interpretation: { ...first.interpretation } };
  assert.equal(shouldPrepareQuestionRecovery(first, undefined, "standard"), true);
  assert.equal(
    shouldPrepareQuestionRecovery(first, first, "standard"),
    false,
    "a render of the same response does not repeat a request",
  );
  assert.equal(
    shouldPrepareQuestionRecovery(second, first, "standard"),
    true,
    "same text submitted again is a new recovery attempt, AI off or cache hit",
  );
  assert.equal(
    questionRecoverySurface(undefined, { rawText: "B", answered: false }, "B"),
    "offered",
  );
  assert.equal(shouldPrepareQuestionRecovery(second, first, "no-scaffolds"), false);
});
