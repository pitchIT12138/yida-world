import { frameDocument,validMessage } from '../src/lib/runtime';
import { probeArtifact } from '../src/lib/client';
import { validateArtifact } from '../src/lib/validation';
import type {Answer,AnswerArtifact}from '../src/lib/types';
const candidates=import.meta.glob<{source:Answer['source'];artifact:AnswerArtifact}>('../artifacts/candidates/*.json',{eager:true,import:'default'});
const nav=document.createElement('nav');nav.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
for(const item of Object.values(candidates)){const link=document.createElement('a');link.href='#'+item.source.id;link.textContent=item.source.id;nav.append(link)}
document.querySelector('#results')!.before(nav);
for(const item of Object.values(candidates)){
  const artifact=validateArtifact(item.artifact,item.source);
  const section=document.createElement('section');section.style.cssText='max-width:720px;margin:36px auto;border-bottom:1px solid #bbb;padding-bottom:20px';
  section.id=item.source.id;
  const title=document.createElement('h2');title.textContent=item.source.id;section.append(title);
  const status=document.createElement('p');status.textContent='启动检查中';section.append(status);
  for(const block of artifact.blocks){
    const frame=document.createElement('iframe'),channel=crypto.randomUUID();
    frame.title=block.title;frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='border:0;width:100%;height:'+block.height+'px';frame.srcdoc=frameDocument(block,channel,location.origin);
    const log=document.createElement('p');log.style.cssText='font-size:12px;color:#576653';
    window.addEventListener('message',e=>{if(!validMessage(e,frame.contentWindow,channel,block.id))return;if(e.data.type==='resize'&&typeof e.data.value==='number')frame.style.height=Math.min(1000,Math.max(120,e.data.value))+'px';if(e.data.type==='binding')log.textContent='正文绑定：'+JSON.stringify(e.data.value);if(e.data.type==='error')status.textContent='运行错误：'+String(e.data.value)});
    section.append(frame,log);
  }
  document.querySelector('#results')!.append(section);
  try{await probeArtifact(artifact,new AbortController().signal);status.textContent='启动检查通过'}catch(e){status.textContent='启动检查失败：'+String(e)}
}
