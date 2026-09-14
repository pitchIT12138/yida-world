import type { AnswerArtifact, GenerationInput, GenerationEvent } from './types';
import { validateArtifact } from './validation';
import { frameDocument, validMessage } from './runtime';
// Two independent read paths observe one task. Polling never resubmits generation.
export async function generate(input:GenerationInput,signal:AbortSignal,onStatus:(text:string)=>void,timeoutMs=300000):Promise<{artifact:AnswerArtifact;repairTicket?:string}>{
 const connection=new AbortController(),requestId=crypto.randomUUID(),started=Date.now();
 let runId:string|undefined=input.repair?undefined:requestId,lastContact=started,seen=false,lastMessage='正在连接生成服务…',polling=false,streamError:Error|undefined;
 const budget=Math.min(600000,Math.max(1000,timeoutMs))+15000;
 return new Promise((resolve,reject)=>{
  let finished=false;
  const finish=(error?:Error,result?:{artifact:AnswerArtifact;repairTicket?:string})=>{if(finished)return;finished=true;clearInterval(watch);clearInterval(poll);signal.removeEventListener('abort',cancel);connection.abort();error?reject(error):resolve(result!)};
  const cancel=()=>finish(new DOMException('已取消','AbortError'));
  const receive=(event:GenerationEvent)=>{
   if(finished)return;lastContact=Date.now();seen=true;
   if(event.type==='error')return finish(new Error(event.message));
   if(event.type==='status'){lastMessage=event.message;onStatus(lastMessage+' · 已用时 '+Math.floor((Date.now()-started)/1000)+' 秒');}
   if(event.type==='result'){try{finish(undefined,{artifact:validateArtifact(event.artifact,input.source),repairTicket:event.repairTicket})}catch(e){finish(e instanceof Error?e:new Error('生成结果校验失败'))}}
  };
  const check=async()=>{
   if(finished||polling||!runId)return;polling=true;
   try{
    const r=await fetch('/api/generation/'+encodeURIComponent(runId)+'?requestId='+requestId,{signal:AbortSignal.any([connection.signal,AbortSignal.timeout(8000)]),cache:'no-store'});
    if(r.status===401){finish(new Error('登录已过期，请重新登录；原文和已保存作品仍然保留。'));return;}
    if(!r.ok)return;
    const snapshot=await r.json();
    if(snapshot.runId!==runId||snapshot.requestId!==requestId)return;
    // A responsive HTTP endpoint alone does not prove the generation task is alive.
    if(snapshot.event.type==='status'&&Date.now()-snapshot.updatedAt>25000)return;
    receive(snapshot.event);
   }catch{/* The stream may still be healthy; the watchdog measures both paths. */}finally{polling=false}
  };
  const watch=setInterval(()=>{
   if(Date.now()-started>budget)return finish(new Error('生成超过最长等待时间，原文与上一版已保留。请查看任务结果后再决定是否重新生成。'));
   if(Date.now()-lastContact>(seen?30000:20000))return finish(new Error(streamError?.message|| (seen?'超过 30 秒没有收到任务状态，连接可能中断；原文与上一版已保留。':'20 秒内未收到生成服务确认，请检查网络后重试；原文已保留。')));
   if(!seen)onStatus('正在确认生成请求是否已接收… 已等待 '+Math.floor((Date.now()-started)/1000)+' 秒');
   else onStatus(lastMessage+' · 已用时 '+Math.floor((Date.now()-started)/1000)+' 秒'+(Date.now()-lastContact>10000?' · 正在重新核实任务状态…':''));
  },1000);
  const poll=setInterval(()=>void check(),5000);
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  void(async()=>{
   let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
   try{
    const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','X-Generation-Request':requestId},body:JSON.stringify(input),signal:connection.signal});
    if(!response.ok){const e=await response.json().catch(()=>({error:'生成服务暂不可用（HTTP '+response.status+'）'}));finish(new Error(e.error||'生成请求失败'));return;}
    runId=response.headers.get('X-Generation-Run-Id')||runId;
    if(!response.body)throw new Error('生成服务未返回进度连接');
    reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
    for(;;){
     const {done,value}=await reader.read();if(done)break;
     buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');let end:number;
     while((end=buffer.indexOf('\n\n'))>=0){
      const chunk=buffer.slice(0,end);buffer=buffer.slice(end+2);
      for(const line of chunk.split('\n'))if(line.startsWith('data:'))receive(JSON.parse(line.slice(5).trim()));
      if(finished)return;
     }
     if(buffer.length>2000000)throw new Error('生成进度数据超出限制');
    }
    if(!finished){streamError=new Error('实时连接已结束且结果未完整收到，请保留原文；后台状态查询也未取得结果。');void check()}
   }catch(e){if(!finished){streamError=new Error(e instanceof Error?e.message:'生成连接中断');void check()}}
   finally{reader?.releaseLock()}
  })();
 });
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
export async function generateChecked(input:GenerationInput,signal:AbortSignal,onStatus:(text:string)=>void,timeoutMs=300000):Promise<AnswerArtifact>{
  let result=await generate(input,signal,onStatus,timeoutMs);
  try{await probeArtifact(result.artifact,signal)}
  catch(e){
    if(signal.aborted||!result.repairTicket)throw e;
    onStatus('运行检查发现问题，正在进行一次修复…');
    result=await generate({...input,repair:{candidate:result.artifact,ticket:result.repairTicket,message:e instanceof Error?e.message:'运行失败'}},signal,onStatus,timeoutMs);
    await probeArtifact(result.artifact,signal);
  }
  if(signal.aborted)throw new DOMException('已取消','AbortError');
  return result.artifact;
}
