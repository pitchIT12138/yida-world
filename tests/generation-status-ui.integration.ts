import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {source,fixture} from './fixtures';
const browser=await chromium.launch(),base=process.env.TEST_BASE_URL||'https://yida-world.zackguo.chatgpt.site';
const evidence:any[]=[];await mkdir('artifacts/reviews/generation-connection',{recursive:true});
try{for(const width of [360,740]){
 const context=await browser.newContext({viewport:{width,height:width===360?800:1000}}),page=await context.newPage();let polls=0,posts=0,saved=false,id='',release=()=>{};
 let answer:any={source,votes:0,accent:'#123',tag:'测试数据',workspace:{revision:1,idea:'测试状态显示',selectedParagraphIds:[],updatedAt:new Date().toISOString()}};
 await page.route('**/api/config',r=>r.fulfill({json:{authRequired:true,loginConfigured:true,user:{id:'mock',name:'测试身份',avatar:''},generationEnabled:true,workspaceEnabled:true,tiers:['balanced'],timeoutMs:300000}}));
 await page.route('**/api/workspace**',async r=>{if(r.request().method()==='GET')return r.fulfill({json:[answer]});const body=r.request().postDataJSON();answer={...body.answer,workspace:{...body.answer.workspace,revision:body.expectedRevision+1,updatedAt:new Date().toISOString()}};if(body.kind==='generation')saved=true;await r.fulfill({json:answer})});
 await page.route('**/api/feed?*',r=>r.fulfill({json:{items:[],next:null}}));
 await page.route('**/api/generate',async r=>{posts++;id=r.request().headers()['x-generation-request'];await new Promise<void>(resolve=>release=resolve);await r.abort().catch(()=>{})});
 await page.route('**/api/generation/**',r=>r.fulfill({json:{runId:id,requestId:id,updatedAt:Date.now(),event:++polls>=2?{type:'result',artifact:fixture()}:{type:'status',stage:'model_waiting',message:'正在设计阅读路线，等待模型返回…'}}}));
 await page.goto(base);await page.getByText('已连接后台',{exact:true}).waitFor();await page.getByRole('tab',{name:'我的作品',exact:true}).click();
 const card=page.locator('.answer-card').filter({has:page.getByRole('heading',{name:source.title,exact:true})});
 await card.getByRole('button',{name:'让它活起来'}).click();await card.getByRole('button',{name:'生成表达',exact:true}).click();
 await card.locator('.generation-status').filter({hasText:'等待模型返回'}).waitFor({timeout:15000});const progress=await card.locator('.generation-status').innerText();assert(progress.includes('已用时'));
 await card.locator('.generation-status').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/reviews/generation-connection/status-'+width+'.png'});
 await card.locator('.edit-area').waitFor({state:'detached',timeout:15000});await page.getByText('已保存到后台',{exact:true}).waitFor();assert(saved);assert.equal(posts,1);assert.equal(answer.artifact.blocks[0].id,fixture().blocks[0].id);
 evidence.push({width,progress,polls,posts,saved,transport:'explicit mocked buffered stream; actual public UI'});release();await context.close();
}}
finally{await browser.close();await writeFile('artifacts/reviews/generation-connection/ui.json',JSON.stringify(evidence,null,2));console.log(evidence)}
