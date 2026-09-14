import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ManualBrowsers} from '../collector/manual';
const pages:import('playwright').Page[]=[];
const browser=await chromium.launch({channel:'chromium'}),original=browser.newContext.bind(browser);
let now=Date.now();
const windows=new ManualBrowsers(async()=>browser,()=>now);
const id='2079743429878216427',url='https://www.zhihu.com/question/2079351385255163833/answer/'+id;
// Product-owned test browser; all network content is a local fixture, no existing profiles or accounts.
browser.newContext=async options=>{
  const context=await original(options);context.on('page',page=>pages.push(page));
  await context.route('https://www.zhihu.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>body{margin:0}input{position:absolute;left:10px;top:10px;width:200px;height:30px}button{position:absolute;left:10px;top:60px;width:200px;height:30px}.AnswerItem{margin-top:120px}</style><input id="input"><h1 class="QuestionHeader-title">手动读取测试题目</h1><div class="AnswerItem" name="${id}"><div class="AuthorInfo-name">测试作者</div><div class="RichContent-inner"><p>第一段正文</p></div><button id="expand">展开阅读全文</button><a href="${url}">来源</a></div><div class="AnswerItem" name="999"><div class="RichContent-inner"><p>别人的回答不要导入</p></div></div><script>document.addEventListener('mousedown',()=>document.body.dataset.mouse='down');document.addEventListener('mousemove',e=>{if(e.buttons===1)document.body.dataset.mouse='move:'+e.clientX});document.addEventListener('mouseup',()=>document.body.dataset.mouse='up');document.getElementById('expand').onclick=function(){document.querySelector('.RichContent-inner').insertAdjacentHTML('beforeend','<p>已展开的完整末段</p><img data-original="https://picx.zhimg.com/original.png" src="https://picx.zhimg.com/small.png"><p>'+document.getElementById('input').value+'</p>');this.remove()}</script>`}));
  await context.route('https://picx.zhimg.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9sAAAAASUVORK5CYII=','base64')}));
  return context;
};
try{
  const first=await windows.create(url),second=await windows.create(url);
  assert.notEqual(first.id,second.id);assert.match(first.id,/^[a-f0-9]{64}$/);
  const frame=await windows.screen(first.id);assert.equal(frame[0],255);assert.equal(frame[1],216);
  await assert.rejects(()=>windows.capture(first.id),/展开/);
  await windows.action(first.id,{type:'pointer',phase:'down',x:40,y:25});
  assert.equal(await pages[0].locator('body').getAttribute('data-mouse'),'down');
  await windows.action(first.id,{type:'pointer',phase:'move',x:60,y:25});
  assert.equal(await pages[0].locator('body').getAttribute('data-mouse'),'move:60');
  await windows.action(first.id,{type:'pointer',phase:'up',x:60,y:25});
  assert.equal(await pages[0].locator('body').getAttribute('data-mouse'),'up');await windows.action(first.id,{type:'text',text:'本次人工输入'});
  await windows.action(first.id,{type:'click',x:50,y:75});
  const source=await windows.capture(first.id),html=source.paragraphs.map(p=>p.html).join('');
  assert.equal(source.id,'zhihu-'+id);assert.equal(source.author,'测试作者');assert.ok(html.includes('已展开的完整末段'));assert.ok(html.includes('本次人工输入'));assert.ok(html.includes('original.png'));assert.ok(!html.includes('small.png'));assert.ok(!html.includes('别人的回答'));assert.equal(source.imported?.completeness,'unverified');
  await assert.rejects(()=>windows.capture(second.id),/展开/);
  await windows.remove(first.id);await assert.rejects(()=>windows.screen(first.id),/过期/);
  now+=9*60000;await windows.screen(second.id);
  now+=2*60000;await windows.reap();await assert.rejects(()=>windows.screen(second.id),/过期/);
  console.log('PASS: manual window frame/input/explicit expansion/full target capture/original image/isolation/close/expiry. Fixture-backed, not a live authenticated Zhihu import.');
}finally{await windows.close()}
