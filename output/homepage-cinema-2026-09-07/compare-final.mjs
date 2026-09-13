import sharp from 'sharp';
import {mkdirSync} from 'node:fs';
const p='output/homepage-cinema-2026-09-07';
mkdirSync(p+'/comparisons',{recursive:true});
const source=await sharp(p+'/concepts/01-corridor.png').resize(1487,1058).toBuffer();
const result=await sharp(p+'/screenshots/home-1487x1058-final.png').resize(1487,1058).toBuffer();
await sharp({create:{width:2994,height:1058,channels:3,background:'#19212a'}}).composite([{input:source,left:0,top:0},{input:result,left:1507,top:0}]).png().toFile(p+'/comparisons/source-vs-final-full.png');
for(const [name,region] of [['hero',{left:45,top:170,width:530,height:525}],['posters',{left:55,top:750,width:1380,height:295}]]){
 const a=await sharp(source).extract(region).toBuffer(),b=await sharp(result).extract(region).toBuffer();
 await sharp({create:{width:region.width*2+20,height:region.height,channels:3,background:'#19212a'}}).composite([{input:a,left:0,top:0},{input:b,left:region.width+20,top:0}]).png().toFile(p+'/comparisons/source-vs-final-'+name+'.png');
}

