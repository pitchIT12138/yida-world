import {offlineReading} from './offline-reading';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { Answer, AnswerSource, SourceAsset } from './types';
import { escapeHTML, mapMediaHTML, mediaURLs, mediaReference, embeddedURLs, mediaRequirements, EMBEDDED_MEDIA_NOTE } from './rich-source';
import { validateArtifact, validateSource } from './validation';
import { mediaMime } from './media';

const MAX_BYTES=100_000_000,MAX_ASSET=20_000_000;
export function sourceMedia(source:AnswerSource){return [...new Set(source.paragraphs.flatMap(p=>p.html?mediaURLs(p.html):[]))]}
function sourceRequirements(source:AnswerSource){
  const all=new Map<string,Set<string>>();
  for(const p of source.paragraphs)if(p.html)for(const [url,kinds]of mediaRequirements(p.html)){
    const previous=all.get(url);all.set(url,new Set(previous?[...kinds].filter(k=>previous.has(k)):kinds));
  }return all;
}
function matches(requirements:Map<string,Set<string>>,asset:SourceAsset){const kinds=requirements.get(asset.url);return !kinds||kinds.has(asset.mime.split('/')[0])}
export function assetMatchesSource(source:AnswerSource,asset:SourceAsset){return matches(sourceRequirements(source),asset)}
export function missingMedia(answer:Answer){const requirements=sourceRequirements(answer.source),saved=new Set(answer.assets?.filter(a=>matches(requirements,a)).map(a=>a.url));return sourceMedia(answer.source).filter(url=>!saved.has(url))}
export function unresolvedSourceNotes(answer:Answer){
  const embedded=answer.source.paragraphs.flatMap(p=>p.html?embeddedURLs(p.html):[]);
  const missing=new Set(missingMedia(answer));
  const embedsComplete=embedded.length>0&&embedded.every(url=>!missing.has(url));
  return (answer.source.imported?.notes||[]).filter(note=>note!==EMBEDDED_MEDIA_NOTE||!embedsComplete);
}
export function canArchiveCompletely(answer:Answer){return !answer.source.excerpt&&(!answer.source.imported||answer.source.imported.completeness==='confirmed')&&!unresolvedSourceNotes(answer).length&&!missingMedia(answer).length}
export async function sha256(bytes:Uint8Array){const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')}
export function bytesToBase64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)}
export function base64ToBytes(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
export async function assetFromBytes(url:string,bytes:Uint8Array,type:string):Promise<SourceAsset>{
  if(!mediaReference(url)||!bytes.length||bytes.length>MAX_ASSET)throw new Error('媒体地址或大小无效，单个文件最多 20 MB。');
  const mime=mediaMime(bytes,type);if(!mime)throw new Error('文件不是支持的图片、MP4/WebM 视频或音频，请提供原始媒体文件。');
  return {url,mime,data:bytesToBase64(bytes),sha256:await sha256(bytes)};
}
export async function validateAssets(assets:unknown):Promise<SourceAsset[]>{
  if(assets===undefined)return [];
  if(!Array.isArray(assets)||assets.length>500)throw new Error('媒体数量无效');
  let total=0;const urls=new Set<string>();
  for(const a of assets){
    if(!a||typeof a.url!=='string'||!mediaReference(a.url)||urls.has(a.url)||typeof a.data!=='string'||a.data.length>28_000_000)throw new Error('媒体记录无效');
    urls.add(a.url);total+=a.data.length;if(total>MAX_BYTES*1.4)throw new Error('媒体总量超过 100 MB');
    const bytes=base64ToBytes(a.data);if(!bytes.length||bytes.length>MAX_ASSET||mediaMime(bytes,a.mime)!==a.mime||await sha256(bytes)!==a.sha256)throw new Error('媒体文件损坏或校验不一致');
  }return assets;
}
export async function collectMedia(answer:Answer,signal:AbortSignal,onProgress:(done:number,total:number)=>void):Promise<{assets:SourceAsset[];failures:{url:string;message:string}[];cancelled:boolean}>{
  const assets=[...(answer.assets||[])],missing=missingMedia(answer),failures:{url:string;message:string}[]=[];
  const requirements=sourceRequirements(answer.source);
  let done=0,bytes=assets.reduce((n,a)=>n+a.data.length*.75,0);onProgress(0,missing.length);
  // Sequential fetching bounds memory and prevents a single answer flooding the image host.
  for(const url of missing){
    if(signal.aborted)break;
    try{
      if(url.startsWith('urn:yida:media:'))throw new Error('原文未提供文件地址，请补充本地原文件');
      const r=await fetch('/api/import/media?url='+encodeURIComponent(url),{signal});
      if(!r.ok)throw new Error((await r.json()).error||'媒体读取失败');
      const data=new Uint8Array(await r.arrayBuffer());if(bytes+data.length>MAX_BYTES)throw new Error('媒体总量超过 100 MB，请分开保存原始大文件');
      const asset=await assetFromBytes(url,data,(r.headers.get('content-type')||'').split(';')[0]);if(!matches(requirements,asset))throw new Error('媒体文件类型与原文位置不一致，请补充对应原文件');const previous=assets.findIndex(a=>a.url===url);if(previous>=0)assets.splice(previous,1);assets.push(asset);bytes+=data.length;
    }catch(e){if(signal.aborted)break;failures.push({url,message:e instanceof Error?e.message:'读取失败'})}
    onProgress(++done,missing.length);
  }return {assets,failures,cancelled:signal.aborted};
}
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','audio/mpeg':'mp3','audio/ogg':'ogg','audio/wav':'wav'};
export async function createArchive(answer:Answer):Promise<Uint8Array>{
  validateSource(answer.source);await validateAssets(answer.assets);
  if(answer.artifact){validateArtifact(answer.artifact,answer.source);if(await sha256(strToU8(JSON.stringify(answer.source)))!==answer.artifact.provenance.sourceHash)throw new Error('生成产物与原文指纹不一致');}
  if(!canArchiveCompletely(answer))throw new Error('还没有核对全文，或媒体尚未全部保存。可以先导出当前 JSON，补全后再下载完整离线包。');
  const files:Record<string,Uint8Array>={},paths=new Map<string,string>();
  const assets=(answer.assets||[]).filter(a=>sourceMedia(answer.source).includes(a.url)).map(a=>{
    const path='media/'+a.sha256+'.'+extensions[a.mime];files[path]=base64ToBytes(a.data);paths.set(a.url,path);return{url:a.url,mime:a.mime,sha256:a.sha256,path};
  });
  files['answer.json']=strToU8(JSON.stringify({format:'yida-source-archive',version:1,source:answer.source,artifact:answer.artifact,assets},null,2));
  const content=offlineReading(answer,paths);
  files['index.html']=strToU8('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' data: file:; media-src \'self\' file:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; frame-src about:"><title>'+escapeHTML(answer.source.title)+'</title><style>body{max-width:820px;margin:40px auto;padding:0 20px;font:18px/1.8 system-ui,sans-serif;color:#20242b}img,video{max-width:100%;height:auto}pre,table{max-width:100%;overflow:auto}pre{white-space:pre-wrap}blockquote{border-left:3px solid #ddd;padding-left:1em}td,th{border:1px solid #aaa;padding:6px}figcaption{font-size:14px;color:#666}a{overflow-wrap:anywhere}</style></head><body><h1>'+escapeHTML(answer.source.title)+'</h1><p>'+escapeHTML(answer.source.author)+'</p>'+(answer.source.sourceUrl?'<p><a href="'+escapeHTML(answer.source.sourceUrl)+'">原文链接</a></p>':'')+content+'</body></html>');
  files['README.txt']=strToU8('一答一世界 · 原文离线包\n解压后打开 index.html 阅读。图片和支持的媒体已保存到 media 目录，无需联网加载。\n在平台导入本 ZIP 可恢复原文、媒体及随包保存的生成产物。\n全文状态来自导入者核对，平台没有凭链接自动证明上游内容完整性。\n');
  return zipSync(files,{level:0});
}
export async function readArchive(bytes:Uint8Array):Promise<Answer>{
  if(bytes.length>MAX_BYTES+8_000_000)throw new Error('离线包超过 108 MB');
  let total=0,count=0;const entries=unzipSync(bytes,{filter:file=>{
    if(++count>600||file.name.includes('..')||file.name.startsWith('/')||file.name.includes('\\'))throw new Error('离线包路径无效');
    total+=file.originalSize;if(total>MAX_BYTES+8_000_000||file.originalSize>MAX_ASSET+8_000_000)throw new Error('离线包解压大小超限');
    return file.name==='answer.json'||/^media\/[a-f0-9]{64}\.[a-z0-9]+$/.test(file.name);
  }});
  if(!entries['answer.json'])throw new Error('这不是一答一世界离线包');
  const manifest=JSON.parse(strFromU8(entries['answer.json']));
  if(manifest.format!=='yida-source-archive'||manifest.version!==1||!Array.isArray(manifest.assets)||manifest.assets.length>500)throw new Error('离线包格式无效');
  const source=validateSource(manifest.source),assets:SourceAsset[]=[];
  for(const entry of manifest.assets){const data=entries[entry.path];if(!data)throw new Error('离线包缺少媒体文件');assets.push({url:entry.url,mime:entry.mime,sha256:entry.sha256,data:bytesToBase64(data)})}
  await validateAssets(assets);
  const artifact=manifest.artifact?validateArtifact(manifest.artifact,source):undefined;
  if(artifact&&await sha256(strToU8(JSON.stringify(source)))!==artifact.provenance.sourceHash)throw new Error('生成产物与原文指纹不一致');
  const answer:Answer={source,artifact,assets,votes:0,accent:'#658896',tag:'离线导入'};
  if(!canArchiveCompletely(answer))throw new Error('离线包不完整，未覆盖原文中的全部媒体');
  return answer;
}
