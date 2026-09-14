import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalWorkspace} from '../server/local-workspace';
import app,{hash} from '../server/app';
import {source,fixture} from './fixtures';
import type {Answer} from '../src/lib/types';
let directory:string,store:LocalWorkspace;
const base=():Answer=>({source:structuredClone(source),votes:0,accent:'#334455',tag:'测试'});
const headers={'Content-Type':'application/json','X-Workspace-Client':'yida'};
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'yida-workspace-'));store=new LocalWorkspace(join(directory,'workspace.sqlite'))});
afterEach(async()=>{store.close();await rm(directory,{recursive:true,force:true})});
const save=(answer:Answer,expectedRevision:number,kind='import')=>app.request('http://app.test/api/workspace/test',{method:'POST',headers,body:JSON.stringify({answer,expectedRevision,kind})},{WORKSPACE_STORE:store} as any);
describe('backend answer workspace',()=>{
  it('restores content and ideas after closing and reopening the database',async()=>{
    const answer=base();answer.workspace={idea:'比较两种假设，保留推导',selectedParagraphIds:['p1'],revision:0,updatedAt:''};
    expect((await save(answer,0)).status).toBe(200);store.close();store=new LocalWorkspace(join(directory,'workspace.sqlite'));
    const records=await store.list();expect(records[0].workspace?.idea).toBe(answer.workspace.idea);expect(records[0].source).toEqual(source);
  });
  it('keeps both source and generated versions and rejects stale writes',async()=>{
    const first=await(await save(base(),0)).json();const artifact=fixture();artifact.provenance.sourceHash=await hash(source);
    const generated=await(await save({...first,artifact},1,'generation')).json();
    const changed={...generated,source:{...source,title:'修订原文'},artifact:undefined,reference:{source,artifact}};
    expect((await save(changed,2,'source')).status).toBe(200);
    expect((await save(base(),1,'source')).status).toBe(409);
    const versions=await store.versions('test');expect(versions).toHaveLength(3);
    expect((await store.version('test',versions[1].id))?.artifact).toEqual(artifact);
    expect((await store.list())[0].reference?.artifact).toEqual(artifact);
  });
  it('updates a saved idea without discarding the current generated result or flooding history',async()=>{
    const artifact=fixture();artifact.provenance.sourceHash=await hash(source);const first=await(await save({...base(),artifact},0)).json();
    expect((await save({...first,workspace:{...first.workspace,idea:'继续这一版'}},1,'draft')).status).toBe(200);
    expect((await store.versions('test'))).toHaveLength(1);expect((await store.list())[0].artifact).toEqual(artifact);
  });
  it('rejects attaching an old result to changed source text',async()=>{
    const artifact=fixture();artifact.provenance.sourceHash=await hash(source);
    const response=await save({...base(),source:{...source,title:'改过标题'},artifact},0);
    expect(response.status).toBe(400);expect(await store.list()).toHaveLength(0);
  });
  it('requires a same-origin workspace client header',async()=>{
    expect((await app.request('http://app.test/api/workspace',{}, {WORKSPACE_STORE:store} as any)).status).toBe(403);
    expect((await app.request('http://app.test/api/workspace',{headers:{...headers,Origin:'https://elsewhere.test'}},{WORKSPACE_STORE:store} as any)).status).toBe(403);
  });
});
