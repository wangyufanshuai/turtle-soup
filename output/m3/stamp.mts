import {readFileSync,writeFileSync} from 'node:fs';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const round=process.argv[2]; if(!/^round[1-9]\d*$/.test(round))throw Error('round required');
const source=currentSource(process.cwd()),builtFiles=fileTree(process.cwd(),'apps/web/out');
const report={at:new Date().toISOString(),round,sourceDigest:source.digest,head:source.head,sourceFiles:source.files,buildHash:hashBytes(JSON.stringify(builtFiles)),builtFiles};
writeFileSync(`output/m3/${round}-identity.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({round,sourceDigest:source.digest,buildHash:report.buildHash}));
