"use client";

import type { GameCommand, ReasoningBoardProjection } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useState } from "react";
import styles from "./reasoning-board.module.css";

const MODE_LABELS: Record<string, string> = { "state-trace": "状态转换", "spatial-map": "空间参照", "provenance-chain": "来源保管链", "identity-matrix": "身份矩阵", "measurement-model": "测量基准", "sampling-window": "采样窗口", "aggregate-constraint": "聚合约束", "calibration-curve": "校准曲线", "control-loop": "控制回路", "signal-chain": "信号链", "network-topology": "网络拓扑", "uncertainty-band": "不确定性带", "reference-frame": "参照系", "queue-model": "队列模型", timeline: "时间链" };
const RELATION_LABELS: Record<string, string> = { causes: "导致", precedes: "先于", explains: "解释", "transitions-to": "转换为", synchronizes: "同步于", "moves-to": "移动至", overlaps: "重叠", "transfers-to": "转移至", "recorded-by": "记录于", verifies: "验证", "appears-as": "呈现为", "assigned-to": "分配给", excludes: "排除", "measured-against": "相对测量", corrects: "校正", "sampled-before": "先采样", buffers: "缓冲至", "contributes-to": "计入", "sums-with": "合计", exceeds: "超过", calibrates: "校准", interpolates: "插值", bounds: "界定", commands: "命令", "feeds-back": "反馈", settles: "稳定", propagates: "传播", reconstructs: "重建", "routes-through": "经过路由", deduplicates: "去重", acknowledges: "确认", reframes: "重设参照", projects: "投影", aligns: "对齐", enqueues: "入队", merges: "合并", dequeues: "出队" };
const MODE_GUIDES: Record<string, string> = { "state-trace": "选择事件，再放入触发、保持、复位或观察状态；相邻状态必须由公开证据支持。", "spatial-map": "先固定参照物，再把路径与位置放到对应区域；位置标签不等于真实移动。", "provenance-chain": "沿来源与保管顺序追踪记录，确认每次转移由谁证明。", "identity-matrix": "逐格分开人物、外观、岗位与凭证；同一标签不能替代人物身份。", "measurement-model": "区分真实量、基准和显示值，标出校正关系。", "sampling-window": "排列采集、缓冲与显示窗口，避免把呈现时间当作发生时间。", "aggregate-constraint": "把各分量接入总体约束，检查单项合规是否仍导致总量超限。", "calibration-curve": "把公开事件放到参考点、中段和误差区，再连接校准与插值关系。", "control-loop": "沿命令、反馈和稳定状态追踪控制回路，不把界面状态当成执行结果。", "signal-chain": "从采集端开始逐段放置信号，直接连接缓冲、传输、回放与显示边界。", "network-topology": "把数据包放回路由拓扑，检查去重、确认和重传关系。", "uncertainty-band": "把估计值和不确定性范围一起排列，避免把连续图形当成连续采样。", "reference-frame": "先固定坐标和基准，再比较位置、方向或高度。", "queue-model": "排列进入、合并和离开队列的事件，验证一次输出是否代表多个来源。", timeline: "把事件直接放入时间槽；使用箭头调整先后，再连接关键因果。" };
const DIRECT_MODES = new Set(["timeline", "state-trace", "spatial-map", "provenance-chain", "identity-matrix", "measurement-model", "sampling-window", "aggregate-constraint", "calibration-curve", "control-loop", "signal-chain", "network-topology", "uncertainty-band", "reference-frame", "queue-model"]);

export function ReasoningBoard({ board, dispatch }: { board: ReasoningBoardProjection; dispatch: (command: GameCommand) => void }) {
  const placed = useMemo(() => board.slots.map((slot) => slot.itemId).filter((value): value is string => Boolean(value)), [board.slots]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [fromItemId, setFromItemId] = useState("");
  const [toItemId, setToItemId] = useState("");
  const [relation, setRelation] = useState(board.allowedRelations[0] ?? "causes");
  const eventMap = useMemo(() => new Map(board.items.map((item) => [item.id, item])), [board.items]);
  const direct = DIRECT_MODES.has(board.mode);

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

  return <section className={styles.board} data-reasoning-surface="board" data-mode={board.mode} data-direct={direct || undefined} aria-label={`${MODE_LABELS[board.mode] ?? board.mode}推理板`}>
    <header><div><small>{MODE_LABELS[board.mode] ?? board.mode}</small><h3>{board.title}</h3></div><b>{placed.length}/{board.slots.length}</b></header>
    <p className={styles.modeGuide}>{MODE_GUIDES[board.mode] ?? "把公开事件放入可验证关系。"}</p>

    {direct ? <>
      <div className={styles.itemBank} aria-label="公开事件库"><small>先选择一张事件片</small><div>{board.items.map((item) => <button type="button" key={item.id} aria-pressed={selectedItemId === item.id} data-selected={selectedItemId === item.id || undefined} data-placed={placed.includes(item.id) || undefined} onClick={() => setSelectedItemId((current) => current === item.id ? "" : item.id)}><time>{item.timeLabel}</time><span>{item.label}</span></button>)}</div></div>
      <div className={styles.directSurface} aria-label={`${MODE_LABELS[board.mode] ?? board.mode}直接操作区`}>
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
        <div className={styles.relationComposer}><div>{board.allowedRelations.map((value) => <button type="button" key={value} data-selected={relation === value || undefined} onClick={() => setRelation(value)}>{RELATION_LABELS[value] ?? value}</button>)}</div><button type="button" className={styles.connect} disabled={!fromItemId || !toItemId || fromItemId === toItemId} onClick={() => { dispatch({ type: "connect_reasoning_items", boardId: board.id, fromItemId, toItemId, relation }); setFromItemId(""); setToItemId(""); }}>连接选中节点</button></div>
      </> : <div><select aria-label="关系起点" value={fromItemId} onChange={(event) => setFromItemId(event.target.value)}><option value="">起点</option>{placed.map((id) => <option key={id} value={id}>{eventMap.get(id)?.label ?? id}</option>)}</select><select aria-label="关系类型" value={relation} onChange={(event) => setRelation(event.target.value)}>{board.allowedRelations.map((value) => <option key={value} value={value}>{RELATION_LABELS[value] ?? value}</option>)}</select><select aria-label="关系终点" value={toItemId} onChange={(event) => setToItemId(event.target.value)}><option value="">终点</option>{placed.map((id) => <option key={id} value={id}>{eventMap.get(id)?.label ?? id}</option>)}</select><button type="button" disabled={!fromItemId || !toItemId || fromItemId === toItemId} onClick={() => dispatch({ type: "connect_reasoning_items", boardId: board.id, fromItemId, toItemId, relation })}>连接</button></div>}
      <ol>{board.connections.map((connection, index) => <li key={`${connection.fromItemId}-${connection.toItemId}-${connection.relation}`}><span>{eventMap.get(connection.fromItemId)?.label ?? connection.fromItemId}</span><b>{RELATION_LABELS[connection.relation] ?? connection.relation}</b><span>{eventMap.get(connection.toItemId)?.label ?? connection.toItemId}</span><button type="button" aria-label={`移除关系 ${index + 1}`} onClick={() => dispatch({ type: "disconnect_reasoning_items", boardId: board.id, ...connection })}>×</button></li>)}</ol>
    </div>
  </section>;
}
