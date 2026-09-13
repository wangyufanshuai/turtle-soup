"use client";

import { useState } from 'react';
import type { GameCommand, TheoryDraft } from '@turtle-soup/mystery-core';
import styles from './investigation-m2.module.css';

/** Keyed by case and draft in the parent; input stays responsive while the Worker saves. */
export function TheoryNote({draft,send}:{draft:TheoryDraft;send:(command:GameCommand)=>void}) {
  const [text,setText]=useState(draft.note??'');
  return <label className={styles.note}>我的暂定解释 · {draft.title}
    <textarea name="tentative-explanation" value={text} maxLength={4000} autoComplete="off"
      placeholder="我目前认为……；支持它的观察是……；还需要排除……"
      onChange={event=>{const value=event.target.value;setText(value);send({type:'set_theory_note',revision:'m2',theoryId:draft.id,text:value});}} />
    <small>随调查存档保存。可以先写自己的想法，再比较下面的解释；文字本身不参与判定。</small>
  </label>;
}
