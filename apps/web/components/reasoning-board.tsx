"use client";

import type {
  GameCommand,
  ProofOperation,
  ReasoningBoardProjection,
  TheoryDraft,
} from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { reasoningBoardUi, REASONING_RELATION_LABELS } from "@/lib/reasoning-board-ui";
import { validConnectionSelection } from "@/lib/investigation-ui";
import styles from "./reasoning-board.module.css";

function boardTitle(title: string, mode: string) {
  return title.replace(
    new RegExp(`\\s*[·•]\\s*${mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "iu"),
    "",
  );
}

export function ReasoningBoard({
  board,
  dispatch,
  theoryId,
}: {
  board: ReasoningBoardProjection;
  dispatch: (command: GameCommand) => void;
  theoryId?: TheoryDraft["id"];
}) {
  const placed = useMemo(
    () => board.slots.map((slot) => slot.itemId).filter((value): value is string => Boolean(value)),
    [board.slots],
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const [fromItemId, setFromItemId] = useState("");
  const [toItemId, setToItemId] = useState("");
  const [relation, setRelation] = useState(board.allowedRelations[0] ?? "causes");
  const [editingRelation, setEditingRelation] = useState<string>();
  const [eventSearch, setEventSearch] = useState("");
  const [bankOpen, setBankOpen] = useState(true);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const visibleItems = board.items.filter((item) =>
    `${item.timeLabel} ${item.label}`.includes(eventSearch.trim()),
  );
  const eventMap = useMemo(
    () => new Map(board.items.map((item) => [item.id, item])),
    [board.items],
  );
  const ui = reasoningBoardUi(board.mode);
  const direct = ui.direct;

  useEffect(() => {
    if (!board.items.some((item) => item.id === selectedItemId)) setSelectedItemId("");
    if (!board.allowedRelations.includes(relation))
      setRelation(board.allowedRelations[0] ?? "causes");
  }, [board.id, board.items, board.allowedRelations, selectedItemId, relation]);
  useEffect(() => {
    const valid = validConnectionSelection(board, fromItemId, toItemId);
    if (valid.fromItemId !== fromItemId) setFromItemId(valid.fromItemId);
    if (valid.toItemId !== toItemId) setToItemId(valid.toItemId);
  }, [board.slots, fromItemId, toItemId]);

  const placeSelected = (slotId: string) => {
    if (!selectedItemId) return;
    dispatch({ type: "place_reasoning_item", boardId: board.id, slotId, itemId: selectedItemId });
    setSelectedItemId("");
  };
  const moveSlot = (index: number, direction: -1 | 1) => {
    const source = board.slots[index];
    const target = board.slots[index + direction];
    if (!source?.itemId || !target) return;
    const operations: ProofOperation[] = [
      target.itemId
        ? {
            type: "place_reasoning_item",
            boardId: board.id,
            slotId: source.id,
            itemId: target.itemId,
          }
        : { type: "remove_reasoning_item", boardId: board.id, slotId: source.id },
      { type: "place_reasoning_item", boardId: board.id, slotId: target.id, itemId: source.itemId },
    ];
    if (theoryId) dispatch({ type: "edit_proof", revision: "m3", theoryId, operations });
    else operations.forEach(dispatch);
  };

  const replaceRelation = (
    connection: ReasoningBoardProjection["connections"][number],
    value: string,
  ) => {
    if (!theoryId) return;
    dispatch({
      type: "edit_proof",
      revision: "m3",
      theoryId,
      operations: [
        { type: "disconnect_reasoning_items", boardId: board.id, ...connection },
        { type: "connect_reasoning_items", boardId: board.id, ...connection, relation: value },
      ],
    });
    setEditingRelation(undefined);
  };

  return (
    <section
      className={styles.board}
      data-reasoning-surface="board"
      data-mode={board.mode}
      data-interaction={board.behavior?.interaction}
      data-direct={direct || undefined}
      aria-label={`${ui.label}推理板`}
    >
      <header>
        <div>
          <h3>{ui.label}</h3>
        </div>
        <b>
          {placed.length}/{board.slots.length} 已放置
        </b>
      </header>
      <details className={styles.boardGuide}>
        <summary>如何组织这张推理板</summary>
        <p className={styles.modeGuide}>{ui.guide}</p>
        {theoryId && (
          <p className={styles.connectionHint}>
            放入事件会同时加入本假设的事件链。时间顺序与这里的关系，需要分别核对。
          </p>
        )}
      </details>

      {direct ? (
        <div className={styles.assembly}>
          <details
            className={styles.eventDrawer}
            open={bankOpen}
            onToggle={(event) => setBankOpen(event.currentTarget.open)}
          >
            <summary>
              公开事件库{" "}
              <span>
                {board.items.length} 张可用 · {placed.length} 张已放置
              </span>
            </summary>
            <div className={styles.itemBank} aria-label="公开事件库">
              <label className={styles.eventSearch}>
                查找事件
                <input
                  ref={searchRef}
                  type="search"
                  value={eventSearch}
                  onChange={(event) => setEventSearch(event.target.value)}
                  placeholder="输入时间或事件关键词"
                />
              </label>
              <small>选择事件，再指定它的位置。</small>
              <div>
                {visibleItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={selectedItemId === item.id}
                    data-selected={selectedItemId === item.id || undefined}
                    data-placed={placed.includes(item.id) || undefined}
                    onClick={() => {
                      const next = selectedItemId === item.id ? "" : item.id;
                      setSelectedItemId(next);
                      if (next && window.matchMedia("(max-width: 700px)").matches) {
                        setBankOpen(false);
                        requestAnimationFrame(() =>
                          surfaceRef.current
                            ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                            ?.focus(),
                        );
                      }
                    }}
                  >
                    <time>{item.timeLabel}</time>
                    <span>{item.label}</span>
                    {placed.includes(item.id) && <small>已放置 · 可重新安排</small>}
                  </button>
                ))}
              </div>
              {visibleItems.length === 0 && (
                <p className={styles.connectionHint}>
                  没有匹配的公开事件。
                  <button type="button" onClick={() => setEventSearch("")}>
                    清除搜索
                  </button>
                </p>
              )}
            </div>
          </details>
          <div className={styles.placementArea}>
            <div className={styles.selectionTray} role="status">
              <span>
                {selectedItemId
                  ? `待放置：${eventMap.get(selectedItemId)?.label}`
                  : "选好事件后，点一个位置放入。"}
              </span>
              {selectedItemId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItemId("");
                    setBankOpen(true);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                >
                  取消选择
                </button>
              )}
              {!bankOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setBankOpen(true);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                >
                  选择另一张事件
                </button>
              )}
            </div>
            <div
              ref={surfaceRef}
              className={styles.directSurface}
              aria-label={`${ui.label}直接操作区`}
            >
              <div className={styles.modeDiagram} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              {board.mode === "calibration-curve" && (
                <div className={styles.curve} aria-hidden="true">
                  <span>显示</span>
                  <i />
                  <b>参考</b>
                </div>
              )}
              {board.mode === "spatial-map" && (
                <div className={styles.compass} aria-hidden="true">
                  N<span>＋</span>
                </div>
              )}
              {board.slots.map((slot, index) => {
                const item = slot.itemId ? eventMap.get(slot.itemId) : undefined;
                return (
                  <div
                    className={styles.directSlot}
                    data-filled={Boolean(item) || undefined}
                    data-index={index}
                    key={slot.id}
                  >
                    <button
                      type="button"
                      className={styles.slotTarget}
                      disabled={!selectedItemId && !item}
                      onClick={() =>
                        selectedItemId ? placeSelected(slot.id) : item && setFromItemId(item.id)
                      }
                      aria-label={`${board.behavior?.slotRoles[index] ?? slot.label}${item ? `，已放置${item.label}` : "，空槽"}`}
                    >
                      <small>
                        {String(index + 1).padStart(2, "0")} /{" "}
                        {board.behavior?.slotRoles[index] ?? slot.label}
                      </small>
                      {item ? (
                        <>
                          <time>{item.timeLabel}</time>
                          <b>{item.label}</b>
                        </>
                      ) : (
                        <span>{selectedItemId ? "放置到这里" : "先选择事件片"}</span>
                      )}
                    </button>
                    {item && (
                      <div className={styles.slotTools}>
                        {board.mode === "timeline" && (
                          <>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveSlot(index, -1)}
                              aria-label={`${item.label}向前移动`}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              disabled={index === board.slots.length - 1}
                              onClick={() => moveSlot(index, 1)}
                              aria-label={`${item.label}向后移动`}
                            >
                              →
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: "remove_reasoning_item",
                              boardId: board.id,
                              slotId: slot.id,
                            })
                          }
                          aria-label={`移除${item.label}`}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.slots}>
          {board.slots.map((slot, index) => (
            <label key={slot.id}>
              <span>
                <i>{String(index + 1).padStart(2, "0")}</i>
                {board.behavior?.slotRoles[index] ?? slot.label}
              </span>
              <select
                value={slot.itemId ?? ""}
                onChange={(event) =>
                  event.target.value
                    ? dispatch({
                        type: "place_reasoning_item",
                        boardId: board.id,
                        slotId: slot.id,
                        itemId: event.target.value,
                      })
                    : dispatch({
                        type: "remove_reasoning_item",
                        boardId: board.id,
                        slotId: slot.id,
                      })
                }
              >
                <option value="">尚未放置</option>
                {board.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.timeLabel} · {item.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className={styles.relations}>
        <small>
          {direct ? "2. 依次点选起点、终点，再选择它们的关系" : "把已放置事件连接成可验证关系"}
        </small>
        {placed.length < 2 && (
          <p className={styles.connectionHint}>先放入至少两张事件片，就可以连接它们。</p>
        )}
        {direct ? (
          <>
            <div className={styles.nodePicker}>
              {placed.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={fromItemId === id || toItemId === id}
                  data-from={fromItemId === id || undefined}
                  data-to={toItemId === id || undefined}
                  onClick={() =>
                    !fromItemId || fromItemId === id
                      ? (setFromItemId(fromItemId === id ? "" : id), setToItemId(""))
                      : setToItemId(id)
                  }
                >
                  {eventMap.get(id)?.label ?? id}
                  <small>{fromItemId === id ? "起点" : toItemId === id ? "终点" : "节点"}</small>
                </button>
              ))}
            </div>
            {fromItemId && (
              <p className={styles.connectionPreview} role="status">
                {eventMap.get(fromItemId)?.label}{" "}
                <b>→ {REASONING_RELATION_LABELS[relation] ?? relation} →</b>{" "}
                {toItemId ? eventMap.get(toItemId)?.label : "请选择终点"}
              </p>
            )}
            <div className={styles.relationComposer}>
              <div>
                {board.allowedRelations.map((value) => (
                  <button
                    type="button"
                    key={value}
                    data-selected={relation === value || undefined}
                    onClick={() => setRelation(value)}
                  >
                    {REASONING_RELATION_LABELS[value] ?? value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.connect}
                disabled={!fromItemId || !toItemId || fromItemId === toItemId}
                onClick={() => {
                  dispatch({
                    type: "connect_reasoning_items",
                    boardId: board.id,
                    fromItemId,
                    toItemId,
                    relation,
                  });
                  setFromItemId("");
                  setToItemId("");
                }}
              >
                连接选中节点
              </button>
            </div>
          </>
        ) : (
          <div>
            <select
              aria-label="关系起点"
              value={fromItemId}
              onChange={(event) => setFromItemId(event.target.value)}
            >
              <option value="">起点</option>
              {placed.map((id) => (
                <option key={id} value={id}>
                  {eventMap.get(id)?.label ?? id}
                </option>
              ))}
            </select>
            <select
              aria-label="关系类型"
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
            >
              {board.allowedRelations.map((value) => (
                <option key={value} value={value}>
                  {REASONING_RELATION_LABELS[value] ?? value}
                </option>
              ))}
            </select>
            <select
              aria-label="关系终点"
              value={toItemId}
              onChange={(event) => setToItemId(event.target.value)}
            >
              <option value="">终点</option>
              {placed.map((id) => (
                <option key={id} value={id}>
                  {eventMap.get(id)?.label ?? id}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!fromItemId || !toItemId || fromItemId === toItemId}
              onClick={() =>
                dispatch({
                  type: "connect_reasoning_items",
                  boardId: board.id,
                  fromItemId,
                  toItemId,
                  relation,
                })
              }
            >
              连接
            </button>
          </div>
        )}
        <ol>
          {board.connections.map((connection, index) => {
            const key = `${connection.fromItemId}-${connection.toItemId}-${connection.relation}`;
            return (
              <li key={key} data-editable={Boolean(theoryId) || undefined}>
                <span>{eventMap.get(connection.fromItemId)?.label ?? connection.fromItemId}</span>
                <b>{REASONING_RELATION_LABELS[connection.relation] ?? connection.relation}</b>
                <span>{eventMap.get(connection.toItemId)?.label ?? connection.toItemId}</span>
                {theoryId ? (
                  <div className={styles.relationActions}>
                    <button
                      type="button"
                      aria-label={`更改关系 ${index + 1}`}
                      onClick={() => setEditingRelation(editingRelation === key ? undefined : key)}
                    >
                      改关系
                    </button>
                    <button
                      type="button"
                      aria-label={`移除关系 ${index + 1}`}
                      onClick={() =>
                        dispatch({
                          type: "disconnect_reasoning_items",
                          boardId: board.id,
                          ...connection,
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`移除关系 ${index + 1}`}
                    onClick={() =>
                      dispatch({
                        type: "disconnect_reasoning_items",
                        boardId: board.id,
                        ...connection,
                      })
                    }
                  >
                    ×
                  </button>
                )}
                {editingRelation === key && (
                  <div
                    className={styles.relationEdit}
                    role="group"
                    aria-label={`关系 ${index + 1} 的类型`}
                  >
                    {board.allowedRelations.map((value) => (
                      <button
                        type="button"
                        key={value}
                        aria-label={`关系 ${index + 1} 改为 ${REASONING_RELATION_LABELS[value] ?? value}`}
                        disabled={value === connection.relation}
                        onClick={() => replaceRelation(connection, value)}
                      >
                        {REASONING_RELATION_LABELS[value] ?? value}
                      </button>
                    ))}
                    <button type="button" onClick={() => setEditingRelation(undefined)}>
                      取消更改
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
