import {readFile} from 'node:fs/promises';
import {StudioStore} from '../studio/store';
import {sourceMedia,assetFromBytes} from '../src/lib/archive';
import type {StudioAnswer} from '../studio/types';
const db=new StudioStore('.data/studio.sqlite');
try{const files=JSON.parse(await readFile('.data/source-media/index.json','utf8'));for(const a of await db.list() as StudioAnswer[]){const urls=sourceMedia(a.source),matches=files.filter((f:any)=>urls.includes(f.url)&&f.file);if(!matches.length)continue;const assets=[...(a.assets||[])];for(const f of matches){if(!assets.some(x=>x.url===f.url))assets.push(await assetFromBytes(f.url,new Uint8Array(await readFile(f.file)),f.mime))}if(assets.length!==(a.assets||[]).length){a.assets=assets;await db.saveRecord(a,a.workspace!.revision,'media');console.log(a.source.id+' '+assets.length+' 原媒体已保存')}}}finally{db.close()}
