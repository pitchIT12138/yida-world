import {validateArtifact} from '../src/lib/validation';
import type {AnswerArtifact,AnswerSource} from '../src/lib/types';
export type BlockContract={blockId:string;controls:{selector:string;action:string;effect:string}[];reads:string[];writes:string[];feedback:string};
export type GenerationPlan={format:'interaction-plan-v1';artifact:AnswerArtifact;contracts:BlockContract[]};
export function presentationDefaults(artifact:any):string[]{
 const changes:string[]=[];
 if(Array.isArray(artifact?.blocks))artifact.blocks.forEach((b:any,i:number)=>{if(b&&b.height===undefined){b.height=b.kind==='inline'?96:b.kind==='aside'?180:480;changes.push('blocks['+i+'] ('+b.id+').height: omitted → '+b.height)}});
 return changes;
}
// Accept a misplaced transport envelope only when there is exactly one contract list.
// This does not invent controls, bindings, content, or executable code.
export function normalizePlanEnvelope(value:any):string[]{
 if(value?.format==='interaction-plan-v1'&&value.contracts===undefined&&Array.isArray(value.artifact?.contracts)){
  value.contracts=value.artifact.contracts;delete value.artifact.contracts;
  return ['artifact.contracts → contracts（保留原操作约定）'];
 }
 return [];
}
export function validatePlan(value:any,source:AnswerSource,selected:string[],provenance:AnswerArtifact['provenance']):GenerationPlan{
 if(value?.format!=='interaction-plan-v1'||!value.artifact||!Array.isArray(value.contracts))throw Error('设计阶段需要 {format:"interaction-plan-v1",artifact,contracts}，不生成代码');
 const a=structuredClone(value.artifact);if(!a.design)throw Error('设计清单缺少 design');
 if(!Array.isArray(a.blocks)||value.contracts.length!==a.blocks.length)throw Error('每个计划块必须有一份操作与反馈约定');
 a.blocks=a.blocks.map((b:any)=>({...b,html:Array.isArray(b.mediaUrls)&&b.mediaUrls.length?b.mediaUrls.map((u:string)=>'<img data-source-image="'+String(u).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">').join(''):'<div>计划结构校验</div>' ,css:'',js:''}));presentationDefaults(a);a.provenance=provenance;validateArtifact(a,source,selected);
 const keys=new Set(a.bindings.map((b:any)=>b.id)),seen=new Set();
 for(const c of value.contracts){if(!c||!a.blocks.some((b:any)=>b.id===c.blockId)||seen.has(c.blockId)||!Array.isArray(c.controls)||!c.controls.length||c.controls.length>30||typeof c.feedback!=='string'||!c.feedback.trim())throw Error('操作约定无效，必须说明控件、反馈和块ID');seen.add(c.blockId);
  for(const control of c.controls)if(!control||typeof control.selector!=='string'||control.selector.length>160||!control.selector.trim()||typeof control.action!=='string'||typeof control.effect!=='string')throw Error('块 '+c.blockId+' 的控件约定不完整');
  for(const side of ['reads','writes'])if(!Array.isArray(c[side])||c[side].some((key:any)=>!keys.has(key)))throw Error('块 '+c.blockId+' 的 '+side+' 只能使用已声明 binding ID');
 }
 return {...value,artifact:a};
}
export const PLAN_INSTRUCTION=`当前阶段只做整篇设计清单，禁止输出HTML/CSS/JS。返回JSON {format:"interaction-plan-v1",artifact:{version:1,answerId,explanation,blocks:[{id,afterParagraphId,title,kind,height,mediaUrls?,replaceParagraphIds?}],bindings,scene,design,libraryReferences?},contracts:[{blockId,controls:[{selector:"#actual-id",action:"click/input/keyboard",effect:"具体改变的状态和画面"}],reads:["已声明bindingID"],writes:["已声明bindingID"],feedback:"精确反馈约定、默认值、范围、复位及跨块写入规则"}]}。artifact的其他字段遵循系统的AnswerArtifact约定，但blocks此时只给元数据，不写代码。每块一份contract，读写只引用bindings的ID，独立块使用空数组。设计真正改变场景或关系的操作。不要按统一模板凑块。`;
export const BLOCK_INSTRUCTION=`当前阶段只实现给定计划中的一个块。返回JSON {blockId:"指定块ID",html:"完整body内部HTML",css:"完整CSS",js:"完整JavaScript"}。不重复其他块、设计说明或provenance。必须遵守整篇contracts的选择器、状态读写、默认值、范围和反馈约定；只使用本块DOM，跨块经world。控件变化必须改变实际画面或计算，提供可用复位。即使长篇也只输出这个块的代码。`;
