import type {GenerationInput,AnswerArtifact,GenerationEvent}from '../src/lib/types';
export async function requestGeneration(base:string,input:GenerationInput):Promise<AnswerArtifact>{
  const response=await fetch(base.replace(/\/$/,'')+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(125000)});
  if(!response.ok){const d=await response.json().catch(()=>({error:'HTTP '+response.status}));throw new Error(d.error)}
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',artifact:AnswerArtifact|undefined;
  for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end:number;while((end=buffer.indexOf('\n\n'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+2);for(const line of raw.split('\n')){if(!line.startsWith('data: '))continue;const e:GenerationEvent=JSON.parse(line.slice(6));if(e.type==='error')throw new Error(e.message);if(e.type==='result')artifact=e.artifact;}}}
  if(!artifact)throw new Error('响应中没有完整结果');
  return artifact;
}
export function argument(name:string,fallback=''){const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]||fallback:fallback}
