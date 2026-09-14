import type {StudioAnswer} from './types';
import type {AnswerSource} from '../src/lib/types';
import {validateSource} from '../src/lib/validation';
export type CleanupPlan={id:string;expectedRevision:number;source:AnswerSource;changes:{paragraphId:string;reason:string;replacementIds:string[]}[]};
export function previewCleanup(current:StudioAnswer,plan:CleanupPlan){
 if(plan.id!==current.source.id||plan.source.id!==current.source.id||plan.expectedRevision!==current.workspace?.revision)throw Error('清洗版本已过期，请重新导出');
 validateSource(plan.source);
 const changes=current.source.paragraphs.filter(p=>JSON.stringify(p)!==JSON.stringify(plan.source.paragraphs.find(n=>n.id===p.id))).map(before=>{
  const record=plan.changes.find(c=>c.paragraphId===before.id);if(!record?.reason.trim())throw Error('每个修改或删除必须说明理由：'+before.id);
  const after=record.replacementIds.map(id=>{const p=plan.source.paragraphs.find(p=>p.id===id);if(!p)throw Error('映射段落不存在');return p});return {before,after,reason:record.reason};
 });
 for(const p of plan.source.paragraphs)if(!current.source.paragraphs.some(old=>old.id===p.id)&&!plan.changes.some(c=>c.replacementIds.includes(p.id)))throw Error('新增段落缺少映射');
 return {id:plan.id,expectedRevision:plan.expectedRevision,metadata:{before:{...current.source,paragraphs:undefined},after:{...plan.source,paragraphs:undefined}},changes};
}
export function cleanedRecord(current:StudioAnswer,plan:CleanupPlan){
 previewCleanup(current,plan);const next=structuredClone(current);next.source=plan.source;
 next.studio.notes=next.studio.notes.map(note=>{
  const mapping=plan.changes.find(c=>c.paragraphId===note.paragraphId);
  const matches=mapping?.replacementIds.map(id=>plan.source.paragraphs.find(p=>p.id===id)!).filter(p=>p.text.includes(note.quote));
  return matches?.length===1?{...note,paragraphId:matches[0].id,quote:matches[0].text}:note;
 });
 next.workspace!.selectedParagraphIds=next.workspace!.selectedParagraphIds.flatMap(id=>plan.changes.find(c=>c.paragraphId===id)?.replacementIds||[id]).filter(id=>plan.source.paragraphs.some(p=>p.id===id));return next;
}
