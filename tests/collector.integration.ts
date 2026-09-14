import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ZhihuReader} from '../collector/reader';

// This validates the product renderer, not the user's existing Chrome session.
const browser=await chromium.launch({channel:'chromium'}),context=await browser.newContext();
const reader=new ZhihuReader('.cache/collector-test',false,async()=>context);
const id='2079743429878216427',url='https://www.zhihu.com/question/2079351385255163833/answer/'+id;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9sAAAAASUVORK5CYII=','base64');
let navigations=0;
await context.route('https://picx.zhimg.com/**',route=>route.fulfill({contentType:'image/png',body:png}));
await context.route('https://www.zhihu.com/**',async route=>{
  navigations++;
  const request=new URL(route.request().url());
  if(!request.searchParams.has('rendered'))return route.fulfill({status:403,contentType:'text/html; charset=utf-8',body:'<meta id="zh-zse-ck"><script>setTimeout(()=>location.assign(location.pathname+"?rendered=1"),50)</script>'});
  const meta=JSON.stringify({itemId:id,title:'实际渲染测试题目',authorName:'测试作者'});
  const expanded='<p>点击展开后的完整末段</p><figure><img data-original="https://picx.zhimg.com/original.png" src="https://picx.zhimg.com/thumbnail.png"><figcaption>原图说明</figcaption></figure>';
  return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><h1 class="QuestionHeader-title">实际渲染测试题目</h1><div class="AnswerItem" name="${id}" data-zop='${meta}'><div class="RichContent-inner"><p>第一段完整正文</p></div><button id="expand">展开阅读全文</button><a href="${url}">回答来源</a></div><div class="AnswerItem" name="999"><div class="RichContent-inner"><p>不应混入其他回答</p></div></div><script>document.getElementById('expand').onclick=function(){document.querySelector('.RichContent-inner').insertAdjacentHTML('beforeend',${JSON.stringify(expanded)});this.remove();}</script>`});
});
try{
  const source=await reader.read(url,new AbortController().signal);
  assert.ok(navigations>=2,'normal JS navigation must execute');assert.equal(source.id,'zhihu-'+id);assert.equal(source.author,'测试作者');assert.equal(source.paragraphs.length,3);
  const html=source.paragraphs.map(p=>p.html).join('');assert.ok(html.includes('点击展开后的完整末段'));assert.ok(html.includes('https://picx.zhimg.com/original.png'));assert.ok(!html.includes('thumbnail.png'));assert.ok(!html.includes('不应混入其他回答'));
  assert.equal(source.imported?.completeness,'unverified');
  console.log('PASS: product Chromium renderer follows a JS navigation, expands the target answer, retains full body/original image, and excludes other answers. Fixture-backed; not a live Zhihu success.');
}finally{await reader.close();await browser.close()}
