import {parse} from 'acorn';
import {modelJSON} from './model-json';
import {applyArtifactPatches,PATCH_INSTRUCTION} from './artifact-patch';
import {profile,callModel,ModelServiceError,type RuntimeEnv} from './model';
import {SYSTEM_PROMPT} from './prompt';
import {selectBaseline} from './baseline';
import {DESIGN_POLICY_VERSION} from '../src/lib/design-policy';
import {selectInteractions,validateLibraryReferences} from '../src/lib/interaction-library';
import {validateArtifact,mergeArtifact} from '../src/lib/validation';
import {validatePlan,normalizePlanEnvelope,presentationDefaults,PLAN_INSTRUCTION,BLOCK_INSTRUCTION} from './generation-plan';
import type {AnswerArtifact,GenerationInput,GenerationEvent} from '../src/lib/types';
import {digest} from './cloud';
export class ArtifactRejected extends Error {constructor(message:string,public candidate?:unknown){super(message);this.name='ArtifactRejected'}}
export async function generateArtifact(input:GenerationInput,env:RuntimeEnv,options:{signal:AbortSignal;runId:string;repairs?:number;onRepair?:()=>Promise<void>;onOutput?:(text:string,usage:Record<string,number>,stage?:string)=>Promise<void>;onStatus?:(event:GenerationEvent)=>void}){
 const p=profile(env,input.tier);if(!p)throw new ModelServiceError('当前档位尚未连接模型');const start=Date.now(),sourceHash=await digest(JSON.stringify(input.source)),baseline=selectBaseline(input,sourceHash);
 const scope=input.selectedParagraphIds.length?input.selectedParagraphIds:input.source.paragraphs.map(p=>p.id);
 const current=input.current?{...input.current,blocks:input.current.blocks.filter(b=>scope.includes(b.afterParagraphId)),bindings:input.current.bindings.filter(b=>scope.includes(b.paragraphId))}:undefined;
 const base={source:input.source,previousVersion:input.previous,allowedParagraphIds:scope,current,instruction:input.instruction,designBaseline:baseline,designPolicyVersion:DESIGN_POLICY_VERSION,interactionLibrary:selectInteractions(input.source.title+' '+input.instruction)};
 let repairs=options.repairs||0;const usage:Record<string,number>={...input.repair?.candidate.provenance.usage},normalizations:string[]=[...(input.repair?.candidate.provenance.normalizations||[])];
 const status=(stage:string,message:string)=>options.onStatus?.({type:'status',stage,message});
 const stamp=async()=>({method:'api' as const,runId:options.runId,sourceHash,model:p.model,tier:input.tier,createdAt:new Date().toISOString(),prompt:input.instruction,reasoningEffort:p.reasoningEffort,baselineVersion:baseline?.version||DESIGN_POLICY_VERSION,baselineHash:await digest(JSON.stringify(baseline||DESIGN_POLICY_VERSION)),elapsedMs:Date.now()-start+(input.repair?.candidate.provenance.elapsedMs||0),usage:{...usage},repairCount:repairs,normalizations:[...normalizations]});
 const consume=async(error:unknown,candidate?:unknown)=>{if(repairs>=2)throw new ArtifactRejected(String(error),candidate);await options.onRepair?.();repairs++;status('repairing','正在局部修复（'+repairs+'/2），保留已完成代码…')};
 const request=async(stage:string,context:unknown,tokens:number)=>{
  let response;try{response=await callModel(p,SYSTEM_PROMPT,JSON.stringify(context),options.signal,tokens)}catch(e){if(e instanceof ModelServiceError&&e.output)await options.onOutput?.(e.output.text,e.output.usage,stage+':incomplete');throw e}
  await options.onOutput?.(response.text,response.usage,stage);for(const [k,v]of Object.entries(response.usage))usage[k]=(usage[k]||0)+v;
  return response.text;
 };
 const unpack=(text:string)=>{const parsed=modelJSON(text);normalizations.push(...parsed.normalizations);return parsed.value};
 const validate=async(raw:any,complete=true)=>{normalizations.push(...presentationDefaults(raw));raw.scene?.forEach((s:any,i:number)=>{if(s.action==='demo'&&s.demo){s.action='reveal';normalizations.push('scene['+i+'].action:demo→reveal')}});raw.provenance=await stamp();if(!raw.design)throw Error('缺少设计记录');validateArtifact(raw,input.source,input.selectedParagraphIds);if(complete)validateLibraryReferences(raw);for(const block of raw.blocks){try{parse(block.js,{ecmaVersion:2022,sourceType:'script'})}catch(e){throw Error('blocks['+raw.blocks.indexOf(block)+'] ('+block.id+').js: '+String(e))}}return raw as AnswerArtifact};
 let artifact:any;
 if(input.repair){
  artifact=structuredClone(input.repair.candidate);let message=input.repair.message;
  for(;;){const text=await request('repair',{...base,candidate:artifact,runtimeError:message,repairFormat:PATCH_INSTRUCTION},14000);try{const parsed=unpack(text);const next=parsed?.patches?applyArtifactPatches(artifact,parsed.patches):parsed;await validate(next);artifact=next;break}catch(e){await consume(e,artifact);message=String(e)}}
 }
 else{
  status('designing','正在设计整篇阅读路线、操作反馈和跨块状态…');let plan:any,last='',error='';
  for(;;){last=await request('design',{...base,stageInstruction:PLAN_INSTRUCTION,...(error?{previousOutput:last,validationError:error}:{})},10000);try{const raw=unpack(last);normalizations.push(...normalizePlanEnvelope(raw),...presentationDefaults(raw?.artifact));plan=validatePlan(raw,input.source,input.selectedParagraphIds,await stamp());break}catch(e){error=String(e);await consume(e)}}
  artifact=plan.artifact;
  for(let index=0;index<artifact.blocks.length;index++){
   const planned=artifact.blocks[index];let last='',error='';status('generating','正在实现交互 '+(index+1)+'/'+artifact.blocks.length+'：'+planned.title);
   for(;;){last=await request('block:'+planned.id,{source:input.source,stageInstruction:BLOCK_INSTRUCTION,plan,block:planned,contract:plan.contracts.find((c:any)=>c.blockId===planned.id),...(error?{previousOutput:last,validationError:error}:{})},12000);
    try{const result=unpack(last);if(result?.blockId!==planned.id)throw Error('返回blockId必须为 '+planned.id);for(const field of ['html','css','js'])if(typeof result[field]!=='string')throw Error('块 '+planned.id+' 缺少字符串字段 '+field);const b={...planned,html:result.html,css:result.css,js:result.js};artifact.blocks[index]=b;await validate(artifact,false);break}catch(e){error=String(e);await consume(e,artifact)}
   }
  }
 }
 status('checking','正在装配全部交互、检查脚本与来源…');
 try{const valid=await validate(artifact);return {artifact:mergeArtifact(input.current,valid,input.source,input.selectedParagraphIds),repairs}}catch(e){throw new ArtifactRejected(String(e),artifact)}
}
