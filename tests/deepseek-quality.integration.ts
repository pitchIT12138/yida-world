import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const dir='artifacts/deepseek-evaluation/2026-09-14T13-54-51-571Z';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:740,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/tests/model-review.html?candidate='+dir+'/candidate.json');
 await page.getByRole('button',{name:/继续阅读/}).click();
 const incomeBlock=page.locator('[data-block="dcf-income"]'),presentBlock=page.locator('[data-block="dcf-present"]');
 await incomeBlock.scrollIntoViewIfNeeded();const income=incomeBlock.frameLocator('iframe');
 await income.locator('#hours').fill('8');assert.equal(await income.locator('#year-income').innerText(),'43,800 元');
 await presentBlock.scrollIntoViewIfNeeded();const present=presentBlock.frameLocator('iframe');await present.locator('#reset').click();
 const downstreamIncome=await present.locator('#income').inputValue();assert.equal(downstreamIncome,'65700');
 await present.locator('#years').fill('61');
 const visibleYears=await present.locator('#years').inputValue(),computedRows=await present.locator('#rows tr').count();
 assert.equal(visibleYears,'61');assert.equal(computedRows,60);
 await present.locator('#reset').click();await present.locator('summary').click();assert.equal(await present.locator('#rows tr').count(),30);
 for(const width of [740,360]){await page.setViewportSize({width,height:1000});await presentBlock.scrollIntoViewIfNeeded();await present.locator('#reset').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:dir+'/preview-'+width+'.png'})}
 await page.getByRole('button',{name:'看看它怎么变成这样的',exact:true}).click();await page.getByRole('button',{name:'下一步',exact:true}).click();await page.getByText('已触发真实操作，请看文中的变化。',{exact:true}).waitFor();
 await page.getByRole('button',{name:/结束讲解/}).click();
 await page.getByRole('button',{name:'当前精选版',exact:true}).click();await page.getByText('Codex 会话生成',{exact:false}).waitFor();
 assert.deepEqual(errors,[]);
 await writeFile(dir+'/quality-review.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'actual AnswerCard and sandbox; unmodified API output',passed:['formula checks in browser-review.json','740/360px page layout','30 yearly table rows','actual scene demo receipt','switch to existing curated version'],issues:[{severity:'improvement',finding:'上方工时改为8小时，年收入43800；下方折现首年收入仍为65700。两个交互没有状态联动。',observed:{upstreamIncome:43800,downstreamIncome}},{severity:'bug',finding:'输入61年时仍显示61，但实际只计算60行，未说明截断。',observed:{visibleYears,computedRows}}],promoted:false,errors},null,2));
 console.log('Quality review saved: normal calculations pass; cross-block linkage and out-of-range input need improvement. Original API output preserved.');
}finally{await browser.close()}
