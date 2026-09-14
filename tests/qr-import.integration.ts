import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ManualBrowsers} from '../collector/manual';
import {ReaderError} from '../collector/reader';

// Real product browser and Svelte UI, with local fixture responses. QR confirmation is
// simulated by a fixture button: this is not evidence of live Zhihu login or scraping.
const browser=await chromium.launch({channel:'chromium'}),newContext=browser.newContext.bind(browser);
const manual=new ManualBrowsers(async()=>browser);
let creates=0,reads=0,activeSession='';
browser.newContext=async options=>{
  creates++;
  const context=await newContext(options);let authenticated=false;
  await context.route('https://www.zhihu.com/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/fixture-confirm'){authenticated=true;await route.fulfill({json:{ok:true}});return}
    if(url.pathname==='/answer/789'){await route.fulfill({status:403,json:{error:{code:40362}}});return}
    const id=url.pathname.match(/answer\/(\d+)/)?.[1];
    const body=authenticated&&id
      ? `<div class="AppHeader-profileEntry">已登录</div><h1 class="QuestionHeader-title">回答${id}</h1><div class="AnswerItem" name="${id}"><div class="AuthorInfo-name">原作者</div><div class="RichContent-inner"><p>首段${id}</p></div><button id="expand">展开阅读全文</button><script>document.getElementById('expand').onclick=function(){document.querySelector('.RichContent-inner').insertAdjacentHTML('beforeend', '<p>完整末段${id}</p><img data-original="https://picx.zhimg.com/original.png">');this.remove()}</script><a href="${url.href}">来源</a></div><div class="AnswerItem" name="999"><div class="RichContent-inner"><p>另一篇不能混入</p></div></div>`
      : `<div class="SignFlow"><button style="position:absolute;left:10px;top:10px;width:200px;height:60px" onclick="fetch('/fixture-confirm').then(()=>document.body.innerHTML='<div class=AppHeader-profileEntry>已登录</div>')">模拟扫码确认</button></div>`;
    await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8">'+body});
  });
  await context.route('https://picx.zhimg.com/**',route=>route.fulfill({status:404,body:''}));
  return context;
};
const front=await newContext({viewport:{width:1280,height:1100}});
await front.route(/\/api\/(manual-browser|import\/answer)(?:[/?].*)?$/,async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.replace('/api/manual-browser',''),id=request.headers()['x-reader-session'];
  try{
    if(path===''&&request.method()==='POST'){const value=await manual.create(request.postDataJSON().url);activeSession=value.id;await route.fulfill({json:value});return}
    if(path===''&&request.method()==='DELETE'){await manual.remove(id);await route.fulfill({json:{ok:true}});return}
    if(path==='/status'){await route.fulfill({json:await manual.status(id)});return}
    if(path==='/screen'){await route.fulfill({contentType:'image/jpeg',body:await manual.screen(id)});return}
    if(path==='/action'){await route.fulfill({json:await manual.action(id,request.postDataJSON())});return}
    if(url.pathname==='/api/import/answer'){reads++;await route.fulfill({json:{source:await manual.read(id,url.searchParams.get('url')!)}});return}
    throw new Error('Unknown fixture request');
  }catch(e){await route.fulfill({status:e instanceof ReaderError?e.status:500,json:{code:e instanceof ReaderError?e.code:'FIXTURE_FAILED',error:e instanceof Error?e.message:'Unknown'}})}
});
try{
  const page=await front.newPage();await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:5173')+'/tests/qr-composer.html');
  await page.getByRole('button',{name:'打开导入',exact:true}).click();
  const paste=async(id:string)=>page.getByRole('textbox',{name:'知乎回答链接或 ID'}).evaluate((el,id)=>{
    const clipboardData=new DataTransfer();clipboardData.setData('text/plain',`https://www.zhihu.com/answer/${id}`);
    el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
  },id);
  await page.getByText('可选：尝试联网读取',{exact:true}).click();await paste('123');await page.getByRole('button',{name:'读取链接全文',exact:true}).click();await page.locator('.viewport img').waitFor();assert.equal(reads,0);
  assert.equal(await page.getByRole('button',{name:'打开这条回答'}).count(),0);assert.equal(await page.getByRole('button',{name:'导入当前回答'}).count(),0);
  // Fixture-only confirmation in the same remote browser context.
  await manual.action(activeSession,{type:'click',x:70,y:40});
  await page.getByLabel('导入原文预览').getByText('完整末段123',{exact:true}).waitFor({timeout:20000});
  assert.equal(await page.locator('.viewport').count(),0);assert.equal(creates,1);
  assert.ok(!(await page.getByLabel('导入原文预览').innerText()).includes('另一篇'));
  await page.getByRole('button',{name:'关闭导入回答',exact:true}).click();
  await page.getByRole('button',{name:'打开导入',exact:true}).click();await page.getByText('可选：尝试联网读取',{exact:true}).click();await paste('456');await page.getByRole('button',{name:'读取链接全文',exact:true}).click();
  await page.getByLabel('导入原文预览').getByText('完整末段456',{exact:true}).waitFor({timeout:20000});
  assert.equal(creates,1);assert.equal(reads,2);assert.equal(await page.locator('.viewport').count(),0);
  await assert.rejects(()=>manual.read(activeSession,'https://www.zhihu.com/answer/789'),/限制/);
  assert.equal((await manual.status(activeSession)).authenticated,true,'a denied answer must not erase a confirmed QR login');
  console.log('PASS: explicit optional read queues login, confirmation automatically opens and expands the requested answer in the same browser, QR window disappears, reopening the composer and pasting another link reuses login. Fixture-backed.');
}finally{await front.close();await manual.close()}
