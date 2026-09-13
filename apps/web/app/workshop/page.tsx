import Link from 'next/link';
import {MATERIAL_STUDIES} from '../../../../content/zh/proposals/ts015/material-studies';
import styles from '@/components/material-study.module.css';
export default function WorkshopPage(){return <main id="main-content" className={styles.page}>
  <header className={styles.header}><Link href="/">← 档案室</Link><span>THE BLACK SOUP / 改写试玩</span></header>
  <section className={styles.landing}><small>重新检查那些说不通的事</small><h1>真相，要有迹可循。</h1><p>两份独立的材料改写。读记录、核对问题，再用来源支持你的解释。试玩进度与原案分开保存。</p>
  <div className={styles.studyCards}>{MATERIAL_STUDIES.map(study=><Link href={`/workshop/${study.id}/`} key={study.id}><small>{study.id.toUpperCase()} · 材料改写 01</small><div className={styles.cardMark} aria-hidden="true">{study.id==='c61'?'◉':'↳'}</div><h2>{study.title}</h2><p>{study.eyebrow}</p><span>打开材料 →</span></Link>)}</div></section>
</main>;}
