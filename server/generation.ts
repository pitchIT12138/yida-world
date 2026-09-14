import {parse} from 'acorn';
import {applyArtifactPatches,PATCH_INSTRUCTION} from './artifact-patch';
import {profile,callModel,type RuntimeEnv} from './model';
import {SYSTEM_PROMPT} from './prompt';
import {selectBaseline} from './baseline';
import {DESIGN_POLICY_VERSION} from '../src/lib/design-policy';
import {selectInteractions,validateLibraryReferences} from '../src/lib/interaction-library';
import {validateArtifact,parseModelJSON,mergeArtifact} from '../src/lib/validation';
import type {AnswerArtifact,GenerationInput,GenerationEvent} from '../src/lib/types';
import {digest} from './cloud';
export async function generateArtifact(input:GenerationInput,env:RuntimeEnv,options:{signal:AbortSignal;runId:string;repairs?:number;onRepair?:()=>Promise<void>;onOutput?:(text:string,usage:Record<string,number>)=>Promise<void>;onStatus?:(event:GenerationEvent)=>void}){
 const p=profile(env,input.tier);if(!p)throw Error('当前档位尚未连接模型');const start=Date.now(),sourceHash=await digest(JSON.stringify(input.source)),baseline=selectBaseline(input,sourceHash);
 const scope=input.selectedParagraphIds.length?input.selectedParagraphIds:input.source.paragraphs.map(p=>p.id);
 const current=input.current?{...input.current,blocks:input.current.blocks.filter(b=>scope.includes(b.afterParagraphId)),bindings:input.current.bindings.filter(b=>scope.includes(b.paragraphId))}:undefined;
 const base={source:input.source,previousVersion:input.previous,allowedParagraphIds:scope,current,instruction:input.instruction,designBaseline:baseline,designPolicyVersion:DESIGN_POLICY_VERSION,interactionLibrary:selectInteractions(input.source.title+' '+input.instruction)};
 let prompt=JSON.stringify(input.repair?{...base,candidate:input.repair.candidate,runtimeError:input.repair.message,repairFormat:PATCH_INSTRUCTION}:base),repairs=options.repairs||0;
 let repairBase:unknown=input.repair?.candidate;
 const usage:Record<string,number>={...input.repair?.candidate.provenance.usage};
 options.onStatus?.({type:'status',stage:'generating',message:'正在理解论点、设计操作与反馈，再编写交互…'});
 for(;;){
  const max=Number(env.MAX_OUTPUT_TOKENS)||18000;
  const response=await callModel(p,SYSTEM_PROMPT,prompt,options.signal,Math.min(20000,Math.max(1000,max)));
  await options.onOutput?.(response.text,response.usage);
  for(const [k,v]of Object.entries(response.usage))usage[k]=(usage[k]||0)+v;
  try{
   const parsed=parseModelJSON(response.text) as any;const artifact=(parsed?.patches?applyArtifactPatches(repairBase,parsed.patches):parsed) as AnswerArtifact;repairBase=artifact;if(!artifact?.design)throw Error('缺少设计记录');
   // A demo is already represented by reveal + demo in the Runtime protocol.
   // Canonicalize this unambiguous transport alias, never rewrite generated code.
   const normalized:string[]=[];
   artifact.scene?.forEach((step:any,i:number)=>{if(step.action==='demo'&&step.demo){step.action='reveal';normalized.push('scene['+i+'].action:demo→reveal')}});
   artifact.provenance={method:'api',runId:options.runId,sourceHash,model:p.model,tier:input.tier,createdAt:new Date().toISOString(),prompt:input.instruction,reasoningEffort:p.reasoningEffort,baselineVersion:baseline?.version||DESIGN_POLICY_VERSION,baselineHash:await digest(JSON.stringify(baseline||DESIGN_POLICY_VERSION)),elapsedMs:Date.now()-start+(input.repair?.candidate.provenance.elapsedMs||0),usage,repairCount:repairs,normalizations:normalized};
   validateArtifact(artifact,input.source,input.selectedParagraphIds);validateLibraryReferences(artifact);
   for(const block of artifact.blocks){try{parse(block.js,{ecmaVersion:2022,sourceType:'script'})}catch(e){throw Error('交互块 '+block.id+' 的 JavaScript 语法错误：'+String(e))}}
   return {artifact:mergeArtifact(input.current,artifact,input.source,input.selectedParagraphIds),repairs};
  }catch(e){
   if(repairs>=2)throw e;await options.onRepair?.();repairs++;
   options.onStatus?.({type:'status',stage:'repairing',message:`正在修复结构或语法问题（${repairs}/2）…`});
   prompt=JSON.stringify({...base,...(repairBase?{candidate:repairBase,repairFormat:PATCH_INSTRUCTION}:{previousOutput:response.text}),validationError:e instanceof Error?e.message:'结构无效'});
  }
 }
}
