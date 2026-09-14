import {Hono} from 'hono';
import type {RuntimeEnv} from './model';
import type {Answer} from '../src/lib/types';
import {validateSource,validateArtifact} from '../src/lib/validation';
import {validateAssets,sha256} from '../src/lib/archive';
import {WorkspaceConflict,type WorkspaceStore} from './workspace-store';
import {boundedBytes} from './imports';
export const workspaceRoutes=new Hono<{Bindings:RuntimeEnv}>();
workspaceRoutes.use('*',async(c,next)=>{
  if(c.req.header('X-Workspace-Client')!=='yida'||(c.req.header('origin')&&c.req.header('origin')!==new URL(c.req.url).origin))return c.json({error:'请从当前工作页面访问。'},403);
  if(!c.env.WORKSPACE_STORE)return c.json({error:'后台存储未连接，当前修改暂存在浏览器。'},503);
  await next();
});
workspaceRoutes.get('/',async c=>c.json(await(c.env.WORKSPACE_STORE as WorkspaceStore).list()));
workspaceRoutes.get('/:id/versions',async c=>c.json(await(c.env.WORKSPACE_STORE as WorkspaceStore).versions(c.req.param('id'))));
workspaceRoutes.get('/:id/versions/:version',async c=>{
  const value=await(c.env.WORKSPACE_STORE as WorkspaceStore).version(c.req.param('id'),Number(c.req.param('version')));
  return value?c.json(value):c.json({error:'版本不存在。'},404);
});
workspaceRoutes.post('/:id',async c=>{
  try{
    const body=JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(c.req.raw.body),150_000_000)));
    const source=validateSource(body.answer?.source);
    if(source.id!==c.req.param('id'))throw new Error('回答标识不匹配');
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw new Error('版本号无效');
    if(!['import','source','generation','draft','restore','attempt','media'].includes(body.kind))throw new Error('保存类型无效');
    const assets=await validateAssets(body.answer.assets);
    const artifact=body.answer.artifact?validateArtifact(body.answer.artifact,source):undefined;
    if(artifact&&artifact.provenance.sourceHash!==await sha256(new TextEncoder().encode(JSON.stringify(source))))throw new Error('原文已变化，旧生成结果应保留在历史版本中。');
    const reference=body.answer.reference;if(reference){validateSource(reference.source);validateArtifact(reference.artifact,reference.source);if(reference.source.id!==source.id)throw new Error('历史参考不属于当前回答');if(reference.artifact.provenance.sourceHash!==await sha256(new TextEncoder().encode(JSON.stringify(reference.source))))throw new Error('历史原文与生成结果不匹配')}
    const workspace=body.answer.workspace;
    if(workspace&&(typeof workspace.idea!=='string'||workspace.idea.length>2000||!Array.isArray(workspace.selectedParagraphIds)||workspace.selectedParagraphIds.some((id:unknown)=>!source.paragraphs.some(p=>p.id===id))))throw new Error('想法或选区格式无效');
    const answer:Answer={source,artifact,assets,reference,votes:Number.isFinite(body.answer.votes)?body.answer.votes:0,accent:typeof body.answer.accent==='string'?body.answer.accent.slice(0,40):'#658896',tag:typeof body.answer.tag==='string'?body.answer.tag.slice(0,80):'原文导入',workspace:workspace?{revision:body.expectedRevision,idea:workspace.idea,selectedParagraphIds:workspace.selectedParagraphIds,updatedAt:'',lastError:typeof workspace.lastError==='string'?workspace.lastError.slice(0,600):undefined}:undefined};
    return c.json(await(c.env.WORKSPACE_STORE as WorkspaceStore).save(answer,body.expectedRevision,body.kind));
  }catch(e){return c.json({error:e instanceof Error?e.message:'保存失败'},e instanceof WorkspaceConflict?409:400)}
});
