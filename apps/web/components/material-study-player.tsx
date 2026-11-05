'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {MaterialStudy} from '../../../content/zh/proposals/ts015/material-studies';
import {freshStudyDraft,restoreStudyDraft,serializeStudyDraft,studyStorageKey,type StudyDraft,type StudyResult} from '../lib/material-study';
import styles from './material-study.module.css';

function focusStart(element:HTMLElement|null){
  element?.focus({preventScroll:true});
  element?.scrollIntoView({block:'start',behavior:'instant'});
}

export function MaterialStudyPlayer({study}:{study:MaterialStudy}){
  const [draft,setDraft]=useState(()=>freshStudyDraft(study));
  const [ready,setReady]=useState(false),[view,setView]=useState<'read'|'proof'>('read');
  const [storageMessage,setStorageMessage]=useState(''),[result,setResult]=useState<StudyResult|null>(null);
  const [pending,setPending]=useState(false),[workerError,setWorkerError]=useState(''),[orderMessage,setOrderMessage]=useState('');
  const workerRef=useRef<Worker|null>(null),requestRef=useRef(0),storageWritableRef=useRef(true),materialRef=useRef<HTMLElement|null>(null),proofRef=useRef<HTMLElement|null>(null),resultRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    try {const raw=localStorage.getItem(studyStorageKey(study));if(raw){const saved=restoreStudyDraft(study,raw);if(saved)setDraft(saved);else {storageWritableRef.current=false;setStorageMessage('这份试玩进度无法读取，当前暂不覆盖原记录。可以继续核对，或用“重新核对”建立新记录。');}}}
    catch{setStorageMessage('本机暂存不可用；可以继续核对，刷新后可能丢失进度。');}
    setReady(true);
    let worker:Worker;
    try {
      worker=new Worker(new URL('../workers/material-study.worker.ts',import.meta.url),{type:'module'});
      workerRef.current=worker;
      worker.onmessage=(event:MessageEvent<{requestId:number;result:StudyResult}>)=>{if(event.data.requestId!==requestRef.current)return;setPending(false);setResult(event.data.result);requestAnimationFrame(()=>focusStart(resultRef.current));};
      worker.onerror=()=>{setPending(false);setWorkerError('材料检验暂时不可用，请刷新后重试。');};
    } catch {setWorkerError('材料检验暂时不可用，请刷新后重试。');}
    return ()=>{workerRef.current?.terminate();workerRef.current=null;};
  },[study]);
  useEffect(()=>{if(!ready||!storageWritableRef.current)return;try{localStorage.setItem(studyStorageKey(study),serializeStudyDraft(study,draft));}catch{setStorageMessage('进度未能写入本机；离开前请保留你的札记。');}},[draft,ready,study]);
  const edit=(patch:Partial<StudyDraft>,proof=true)=>{setDraft(d=>({...d,...patch}));if(proof){requestRef.current++;setPending(false);setResult(null);}};
  const openMaterial=(id:string)=>{edit({selected:id,read:[...new Set([...draft.read,id])]},false);setView('read');requestAnimationFrame(()=>focusStart(materialRef.current));};
  const openProof=()=>{setView('proof');requestAnimationFrame(()=>focusStart(proofRef.current));};
  const cite=(id:string)=>edit({cited:draft.cited.includes(id)?draft.cited.filter(s=>s!==id):[...draft.cited,id]});
  const move=(id:string,direction:-1|1)=>{const next=[...draft.order],index=next.indexOf(id),target=index+direction;if(index<0||target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];edit({order:next});setOrderMessage((study.timeline.find(e=>e.id===id)?.label??id)+'已移到第 '+(target+1)+' 位。');};
  const submit=()=>{if(!workerRef.current||workerError)return;const requestId=++requestRef.current;setPending(true);setResult(null);workerRef.current.postMessage({requestId,studyId:study.id,revision:study.revision,draft});};
  const selected=study.materials.find(m=>m.id===draft.selected),selectedIndex=study.materials.findIndex(m=>m.id===draft.selected);
  const sourceLinks=(ids:string[])=><span className={styles.sourceLinks}>{ids.map(id=><button type="button" key={id} onClick={()=>openMaterial(id)} aria-label={`查看来源 ${id}`}>{id} ↗</button>)}</span>;
  const choices=(name:'basis'|'scope'|'counterfactual',legend:string,options:[string,string][])=> <fieldset className={styles.choiceSet}><legend>{legend}</legend>{options.map(([value,label])=><label key={value}><input type="radio" name={name} value={value} checked={draft[name]===value} onChange={()=>edit({[name]:value})}/><span>{label}</span></label>)}</fieldset>;
  return <main id="main-content" className={styles.page}>
    <header className={styles.header}><Link href="/workshop/">← 改写试玩</Link><span>THE BLACK SOUP / {study.id.toUpperCase()}</span><Link href="/">档案室 ↗</Link></header>
    <section className={styles.hero}><div><small>{study.eyebrow}</small><h1>{study.title}</h1><p>{study.premise}</p><span>材料改写 01 · 进度与原案分开保存</span></div><div className={styles.heroDiagram} aria-hidden="true">{study.id==='c61'?<><div className={styles.reel}><i/><b>1<small>圈</small></b></div><span>圈数改变了。<br/>长度该怎样解释？</span></>:<><div className={styles.signal}><i/><i/><i/></div><span>STOP<br/><small>命令到达之后</small></span></>}</div></section>
    {!ready?<p className={styles.loading}>正在打开独立试玩进度…</p>:<>
      <nav className={styles.workspaceNav} aria-label="改写试玩工作区"><button aria-pressed={view==='read'} onClick={()=>setView('read')}>01 / 读材料 <span>{draft.read.length}/{study.materials.length}</span></button><button aria-pressed={view==='proof'} onClick={openProof}>02 / 核对解释 <span>{draft.cited.length} 份引用</span></button><small>只比较能回到来源的解释</small></nav>
      {storageMessage&&<p role="status" className={styles.notice}>{storageMessage}</p>}
      <div className={styles.workspace}>
        <aside className={styles.materialList} aria-label="本案材料"><small>卷宗目录</small>{study.materials.map(m=><button key={m.id} aria-pressed={draft.selected===m.id&&view==='read'} onClick={()=>openMaterial(m.id)}><b>{m.id}</b><span>{m.title}<small>{draft.cited.includes(m.id)?'已引用':draft.read.includes(m.id)?'已读':'打开检查'}</small></span><i aria-hidden="true">{draft.cited.includes(m.id)?'↗':'·'}</i></button>)}
          <details className={styles.notes}><summary>调查札记</summary><label>只属于这份试玩<textarea aria-label="试玩札记" value={draft.notes} maxLength={6000} placeholder="我注意到……还需要核对……" onChange={e=>edit({notes:e.target.value},false)}/></label></details>
          <details className={styles.restart}><summary>重新核对</summary><p>清空本份改写试玩的输入、阅读与引用；原案进度不受影响。</p><button onClick={()=>{storageWritableRef.current=true;setStorageMessage('');edit(freshStudyDraft(study));setView('read');}}>清空这份试玩</button></details>
        </aside>
        {view==='read'?<div className={styles.readingColumn}>
          <article className={styles.paper} ref={materialRef} tabIndex={-1} aria-label={selected?`材料 ${selected.id} ${selected.title}`:'阅读说明'}>
            {selected?<><header className={styles.paperHeader}><small>{selected.source}</small><b>{selected.id}</b></header><h2>{selected.title}</h2><time>{selected.time}</time><p className={styles.intro}>{selected.intro}</p><dl className={styles.materialRows}>{selected.rows.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><p className={styles.materialNote}>{selected.note}</p><footer className={styles.paperFooter}><span>{draft.cited.includes(selected.id)?'这份材料已放入你的解释。':'读完后，决定它是否支持你的解释。'}</span><button aria-pressed={draft.cited.includes(selected.id)} onClick={()=>cite(selected.id)}>{draft.cited.includes(selected.id)?'移出引用':'引用这份材料'} <span aria-hidden="true">↗</span></button></footer>
              <nav className={styles.readingNav} aria-label="逐份阅读"><button disabled={selectedIndex===0} onClick={()=>openMaterial(study.materials[selectedIndex-1].id)}>← 上一份</button><span>{selectedIndex+1} / {study.materials.length}</span><button disabled={selectedIndex===study.materials.length-1} onClick={()=>openMaterial(study.materials[selectedIndex+1].id)}>下一份 →</button></nav>
            </>:<div className={styles.emptyPaper}><small>先留意一个不一致</small><h2>{study.invitation}</h2><p>材料分别记录了不同的人、设备或时间。先读一份，再决定哪些记录应该放在一起比较。</p><button onClick={()=>openMaterial(study.materials[0].id)}>从第一份材料开始 →</button><span>引用能支撑判断的记录；阅读数量本身不代表证明成立。</span></div>}
          </article>
          <section className={styles.questions}><h2>再核对一个问题</h2><p>每次回答都会指出依据。它不会替你选择解释。</p>{study.questions.map(q=><details key={q.id} open={draft.asked.includes(q.id)} onToggle={e=>{const open=e.currentTarget.open;setDraft(previous=>previous.asked.includes(q.id)===open?previous:{...previous,asked:open?[...previous.asked,q.id]:previous.asked.filter(id=>id!==q.id)});}}><summary>{q.question}</summary><div><b>{q.answer}</b><p>{q.explanation}</p>{sourceLinks(q.sources)}</div></details>)}<button className={styles.primary} onClick={openProof}>材料读得差不多了，核对解释 →</button></section>
        </div>:<section className={styles.proofPanel} ref={proofRef} tabIndex={-1} aria-label="我的材料解释"><header><small>把判断与来源放在一起</small><h2>这能解释眼前的异常吗？</h2><p>填写判断并引用材料。全部填完，只代表可以检查。</p></header>
          <form onSubmit={e=>{e.preventDefault();submit();}}>
            {study.id==='c61'?<>
              {choices('basis','01 / 本次应采用哪种换算依据？',[['old','桌上适用于 100 mm 卷径的旧卡'],['current','与本次卷径相符的当班校准卡'],['fault','把多出的长度都视为计数器故障']])}
              <div className={styles.numberGrid}><label>02 / 一整圈应放出多少毫米？<div><input name="length" aria-label="预计放带长度，毫米" inputMode="decimal" value={draft.length} maxLength={30} onChange={e=>edit({length:e.target.value})}/><span>mm</span></div><small>按校准卡的读数和误差范围填写。</small></label><label>03 / 本次收支差额是多少？<div><input name="balance" aria-label="本次收支差额，毫米" inputMode="decimal" value={draft.balance} maxLength={30} onChange={e=>edit({balance:e.target.value})}/><span>mm</span></div><small>操作前 − 剩余 − 托盘回收。</small></label></div>
            </>:<>
              <fieldset className={styles.orderField}><legend>01 / 按实际先后排列同一笔交接</legend><p>按材料中的事件时间排序；按钮支持键盘操作。</p><ol>{draft.order.map((id,index)=>{const event=study.timeline.find(e=>e.id===id)!;return <li key={id}><b>{String(index+1).padStart(2,'0')}</b><span>{event.label}<small>{event.time} · {event.source}</small></span><div><button type="button" disabled={index===0} aria-label={`前移 ${event.label}`} onClick={()=>move(id,-1)}>↑</button><button type="button" disabled={index===draft.order.length-1} aria-label={`后移 ${event.label}`} onClick={()=>move(id,1)}>↓</button></div></li>;})}</ol><p role="status">{orderMessage}</p></fieldset>
              {choices('scope','02 / 本次停止命令改变了什么？',[['abort','立即中断所有正在执行的交接'],['new-starts','阻止新的启动，等待在途交接完成'],['audit-only','只改变审计页面，执行端未收到命令']])}
              {choices('counterfactual','03 / 若仅将停止接单提前到 20:00:00.060？',[['still-completes','T17 仍会照常开始，并产生完成回执'],['cannot-start','T17 会被阻止启动，不能产生该笔完成回执'],['audit-causes','只要审计页写入，T17 就会完成']])}
            </>}
            <fieldset className={styles.citations}><legend>这些判断引用了哪些材料？</legend><p>先打开材料，再决定是否引用。缺少依据会在检查时指出。</p>{study.materials.map(m=><label key={m.id}><input type="checkbox" checked={draft.cited.includes(m.id)} disabled={!draft.read.includes(m.id)} onChange={()=>cite(m.id)}/><span>{m.id} / {m.title}</span>{!draft.read.includes(m.id)&&<small>尚未读</small>}</label>)}</fieldset>
            {workerError&&<p role="alert" className={styles.notice}>{workerError}</p>}
            <button type="submit" className={styles.primary} disabled={pending||Boolean(workerError)}>{pending?'正在核对材料…':'检验这份解释'}</button>
          </form>
          {result&&<section className={styles.result} data-supported={result.supported} ref={resultRef} tabIndex={-1} aria-label="材料检验结果"><small>{result.supported?'来源已闭合':'再核对一步'}</small><h2>{result.supported?'解释与材料相符':'还有判断缺少支持'}</h2><ul>{result.checks.map(c=><li key={c.id}><b>{c.passed?'✓':'◇'} {c.title}</b><p>{c.message}</p>{sourceLinks(c.sources)}</li>)}</ul>{result.supported&&<><p className={styles.explanation}>{result.explanation}</p><h3>回到事情发生的过程</h3><ol className={styles.replay}>{result.replay?.map((beat,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span><div><p>{beat.text}</p>{sourceLinks(beat.sources)}</div></li>)}</ol><Link className={styles.nextStudy} href={`/workshop/${study.id==='c61'?'c84':'c61'}/`}>打开另一份改写 →</Link><small className={styles.prototypeNote}>这是材料改写的独立核对结果，不计入原案结案或精通记录。</small></>}</section>}
        </section>}
      </div>
    </>}
  </main>;
}
