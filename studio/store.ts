import {authorAvatar,sanitizeRichHTML} from '../src/lib/rich-source';
import {LocalWorkspace} from '../server/local-workspace';
import {WorkspaceConflict} from '../server/workspace-store';
import {validateSource,validateArtifact} from '../src/lib/validation';
import {validateAssets,sha256} from '../src/lib/archive';
import type {StudioAnswer} from './types';
export class StudioStore extends LocalWorkspace {
 async saveRecord(a:StudioAnswer,revision:number,kind:string){
  // Recover old pending drafts whose generated avatar was a leading space.
  if(a.source&&(!a.source.avatar||!a.source.avatar.trim()))a.source.avatar=authorAvatar(a.source.author||'');
  // Studio accepts pasted source data: clean it before strict shared validation.
  // This also recovers pending drafts made by older paragraph splitters.
  if(Array.isArray(a.source?.paragraphs))for(const p of a.source.paragraphs)if(typeof p.html==='string')p.html=sanitizeRichHTML(p.html);
  validateSource(a.source);a.assets=await validateAssets(a.assets);
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('版本号无效');
  if(!a.studio||!Array.isArray(a.studio.notes)||a.studio.notes.length>500||!Array.isArray(a.studio.tags)||a.studio.tags.some(t=>typeof t!=='string'||t.length>100)||typeof a.studio.feedback!=='string'||a.studio.feedback.length>20000)throw Error('备注格式无效');
  for(const n of a.studio.notes)if(!n||['id','paragraphId','quote','text'].some(k=>typeof n[k as keyof typeof n]!=='string')||n.text.length>20000)throw Error('段落备注格式无效');
  if(typeof a.workspace?.idea!=='string'||a.workspace.idea.length>20000)throw Error('整体想法格式无效');
  const old=(await this.list()).find(x=>x.source.id===a.source.id) as StudioAnswer|undefined;
  if((old?.workspace?.revision||0)!==revision)throw new WorkspaceConflict();
  if(old&&JSON.stringify(old.source)!==JSON.stringify(a.source)){
   a.reference=old.artifact?{source:old.source,artifact:old.artifact}:old.reference;a.artifact=undefined;a.studio.status='draft';
  }
  if(a.artifact){validateArtifact(a.artifact,a.source);if(a.artifact.provenance.sourceHash!==await sha256(new TextEncoder().encode(JSON.stringify(a.source))))throw Error('原文指纹不一致')}
  return await super.save(a,revision,kind) as StudioAnswer;
 }
}
