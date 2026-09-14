import assert from 'node:assert/strict';
import {chromium,type Page} from 'playwright';
import {ManualBrowsers} from '../collector/manual';
import {ReaderError} from '../collector/reader';
// End-to-end input transport through the actual Svelte component, isolated fixture browsers.
// Requires the local Vite server; never controls an existing user profile or solves a CAPTCHA.
const browser=await chromium.launch({channel:'chromium'}),newContext=browser.newContext.bind(browser);
const remotePages:Page[]=[];
const manual=new ManualBrowsers(async()=>browser);
browser.newContext=async options=>{
  const context=await newContext(options);context.on('page',p=>remotePages.push(p));
  await context.route('https://www.zhihu.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:30px;font:20px sans-serif}input{width:300px;height:40px;font:20px sans-serif}</style><label>直接输入 <input id="input"></label><p id="state">鼠标尚未按下</p><script>document.onmousedown=()=>document.getElementById('state').textContent='down';document.onmousemove=e=>{if(e.buttons===1)document.getElementById('state').textContent='moving'};document.onmouseup=()=>document.getElementById('state').textContent='up';</script>`}));
  return context;
};
const front=await newContext({viewport:{width:1200,height:1100}});
await front.route(/\/api\/manual-browser(?:\/.*)?$/,async r=>{
  const req=r.request(),path=new URL(req.url()).pathname.replace('/api/manual-browser',''),id=req.headers()['x-reader-session'];
  try{
    if(path===''&&req.method()==='POST'){await r.fulfill({json:await manual.create(req.postDataJSON().url)});return}
    if(path===''&&req.method()==='DELETE'){await manual.remove(id);await r.fulfill({json:{ok:true}});return}
    if(path==='/status'){await r.fulfill({json:{authenticated:false}});return}
    if(path==='/screen'){await r.fulfill({contentType:'image/jpeg',body:await manual.screen(id)});return}
    if(path==='/action'){await r.fulfill({json:await manual.action(id,req.postDataJSON())});return}
    await r.fulfill({status:404,json:{error:'Unknown fixture operation'}});
  }catch(e){await r.fulfill({status:e instanceof ReaderError?e.status:500,json:{error:e instanceof Error?e.message:'Error'}})}
});
try{
 const page=await front.newPage();await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:5173')+'/tests/manual-window.html');
 await page.locator('.viewport img').waitFor();const viewport=await page.locator('.viewport').boundingBox();assert.ok(viewport);
 assert.equal(await page.locator('.window-input').count(),0);assert.ok((await page.locator('.keyboard-capture').boundingBox())!.width<=2);
 const pos=(x:number,y:number)=>({x:viewport.x+x/1280*viewport.width,y:viewport.y+y/800*viewport.height});
 const at=pos(180,50);await page.mouse.click(at.x,at.y);await page.keyboard.type('direct');
 await remotePages[0].waitForFunction(()=>document.querySelector<HTMLInputElement>('#input')?.value==='direct');
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText('中文原位输入');
 await remotePages[0].waitForFunction(()=>document.querySelector<HTMLInputElement>('#input')?.value==='中文原位输入');
 const down=pos(600,140);await page.mouse.move(down.x,down.y);await page.mouse.down();
 await remotePages[0].waitForFunction(()=>document.querySelector('#state')?.textContent==='down');
 const moved=pos(700,140);await page.mouse.move(moved.x,moved.y);
 await remotePages[0].waitForFunction(()=>document.querySelector('#state')?.textContent==='moving');
 await page.mouse.up();await remotePages[0].waitForFunction(()=>document.querySelector('#state')?.textContent==='up');
 await page.screenshot({path:'artifacts/manual-input-ui.local.png'});
 console.log('PASS: actual Svelte UI accepts direct keyboard text and committed Chinese, remote selection/replacement, live mouse down/move before release, and has no visible relay input. Isolated fixture browsers.');
}finally{await front.close();await manual.close()}
