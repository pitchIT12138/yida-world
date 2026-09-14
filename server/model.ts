import type {CloudBindings} from './cloud';
export type RuntimeEnv = { [key:string]: any } & CloudBindings & { ASSETS?: any; WORKSPACE_STORE?: any };
export type ModelProfile = { base: string; key: string; model: string; provider: string; reasoningEffort?:'none'|'low'|'high'|'max' };
export function profile(env: RuntimeEnv, tier: string): ModelProfile | undefined {
  const prefix=tier==='frontier'?'FRONTIER':'BALANCED';
  const base=env[prefix+'_API_BASE'],key=env[prefix+'_API_KEY'],model=env[prefix+'_MODEL'];
  if(!base || !key || !model) return;
  let u:URL;try{u=new URL(base)}catch{return}
  if(u.protocol!=='https:' && !(env.ALLOW_LOCAL_MODEL==='true' && ['localhost','127.0.0.1'].includes(u.hostname))) return;
  const provider=env[prefix+'_PROVIDER']||'openai-compatible',effort=env[prefix+'_REASONING_EFFORT'];
  const reasoningEffort=provider!=='anthropic'&&['none','low','high','max'].includes(effort||'')?effort as ModelProfile['reasoningEffort']:undefined;
  return {base:base.replace(/\/$/,''),key,model,provider,reasoningEffort};
}
export class ModelServiceError extends Error { constructor(message:string,public output?:{text:string;usage:Record<string,number>}){super(message);this.name='ModelServiceError'} }
export async function callModel(p:ModelProfile,system:string,input:string,signal:AbortSignal,maxTokens:number,onResponse?:()=>void):Promise<{text:string;usage:Record<string,number>}>{
  const anthropic=p.provider==='anthropic';
  const url=p.base+(anthropic?'/messages':'/chat/completions');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(anthropic){headers['x-api-key']=p.key;headers['anthropic-version']='2023-06-01'}else headers.Authorization='Bearer '+p.key;
  const body=anthropic?{model:p.model,max_tokens:maxTokens,system,messages:[{role:'user',content:input}]}:{model:p.model,max_tokens:maxTokens,...(new URL(p.base).hostname==='api.deepseek.com'?{response_format:{type:'json_object'}}:{}),...(p.reasoningEffort?{reasoning_effort:p.reasoningEffort}:{}),messages:[{role:'system',content:system},{role:'user',content:input}]};
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal})}catch(e){if(signal.aborted)throw new ModelServiceError('生成超时或已取消');throw new ModelServiceError('无法连接模型服务，请检查服务端接口配置')}
  if(!response.ok){
    await response.body?.cancel();
    throw new ModelServiceError(response.status===429?'模型服务限流或额度不足，请稍后重试':response.status===401||response.status===403?'模型服务鉴权失败，请检查服务端配置':'模型服务请求失败（HTTP '+response.status+'）');
  }
  onResponse?.();
  const length=Number(response.headers.get('content-length'));
  if(length>1000000){await response.body?.cancel();throw new ModelServiceError('模型结果超出大小限制')}
  const reader=response.body!.getReader();let raw='',bytes=0;const dec=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1000000){await reader.cancel();throw new ModelServiceError('模型结果超出大小限制')}raw+=dec.decode(value,{stream:true})}
  raw+=dec.decode();
  let data:any;try{data=JSON.parse(raw)}catch{throw new ModelServiceError('模型服务响应不是有效 JSON')}
  const text=anthropic?data.content?.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n'):data.choices?.[0]?.message?.content;
  if(data.choices?.[0]?.finish_reason==='length'&&(!text||typeof text!=='string'))throw new ModelServiceError('模型输出达到 token 上限');
  if(typeof text!=='string'||!text.trim())throw new ModelServiceError('模型没有返回可用内容');
  const usage:Record<string,number>={};
  for(const key of ['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens'])if(Number.isFinite(data.usage?.[key]))usage[key]=data.usage[key];
  if(data.choices?.[0]?.finish_reason==='length')throw new ModelServiceError('模型输出达到 token 上限，未生成完整结果；保留本次输出和用量。',{text,usage});
  return {text,usage};
}
