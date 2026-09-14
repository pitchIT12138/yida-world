import type { AnswerArtifact, GenerationInput, GenerationEvent } from './types';
import { validateArtifact } from './validation';
import { frameDocument, validMessage } from './runtime';
export async function generate(input:GenerationInput,signal:AbortSignal,onStatus:(text:string)=>void):Promise<{artifact:AnswerArtifact;repairTicket?:string}>{
  const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  if(!response.ok){const e=await response.json().catch(()=>({error:'生成服务暂不可用'}));throw new Error(e.error||'生成请求失败')}
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  let buffer='',result:{artifact:AnswerArtifact;repairTicket?:string}|undefined;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      let end:number;
      while((end=buffer.indexOf('\n\n'))>=0){
        const chunk=buffer.slice(0,end);buffer=buffer.slice(end+2);
        for(const line of chunk.split('\n')){
          if(!line.startsWith('data: '))continue;
          const e:GenerationEvent=JSON.parse(line.slice(6));
          if(e.type==='error')throw new Error(e.message);
          if(e.type==='status')onStatus(e.message);
          if(e.type==='result')result={artifact:validateArtifact(e.artifact,input.source),repairTicket:e.repairTicket};
        }
      }
    }
  }finally{reader.releaseLock()}
  if(!result)throw new Error('连接结束时结果仍不完整，上一版保持不变。');
  return result;
}
export async function probeArtifact(artifact:AnswerArtifact,signal:AbortSignal):Promise<void>{
  for(const block of artifact.blocks){
    if(signal.aborted)throw new DOMException('已取消','AbortError');
    await new Promise<void>((resolve,reject)=>{
      const frame=document.createElement('iframe'),channel=crypto.randomUUID();
      frame.title='检查生成结果';frame.setAttribute('sandbox','allow-scripts');
      frame.style.cssText='position:fixed;left:-10000px;top:0;width:700px;height:600px;visibility:hidden;pointer-events:none;';
      let done=false,readyTimer:ReturnType<typeof setTimeout>|undefined;
      const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timeout);clearTimeout(readyTimer);window.removeEventListener('message',receive);signal.removeEventListener('abort',cancel);frame.remove();error?reject(error):resolve()};
      const receive=(event:MessageEvent)=>{if(!validMessage(event,frame.contentWindow,channel,block.id))return;if(event.data.type==='error')finish(new Error(String(event.data.value).slice(0,300)));if(event.data.type==='ready'&&!readyTimer)readyTimer=setTimeout(()=>finish(),650)};
      const cancel=()=>finish(new DOMException('已取消','AbortError'));
      const timeout=setTimeout(()=>finish(new Error('交互块没有完成启动')),8000);
      window.addEventListener('message',receive);signal.addEventListener('abort',cancel,{once:true});
      frame.srcdoc=frameDocument(block,channel,location.origin);document.body.append(frame);
    });
  }
}
export async function generateChecked(input:GenerationInput,signal:AbortSignal,onStatus:(text:string)=>void):Promise<AnswerArtifact>{
  let result=await generate(input,signal,onStatus);
  try{await probeArtifact(result.artifact,signal)}
  catch(e){
    if(signal.aborted||!result.repairTicket)throw e;
    onStatus('运行检查发现问题，正在进行一次修复…');
    result=await generate({...input,repair:{candidate:result.artifact,ticket:result.repairTicket,message:e instanceof Error?e.message:'运行失败'}},signal,onStatus);
    await probeArtifact(result.artifact,signal);
  }
  if(signal.aborted)throw new DOMException('已取消','AbortError');
  return result.artifact;
}
