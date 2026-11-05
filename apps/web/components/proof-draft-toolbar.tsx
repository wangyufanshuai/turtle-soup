"use client";
import type {GameCommand,PlayerProjection,TheoryDraft,TheoryOptionProjection} from '@turtle-soup/mystery-core';
import styles from './proof-workspace.module.css';

export function ProofDraftToolbar({projection,send,navigate}:{projection:PlayerProjection;send:(command:GameCommand)=>void;navigate:(step:'claim'|'board'|'chain'|'proof'|'evidence',boardId?:string)=>void}) {
  const archive=projection.previousVerifiedProof;
  return <section className={styles.toolbar} aria-label="当前证明草稿">
    <div className={styles.drafts}>{projection.theoryDrafts.map(d=><button type="button" key={d.id} aria-pressed={d.id===projection.activeTheoryId} onClick={()=>send({type:'select_theory',theoryId:d.id})}><b>{d.title}</b><span>{d.eventIds.length} 个事件 · {d.hypothesisId?'已选择解释':'尚未选择'}</span></button>)}</div>
    <div className={styles.undo}><span>每份假设单独保留事件、关系与证据。</span><button type="button" disabled={!projection.canUndoProofEdit} onClick={()=>send({type:'undo_proof_edit',revision:'m3',theoryId:projection.activeTheoryId})}>↶ 撤销上次证明编辑</button></div>
    {projection.proofFeedback && <section className={styles.feedback} aria-label="证明检验反馈"><small>{projection.proofFeedback.stale?'结构已修改 · 再次提交后更新反馈':'这次检验 · 下一步'}</small><p>{projection.proofFeedback.message}</p><button type="button" onClick={()=>navigate(projection.proofFeedback!.nextStep,projection.proofFeedback!.boardId)}>前往核对{({claim:'暂定解释',board:'推理板',chain:'事件链',proof:'证明篮',evidence:'公开材料'} as const)[projection.proofFeedback.nextStep]} →</button></section>}
    {archive && <details className={styles.archive}><summary>此前通过检验的证明 · {archive.theory.title}</summary><p>当前草稿修改后需要重新检验。这里保留此前的结案记录。</p>{archive.theory.note && <blockquote>{archive.theory.note}</blockquote>}<ol>{archive.replay.map(beat=><li key={beat.id}><time>{beat.timeLabel}</time><p>{beat.caption}</p><small>{beat.evidenceTitles.join(' · ')}</small></li>)}</ol></details>}
  </section>;
}

export function ProofMotiveChoices({draft,options,send}:{draft:TheoryDraft;options:TheoryOptionProjection['motiveOptions'];send:(command:GameCommand)=>void}) {
  if(!options.length)return null;
  return <section className={styles.motive} aria-label="驱动条件"><h3>这件事为何会这样发生？</h3><p>选择材料支持的驱动条件，提交时一并检验。</p>{options.map(option=><button type="button" key={option.id} aria-pressed={draft.motiveKey===option.id} aria-label={`驱动条件：${option.label}`} onClick={()=>send({type:'set_theory_motive',theoryId:draft.id,motiveKey:option.id})}>{draft.motiveKey===option.id?'已选择 · ':''}{option.label}</button>)}{draft.motiveKey && <button type="button" className={styles.clearMotive} onClick={()=>send({type:'set_theory_motive',theoryId:draft.id})}>暂不确定驱动条件</button>}</section>;
}
