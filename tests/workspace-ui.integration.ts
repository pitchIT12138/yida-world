import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,type BrowserContext,type Page} from 'playwright';
import app,{hash} from '../server/app';
import {LocalWorkspace} from '../server/local-workspace';
import {fixture} from './fixtures';
import type {GenerationInput} from '../src/lib/types';

// Isolated database/browser; generation responses are explicitly test fixtures.
const directory=await mkdtemp(join(tmpdir(),'yida-ui-workspace-')),dbFile=join(directory,'workspace.sqlite');
let store=new LocalWorkspace(dbFile),runs=0;
const inputs:GenerationInput[]=[];
const browser=await chromium.launch({channel:'chromium'});
async function open():Promise<{context:BrowserContext;page:Page}>{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  await context.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path==='/api/config'){await route.fulfill({json:{generationEnabled:true,workspaceEnabled:true,tiers:['balanced'],timeoutMs:120000}});return}
    if(path==='/api/generate'){
      const input=req.postDataJSON() as GenerationInput;inputs.push(input);const artifact=fixture(input.source.paragraphs[0].id);
      artifact.answerId=input.source.id;artifact.provenance.runId='TEST-WORKSPACE-'+(++runs);artifact.provenance.sourceHash=await hash(input.source);artifact.provenance.prompt=input.instruction;
      await route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'result',artifact})+'\n\n'});return;
    }
    const response=await app.request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()||undefined},{WORKSPACE_STORE:store} as any);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  const page=await context.newPage();await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:5173');
  await page.getByText('已连接后台',{exact:true}).waitFor();return{context,page};
}
let current=await open();
const saved=async()=>current.page.getByText('已保存到后台',{exact:true}).waitFor({timeout:10000});
const card=()=>current.page.locator('article').filter({has:current.page.getByRole('heading',{name:'持续打磨测试',exact:true})});
try{
  await current.page.getByRole('button',{name:'导入或写回答',exact:true}).click();
  await current.page.getByRole('textbox',{name:'粘贴回答正文',exact:true}).fill('第一段原文。\n\n第二段保持不动。');
  await current.page.getByRole('textbox',{name:'回答标题',exact:true}).fill('持续打磨测试');
  await current.page.getByRole('button',{name:'加入本页',exact:true}).click();await saved();
  const original=(await store.list()).find(a=>a.source.title==='持续打磨测试')!;assert.ok(original);
  await card().getByRole('button',{name:'加工回答',exact:true}).click();
  await card().getByRole('textbox',{name:'这篇回答的创作想法',exact:true}).fill('比较两种方案，并解释每一步的原因。');await saved();
  // Restart the backend and use an entirely new browser context (no IndexedDB).
  await current.context.close();store.close();store=new LocalWorkspace(dbFile);current=await open();
  await card().getByRole('button',{name:'加工回答',exact:true}).click();
  assert.equal(await card().getByRole('textbox',{name:'这篇回答的创作想法',exact:true}).inputValue(),'比较两种方案，并解释每一步的原因。');
  await card().getByRole('button',{name:'生成表达',exact:true}).click();await saved();
  await card().getByText('API 生成',{exact:true}).waitFor();
  const firstVersion=(await store.versions(original.source.id)).find(v=>v.kind==='generation')!;assert.ok(firstVersion);
  await card().getByRole('button',{name:'编辑原文',exact:true}).click();
  await current.page.getByRole('button',{name:'编辑正文段落',exact:true}).click();
  await current.page.getByRole('textbox',{name:'编辑第 1 段',exact:true}).fill('第一段已经修订，需要保留上一次的好想法。');
  await current.page.getByRole('button',{name:'保存修改',exact:true}).click();await saved();
  const edited=(await store.list()).find(a=>a.source.id===original.source.id)!;
  assert.equal(edited.source.paragraphs[0].text,'第一段已经修订，需要保留上一次的好想法。');assert.ok(edited.reference?.artifact);assert.equal(edited.artifact,undefined);
  assert.equal((await store.list()).filter(a=>a.source.title==='持续打磨测试').length,1);
  await card().getByRole('button',{name:'加工回答',exact:true}).click();
  await card().getByRole('textbox',{name:'这篇回答的创作想法',exact:true}).fill('保留上一版比较，补充结果的适用边界。');await saved();
  await card().getByRole('button',{name:'生成表达',exact:true}).click();await saved();await card().getByText('API 生成',{exact:true}).waitFor();
  assert.equal(inputs[1].previous?.artifact.provenance.runId,'TEST-WORKSPACE-1');
  assert.equal(inputs[1].source.paragraphs[0].text,edited.source.paragraphs[0].text);
  await card().getByRole('button',{name:'版本历史',exact:true}).click();
  // Identify the retained first result by its instruction, then restore it through the UI.
  await card().locator('.version-row').filter({hasText:'生成表达'}).filter({hasText:'比较两种方案，并解释每一步的原因。'}).click();
  await card().getByRole('button',{name:'使用这一版继续打磨',exact:true}).click();await saved();
  const restored=(await store.list()).find(a=>a.source.id===original.source.id)!;
  assert.equal(restored.artifact?.provenance.runId,'TEST-WORKSPACE-1');assert.equal(restored.source.paragraphs[0].text,'第一段原文。');
  assert.equal((await store.versions(original.source.id)).filter(v=>v.kind==='generation').length,2);
  console.log('PASS: imported answer editable under stable ID; ideas survive database restart and a fresh browser; previous source/code sent after source edits; two generated results retained; old version restored through the real UI. Generation itself uses test fixtures.');
}finally{await current.context.close();await browser.close();store.close();await rm(directory,{recursive:true,force:true})}
