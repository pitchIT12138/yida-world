import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4217';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'只看原文',exact:true}).first().waitFor();
 const sources=await page.locator('.answer-card .source-meta').allTextContents();
 const firstExample=sources.findIndex(s=>s.includes('原创示例'));
 assert.equal(firstExample,7);assert.ok(sources.slice(firstExample).every(s=>s.includes('原创示例')));
 assert.equal((await page.locator('.related a').allTextContents()).length,4);
 for(const width of [740,360]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await mkdir('artifacts/deepseek-evaluation/release',{recursive:true});await page.screenshot({path:`artifacts/deepseek-evaluation/release/order-${width}.png`})}
 const config=await (await page.request.get(base+'/api/config')).json();assert.equal(config.generationEnabled,true);assert.deepEqual(config.tiers,['balanced']);
 const hidden={studio:(await page.request.get(base+'/studio/')).status(),tests:(await page.request.get(base+'/tests/flow.html')).status()};assert.equal(hidden.studio,404);assert.equal(hidden.tests,404);
 assert.deepEqual(errors,[]);await writeFile('artifacts/deepseek-evaluation/release/smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),realAnswersBeforeExamples:firstExample,widths:[740,360],config,internalRoutes:hidden,errors},null,2));
 console.log('Production: 7 real sources before 10 fictional examples, mobile layout, model config and private route exclusion passed.');
}finally{await browser.close()}
