import {readFileSync,writeFileSync} from 'node:fs';
import {MATERIAL_STUDIES} from '../../content/zh/proposals/ts015/material-studies.ts';
import {judgeMaterialStudy} from '../../apps/web/lib/material-study-judge.ts';
import {freshStudyDraft} from '../../apps/web/lib/material-study.ts';
import {hashBytes} from '../../tools/lib/v212-evidence.ts';
const dir='output/content-study-2026-09-07';
const oldIds={c61:'c61-missing-tape-turn',c84:'c84-handoff-after-stop'};
const map:Record<string,string[][]>={c61:[['S02','S03'],['S04'],['S05'],['S04'],['S01','S03'],['S02'],['S02'],['S05'],['S05'],['S05','S06'],['S02','S03']],c84:[['S02'],['S01','S02'],['S05'],['S02'],['S04'],['S01','S02','S04','S05'],[],['S01','S04'],['S02','S03','S06'],['S04'],['S02'],['S01','S02'],['S05'],['S02']]};
const cases=MATERIAL_STUDIES.map(study=>{
  const file=`content/zh/cases/${oldIds[study.id]}.json`,bytes=readFileSync(file),old=JSON.parse(bytes.toString('utf8')),zh=old.localization['zh-CN'];
  const draft={...freshStudyDraft(study),read:study.materials.map(m=>m.id),cited:study.materials.map(m=>m.id),basis:'current',length:'628',balance:'0',scope:'new-starts',counterfactual:'cannot-start',order:study.id==='c84'?['start','stop','complete','audit']:[]};
  const result=judgeMaterialStudy(study.id,study.revision,draft);
  if(!result.supported)throw Error('Proposed proof does not close');
  return{studyId:study.id,revision:study.revision,publicContentDigest:hashBytes(JSON.stringify(study)),base:{id:old.id,path:file,sha256:hashBytes(bytes),truth:old.solutionCertificate.uniquenessClaim,requiredEvidence:old.solutionCertificate.requiredEvidenceIds.length,requiredRelations:old.solutionCertificate.proofObligations.flatMap((o:any)=>o.requiredConnections)},mapping:old.evidenceItems.map((e:any,i:number)=>({oldEvidence:e.id,oldTitle:zh[e.titleKey],oldObservation:zh[e.observationKey],newSources:map[study.id][i],note:study.id==='c84'&&i===6?'章节是编排元数据，不再作为故事中的可证明事实。':study.id==='c61'&&(i===0||i===10)?'新版改为测量有效外径；不能与旧芯径命题共用 canonical 身份。':'按具体内容重写，不能视为原命题的自动迁移。'})),obligations:result.checks,replay:result.replay};
});
writeFileSync(`${dir}/content-audit.json`,JSON.stringify({at:new Date().toISOString(),fictionalAuthoredData:true,baseCasesUnmodified:true,judgeSourceSha256:hashBytes(readFileSync('apps/web/lib/material-study-judge.ts')),cases},null,2));
console.log(JSON.stringify({cases:cases.length,materials:MATERIAL_STUDIES.reduce((n,s)=>n+s.materials.length,0),mappedOldMaterials:cases.reduce((n,c)=>n+c.mapping.length,0)}));
