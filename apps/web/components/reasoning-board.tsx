"use client";

import type { GameCommand, ReasoningBoardProjection } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useState } from "react";
import { reasoningBoardUi, REASONING_RELATION_LABELS } from "@/lib/reasoning-board-ui";
import styles from "./reasoning-board.module.css";

function boardTitle(title: string, mode: string) { return title.replace(new RegExp(`\\s*[·•]\\s*${mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "iu"), ""); }

export function ReasoningBoard({ board, dispatch }: { board: ReasoningBoardProjection; dispatch: (command: GameCommand) => void }) {
  const placed = useMemo(() => board.slots.map((slot) => slot.itemId).filter((value): value is string => Boolean(value)), [board.slots]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [fromItemId, setFromItemId] = useState("");
  const [toItemId, setToItemId] = useState("");
  const [relation, setRelation] = useState(board.allowedRelations[0] ?? "causes");
  const eventMap = useMemo(() => new Map(board.items.map((item) => [item.id, item])), [board.items]);
  const ui = reasoningBoardUi(board.mode);
  const direct = ui.direct;

  useEffect(() => {
    if (!board.items.some((item) => item.id === selectedItemId)) setSelectedItemId("");
    if (!board.allowedRelations.includes(relation)) setRelation(board.allowedRelations[0] ?? "causes");
  }, [board.id, board.items, board.allowedRelations, selectedItemId, relation]);

  const placeSelected = (slotId: string) => {
    if (!selectedItemId) return;
    dispatch({ type: "place_reasoning_item", boardId: board.id, slotId, itemId: selectedItemId });
    setSelectedItemId("");
  };
  const moveSlot = (index: number, direction: -1 | 1) => {
    const source = board.slots[index];
    const target = board.slots[index + direction];
    if (!source?.itemId || !target) return;
    if (target.itemId) dispatch({ type: "place_reasoning_item", boardId: board.id, slotId: source.id, itemId: target.itemId });
    else dispatch({ type: "remove_reasoning_item", boardId: board.id, slotId: source.id });
    dispatch({ type: "place_reasoning_item", boardId: board.id, slotId: target.id, itemId: source.itemId });
  };

  return <section className={styles.board} data-reasoning-surface="board" data-mode={board.mode} data-interaction={board.behavior?.interaction} data-direct={direct || undefined} aria-label={`${ui.label}推理板`}>
    <header><div><small>{ui.label}</small><h3>{boardTitle(board.title, board.mode)}</h3></div><b>{placed.length}/{board.slots.length}</b></header>
    <p className={styles.modeGuide}>{ui.guide}</p>

    {direct ? <>
      <div className={styles.itemBank} aria-label="公开事件库"><small>先选择一张事件片</small><div>{board.items.map((item) => <button type="button" key={item.id} aria-pressed={selectedItemId === item.id} data-selected={selectedItemId === item.id || undefined} data-placed={placed.includes(item.id) || undefined} onClick={() => setSelectedItemId((current) => current === item.id ? "" : item.id)}><time>{item.timeLabel}</time><span>{item.label}</span></button>)}</div></div>
      <div className={styles.directSurface} aria-label={`${ui.label}直接操作区`}>
        <div className={styles.modeDiagram} aria-hidden="true"><i /><i /><i /><i /></div>
        {board.mode === "calibration-curve" && <div className={styles.curve} aria-hidden="true"><span>显示</span><i /><b>参考</b></div>}
        {board.mode === "spatial-map" && <div className={styles.compass} aria-hidden="true">N<span>＋</span></div>}
        {board.slots.map((slot, index) => {
          const item = slot.itemId ? eventMap.get(slot.itemId) : undefined;
          return <div className={styles.directSlot} data-filled={Boolean(item) || undefined} data-index={index} key={slot.id}>
            <button type="button" className={styles.slotTarget} disabled={!selectedItemId && !item} onClick={() => selectedItemId ? placeSelected(slot.id) : item && setFromItemId(item.id)} aria-label={`${board.behavior?.slotRoles[index] ?? slot.label}${item ? `，已放置${item.label}` : "，空槽"}`}>
              <small>{String(index + 1).padStart(2, "0")} / {board.behavior?.slotRoles[index] ?? slot.label}</small>
              {item ? <><time>{item.timeLabel}</time><b>{item.label}</b></> : <span>{selectedItemId ? "放置到这里" : "先选择事件片"}</span>}
            </button>
            {item && <div className={styles.slotTools}>
              {board.mode === "timeline" && <><button type="button" disabled={index === 0} onClick={() => moveSlot(index, -1)} aria-label={`${item.label}向前移动`}>←</button><button type="button" disabled={index === board.slots.length - 1} onClick={() => moveSlot(index, 1)} aria-label={`${item.label}向后移动`}>→</button></>}
              <button type="button" onClick={() => dispatch({ type: "remove_reasoning_item", boardId: board.id, slotId: slot.id })} aria-label={`移除${item.label}`}>×</button>
            </div>}
          </div>;
        })}
      </div>
    </> : <div className={styles.slots}>{board.slots.map((slot, index) => <label key={slot.id}><span><i>{String(index + 1).padStart(2, "0")}</i>{board.behavior?.slotRoles[index] ?? slot.label}</span><select value={slot.itemId ?? ""} onChange={(event) => event.target.value ? dispatch({ type: "place_reasoning_item", boardId: board.id, slotId: slot.id, itemId: event.target.value }) : dispatch({ type: "remove_reasoning_item", boardId: board.id, slotId: slot.id })}><option value="">尚未放置</option>{board.items.map((item) => <option key={item.id} value={item.id}>{item.timeLabel} · {item.label}</option>)}</select></label>)}</div>}

    <div className={styles.relations}><small>{direct ? "点击起点和终点，建立一条可验证关系" : "把已放置事件连接成可验证关系"}</small>
      {direct ? <>
        <div className={styles.nodePicker}>{placed.map((id) => <button type="button" key={id} data-from={fromItemId === id || undefined} data-to={toItemId === id || undefined} onClick={() => !fromItemId || fromItemId === id ? (setFromItemId(fromItemId === id ? "" : id), setToItemId("")) : setToItemId(id)}>{eventMap.get(id)?.label ?? id}<small>{fromItemId === id ? "起点" : toItemId === id ? "终点" : "节点"}</small></button>)}</div>
        <div className={styles.relationComposer}><div>{board.allowedRelations.map((value) => <button type="button" key={value} data-selected={relation === value || undefined} onClick={() => setRelation(value)}>{REASONING_RELATION_LABELS[value] ?? value}</button>)}</div><button type="button" className={styles.connect} disabled={!fromItemId || !toItemId || fromItemId === toItemId} onClick={() => { dispatch({ type: "connect_reasoning_items", boardId: board.id, fromItemId, toItemId, relation }); setFromItemId(""); setToItemId(""); }}>连接选中节点</button></div>
      </> : <div><select aria-label="关系起点" value={fromItemId} onChange={(event) => setFromItemId(event.target.value)}><option value="">起点</option>{placed.map((id) => <option key={id} value={id}>{eventMap.get(id)?.label ?? id}</option>)}</select><select aria-label="关系类型" value={relation} onChange={(event) => setRelation(event.target.value)}>{board.allowedRelations.map((value) => <option key={value} value={value}>{REASONING_RELATION_LABELS[value] ?? value}</option>)}</select><select aria-label="关系终点" value={toItemId} onChange={(event) => setToItemId(event.target.value)}><option value="">终点</option>{placed.map((id) => <option key={id} value={id}>{eventMap.get(id)?.label ?? id}</option>)}</select><button type="button" disabled={!fromItemId || !toItemId || fromItemId === toItemId} onClick={() => dispatch({ type: "connect_reasoning_items", boardId: board.id, fromItemId, toItemId, relation })}>连接</button></div>}
      <ol>{board.connections.map((connection, index) => <li key={`${connection.fromItemId}-${connection.toItemId}-${connection.relation}`}><span>{eventMap.get(connection.fromItemId)?.label ?? connection.fromItemId}</span><b>{REASONING_RELATION_LABELS[connection.relation] ?? connection.relation}</b><span>{eventMap.get(connection.toItemId)?.label ?? connection.toItemId}</span><button type="button" aria-label={`移除关系 ${index + 1}`} onClick={() => dispatch({ type: "disconnect_reasoning_items", boardId: board.id, ...connection })}>×</button></li>)}</ol>
    </div>
  </section>;
}
