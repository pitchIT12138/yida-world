import {seedAnswers as seeds} from './seeds';
import {mergeCurated,type CuratedEnvelope} from '../lib/curated';
import type {AnswerSource,SourceAsset} from '../lib/types';
import {validateAssets} from '../lib/archive';
import {realAnswersFirst} from '../lib/answer-order';
export {fromContent} from './seeds';
// Only independently recorded, validated and reviewed artifacts enter this directory.
const saved=import.meta.glob<CuratedEnvelope & {hasSavedMedia:boolean}>('./curated-index/*.json',{eager:true,import:'default'});
const originals=import.meta.env.DEV?import.meta.glob<CuratedEnvelope>('./generated/*.json',{import:'default'}):{};
const pending=new Map<string,Promise<SourceAsset[]>>();
export const seedAnswers=realAnswersFirst(mergeCurated(seeds,Object.values(saved)));
function mediaEntry(source:AnswerSource){return Object.entries(saved).find(([,entry])=>entry.hasSavedMedia&&entry.source.id===source.id&&JSON.stringify(entry.source)===JSON.stringify(source))}
export function hasCuratedMedia(source:AnswerSource){return !!mediaEntry(source)}
// Keep image bytes out of the initial bundle and out of automatic workspace writes.
export async function loadCuratedMedia(source:AnswerSource,urls?:string[]):Promise<SourceAsset[]>{
 const entry=mediaEntry(source);if(!entry)return [];
 const path=entry[0].replace('/curated-index/','/generated/');
 const key=path+(urls?'?'+JSON.stringify(urls):'');
 let request=pending.get(key);
 if(!request){request=import.meta.env.DEV?originals[path]().then(item=>validateAssets(urls?item.assets?.filter(a=>urls.includes(a.url)):item.assets)):fetch('/api/media/'+encodeURIComponent(source.id)+(urls?'?'+new URLSearchParams(urls.map(u=>['url',u])).toString():'')).then(async r=>{if(!r.ok)throw Error('原图暂时无法读取');return validateAssets(await r.json())});pending.set(key,request);request.catch(()=>pending.delete(key))}
 return request;
}
