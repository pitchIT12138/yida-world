import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {parseAnswerHTML,richSource} from '../src/lib/rich-source';

// Exercise the actual Svelte importer with clipboard event data. An optional local
// source file provides real article material; no logged-in browser is accessed.
const file=process.argv[2];
const sources=file?parseAnswerHTML(await readFile(file,'utf8'),'file'):[];
const source=file?(sources.find(s=>s.paragraphs.some(p=>p.html?.includes('<img')))||sources[0]):richSource('<h2>测试正文</h2><p>开头<strong>重点</strong></p><p>完整末尾</p>',{method:'clipboard'});
assert.ok(source);
const html=source.paragraphs.map(p=>p.html||'<p>'+p.text+'</p>').join('');
const text=source.paragraphs.map(p=>p.text).join('\n');
const browser=await chromium.launch({channel:'chromium'});
const context=await browser.newContext();let apiRequests=0,blockedMedia=0;
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){apiRequests++;await route.abort();return}
  if(url.hostname!=='127.0.0.1'){blockedMedia++;await route.abort();return}
  await route.continue();
});
try{
  const page=await context.newPage();await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:5173')+'/tests/qr-composer.html');
  await page.getByRole('button',{name:'打开导入',exact:true}).click();
  await page.getByRole('textbox',{name:'粘贴回答正文',exact:true}).evaluate((el,payload)=>{
    const clipboardData=new DataTransfer();clipboardData.setData('text/html',payload.html);clipboardData.setData('text/plain',payload.text);
    el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
  },{html,text});
  await page.getByLabel('导入原文预览').waitFor();
  assert.equal(await page.locator('.manual-browser').count(),0);
  assert.equal(await page.locator('details[open]').count(),0);
  await page.getByRole('button',{name:'加入本页',exact:true}).click();
  const saved=JSON.parse(await page.locator('#saved').innerText());
  const normalize=(value:string)=>value.replace(/\s/g,'');
  assert.equal(normalize(saved.paragraphs.map((p:{text:string})=>p.text).join('')),normalize(text));
  assert.equal(apiRequests,0);
  console.log(JSON.stringify({result:'PASS',material:file?'user-provided local HTML':'fixture',paragraphs:saved.paragraphs.length,textCharacters:text.length,apiRequests,blockedMedia,scope:'Real Svelte UI; supplied clipboard payload; remote requests blocked; complete supplied text retained. Not a live Zhihu fetch or proof that native copying includes every media file.'}));
}finally{await context.close();await browser.close()}
