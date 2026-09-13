import {writeFileSync} from 'node:fs';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const phase=process.argv[2];if(!['preview','final','delivery'].includes(phase))throw Error('Phase required');
const source=currentSource(process.cwd()),files=fileTree(process.cwd(),'apps/web/out');
const report={at:new Date().toISOString(),phase,sourceDigest:source.digest,buildHash:hashBytes(JSON.stringify(files)),sourceFiles:source.files,files};
writeFileSync(`output/content-study-2026-09-07/${phase}-identity.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({phase,sourceDigest:report.sourceDigest,buildHash:report.buildHash}));
