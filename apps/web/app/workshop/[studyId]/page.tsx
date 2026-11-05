import {notFound} from 'next/navigation';
import {MATERIAL_STUDIES,findMaterialStudy} from '../../../../../content/zh/proposals/ts015/material-studies';
import {MaterialStudyPlayer} from '@/components/material-study-player';
export function generateStaticParams(){return MATERIAL_STUDIES.map(study=>({studyId:study.id}));}
export default async function MaterialStudyPage({params}:{params:Promise<{studyId:string}>}){const {studyId}=await params;const study=findMaterialStudy(studyId);if(!study)notFound();return <MaterialStudyPlayer key={study.id} study={study}/>;}
