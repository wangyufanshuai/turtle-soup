/** Prototype-only rule checking. Does not award a frozen case completion or mastery. */
import {findMaterialStudy} from '../../../content/zh/proposals/ts015/material-studies.ts';
import {normalizeStudyDraft,type StudyResult,type StudyCheck} from './material-study.ts';
const numeric=(s:string)=>{const v=s.normalize('NFKC').trim();return /^-?\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;};
export function judgeMaterialStudy(id:string,revision:string,input:unknown):StudyResult {
  const study=findMaterialStudy(id);
  if(!study||study.revision!==revision)return {supported:false,checks:[{id:'version',title:'材料版本',passed:false,message:'这份解释对应的材料版本不一致，请重新打开改写试玩。',sources:[]}]};
  const d=normalizeStudyDraft(study,input),checks:StudyCheck[]=[];
  const check=(key:string,title:string,condition:boolean,sources:string[],good:string,bad:string)=>{
    const cited=sources.every(s=>d.cited.includes(s));
    checks.push({id:key,title,passed:condition&&cited,sources,message:!cited?'为这一步补上可核对的材料来源，再提交检验。':condition?good:bad});
  };
  if(id==='c61'){
    check('basis','当次换算基准',d.basis==='current',['S02','S03'],'使用当次卷径适用的校准记录。','核对今天安装的卷盘，以及两张换算卡各自适用的卷径。');
    check('length','一整圈的放带长度',Number.isFinite(numeric(d.length))&&Math.abs(numeric(d.length)-628)<=1,['S03','S04'],'放带长度与一整圈的校准区间相符。','填写毫米数，并用实际转数与适用校准记录核算；圈数本身不是长度。');
    check('balance','本次材料收支',Number.isFinite(numeric(d.balance))&&Math.abs(numeric(d.balance))<=3,['S05','S06'],'收支差处于测量误差内，没有额外缺失需要解释。','把操作前、剩余和托盘回收放进同一笔收支，保留毫米单位与误差范围。');
  } else {
    check('order','同一笔交接的先后',d.order.join(',')==='start,stop,complete,audit',['S01','S02','S04','S05'],'T17 先启动，随后收到停止，接收端完成后才写入审计。','核对同一交接编号的事件时间；审计写入时间不能替代完成时间。');
    check('scope','停止命令的边界',d.scope==='new-starts',['S02','S03','S06'],'停止阻止新的启动，T18 的拒绝记录验证了这个边界。','把实际按钮的规则与 T18 的结果对照，不要把停止接单当成立即中断。');
    check('counterfactual','只改变停止时刻',d.counterfactual==='cannot-start',['S01','S06'],'若在 20:00:00.060 停止，T17 到达启动时刻时已受阻，不能产生该笔完成回执。','只把停止接单提前到 20:00:00.060，其他条件不变；检查 T17 是否还能开始执行。');
  }
  const supported=checks.every(c=>c.passed);
  return {supported,checks,...(supported?id==='c61'?{
    explanation:'没有第二段神秘消失的胶带。换盘改变了一整圈对应的长度，旧卡仍留在桌上。计数器正确记录了圈数，628 毫米的放出段也完整回收到托盘；这次收支在误差范围内闭合。',
    replay:[{text:'换盘后，平均有效卷径约为 200 mm。旧换算卡只适用于 100 mm。',sources:['S01','S02']},{text:'相机只拍到一整圈；当次校准卡给出一圈 628 ± 1 mm。',sources:['S03','S04']},{text:'5000 − 4372 − 628 = 0 mm；封闭工位记录排除了本次未计入的流出。',sources:['S05','S06']}],
  }:{
    explanation:'停止确实生效了，但它阻止的是新交接启动。T17 已经在途，因此仍完成；接收端回执随后才进入审计页。晚写入的记录反映较早发生的事件，并非审计页触发了交接。',
    replay:[{text:'20:00:00.080，T17 开始执行；20:00:00.100，停止接单生效。',sources:['S01','S02']},{text:'20:00:00.120 的新请求 T18 被拒绝，而已经在途的 T17 继续。',sources:['S03','S06']},{text:'20:00:00.420，接收端产生 R17；20:00:00.900，审计页写入同一个回执。',sources:['S04','S05']}],
  }: {})};
}
