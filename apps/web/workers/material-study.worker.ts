import {judgeMaterialStudy} from '../lib/material-study-judge.ts';
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=(event:MessageEvent)=>{
  const request=event.data;
  if(!request||!Number.isSafeInteger(request.requestId))return;
  scope.postMessage({requestId:request.requestId,result:judgeMaterialStudy(request.studyId,request.revision,request.draft)});
};
