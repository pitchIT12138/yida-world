import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:740,height:1000}});
const errors:string[]=[],mediaRequests:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().includes('/src/data/generated/'))mediaRequests.push(r.url())});
page.setDefaultTimeout(30000);
try{
 await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:5173')+'/');
 await page.getByRole('tab',{name:'已生成 17',exact:true}).waitFor();
 await page.locator('[data-block="dlss-pair-1"] iframe').waitFor();
 assert.equal(mediaRequests.length,1,'First article originals load immediately; other article bundles remain lazy');
 await page.getByRole('textbox',{name:'搜索本页回答'}).fill('DLSS');
 const card=page.locator('article.answer-card');
 await card.getByText('媒体 22 / 22 已保存 · 待核对／补全',{exact:true}).waitFor();
 assert.equal(mediaRequests.length,1,'Load only the selected article’s original media');

 const block=card.locator('[data-block="dlss-pair-1"]');
 await block.scrollIntoViewIfNeeded();
 const iframe=block.frameLocator('iframe');
 await iframe.locator('#both').click();
 assert.equal(await iframe.locator('#status').innerText(),'A 区域 50%；B 区域 50%');
 await card.locator('details.original-media').first().waitFor();
 assert.equal(await card.locator('details.original-media').first().getAttribute('open'),null);
 await card.getByRole('button',{name:'完整原文',exact:true}).click();
 assert.equal(await card.locator('details.original-media').count(),0);
 assert.equal(await block.isVisible(),false);
 assert.equal(await card.locator('.source-rich img').count(),22);
 await card.getByRole('button',{name:'互动阅读',exact:true}).click();
 await block.scrollIntoViewIfNeeded();
 await iframe.locator('#both').click();
 await mkdir('artifacts/reviews/rebuild',{recursive:true});
 for(const width of [740,360]){
  await page.setViewportSize({width,height:1000});await block.scrollIntoViewIfNeeded();
  await iframe.locator('#both').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow at '+width);
  assert.ok(await iframe.locator('body').evaluate(b=>b.scrollWidth<=b.clientWidth+1),'iframe overflow at '+width);
  await page.screenshot({path:`artifacts/reviews/rebuild/dlss-product-${width}.png`});
 }
 await page.getByRole('textbox',{name:'搜索本页回答'}).fill('国考');

 const last=card.locator('[data-block]').last();await last.scrollIntoViewIfNeeded();
 await last.locator('iframe').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'long article overflow');
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/reviews/rebuild/product-reading.json',JSON.stringify({checkedAt:new Date().toISOString(),widths:[740,360],initialMediaRequests:1,selectedArticleMediaRequests:mediaRequests.length,checks:['lazy saved originals','22 saved images','image comparison reset','fold originals only after successful interaction','restore original mode','long article end and horizontal overflow'],errors},null,2));
 console.log('Product reading: lazy original media, image comparison, original toggle, 740/360px layout and long article passed.');
}finally{await browser.close()}
