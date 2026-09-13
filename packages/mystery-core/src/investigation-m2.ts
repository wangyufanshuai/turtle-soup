import type { CaseFile, RuntimeState } from './types.ts';

/** Presentation policy only. Tentative alternatives are not findings or solution certificates. */
const EXPLANATIONS:Record<string,{ evidence:string[]; labels:Record<string,string> }>={
  'c01-cold-room-knock':{
    evidence:['evidence-door-latch','evidence-knock-recording','evidence-metal-tray-mark'],
    labels:{'hypothesis-canonical':'室内装置在无人时发声','hypothesis-fang-entered':'锁门后有人进入室内发声','hypothesis-guard-faked':'走廊里的声音被当成室内声音'},
  },
  'c03-second-shadow':{
    evidence:['evidence-witness-statement','evidence-costume-rack','evidence-call-sheet'],
    labels:{'hypothesis-canonical':'角色外观被当作罗弈本人','hypothesis-double-actor':'罗弈本人同时出现在两处','hypothesis-unregistered-actor':'有未登记演员参与演出'},
  },
  'c61-missing-tape-turn':{
    evidence:['evidence-c61-01','evidence-c61-02','evidence-c61-03','evidence-c61-05'],
    labels:{'hypothesis-canonical':'圈数与长度使用了不同测量基准','hypothesis-c61-alternative-1':'带材被人剪走了一段','hypothesis-c61-alternative-2':'计数器跳过了一圈'},
  },
  'c84-handoff-after-stop':{
    evidence:['evidence-c84-01','evidence-c84-03','evidence-c84-04','evidence-c84-05'],
    labels:{'hypothesis-canonical':'接收命令、完成交接与审计写入是不同步骤','hypothesis-c84-alternative-1':'停止命令没有生效','hypothesis-c84-alternative-2':'审计记录是事后伪造的'},
  },
};
export const investigationM2=(file:CaseFile,state:RuntimeState)=>file.investigationRevision==='m2'||state.investigationRevision==='m2';
export function explanationPolicy(file:CaseFile,state:RuntimeState) {
  const policy=EXPLANATIONS[file.id];
  const required=policy?.evidence??[];
  const ready=state.solved || (policy ? required.every(id=>['examined','connected','verified','dismissed'].includes(state.evidenceStates[id]??''))
    : file.solutionCertificate.requiredFactIds.length>0&&file.solutionCertificate.requiredFactIds.every(id=>state.game.visibleFactIds.includes(id)));
  return {ready,labels:policy?.labels,remainingEvidenceIds:required.filter(id=>!['examined','connected','verified','dismissed'].includes(state.evidenceStates[id]??''))};
}
