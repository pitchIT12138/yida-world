import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

// Actual session-authored candidates in the shared AnswerCard and sandbox.
const browser=await chromium.launch({channel:'chromium'});
const page=await browser.newPage({viewport:{width:1100,height:1100}});
page.setDefaultTimeout(10000);
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
const birthday=page.locator('article#birthday'),redis=page.locator('article#redis');
const compare=birthday.frameLocator('iframe[title="同样的人数，两个不同的问题"]');
const experiment=birthday.frameLocator('iframe[title="理论概率，会怎样出现在重复实验中？"]');
const latency=redis.frameLocator('iframe[title="相同的命令，等待占了多少？"]');
const boundary=redis.frameLocator('iframe[title="分几批，以及何时不能合成一批"]');
async function click(locator:ReturnType<typeof page.locator>){await locator.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await locator.click()}
async function textIs(locator:ReturnType<typeof page.locator>,value:string){await locator.filter({hasText:value}).waitFor();assert.equal(await locator.innerText(),value)}
try{
  await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:5173')+'/tests/flow.html');
  await page.getByRole('link',{name:'redis · 启动通过',exact:true}).waitFor({timeout:30000});
  for(const card of [birthday,redis]){const more=card.getByRole('button',{name:/继续阅读/});if(await more.count())await more.click()}
  for(const id of ['birthday-compare','birthday-experiment','redis-compare','redis-boundary']){
    const block=page.locator('[data-block="'+id+'"]');await block.scrollIntoViewIfNeeded();await block.locator('iframe').waitFor();
  }
  await textIs(compare.locator('#any'),'50.7%');await textIs(compare.locator('#me'),'5.9%');await textIs(compare.locator('#pairs'),'253');
  await click(compare.locator('#fifty'));await textIs(compare.locator('#any'),'97.0%');await textIs(compare.locator('#me'),'12.6%');await textIs(compare.locator('#pairs'),'1225');await textIs(experiment.locator('#n-label'),'50');
  await click(experiment.locator('#run'));
  assert.match(await experiment.locator('#count').innerText(),/^1000 轮 · \d+ 轮出现同日$/);
  const hits=Number((await experiment.locator('#count').innerText()).match(/· (\d+)/)![1]);
  assert.equal(await experiment.locator('#observed').innerText(),(hits/10).toFixed(1)+'%');
  await click(compare.locator('#reset'));
  await textIs(compare.locator('#any'),'50.7%');await textIs(experiment.locator('#count'),'0 轮 · 0 轮出现同日');
  for(let i=0;i<10;i++)await click(experiment.locator('#run'));assert.equal(await experiment.locator('#run').isDisabled(),true);
  await click(experiment.locator('#clear'));assert.equal(await experiment.locator('#run').isDisabled(),false);
  await textIs(latency.locator('#serial'),'492 ms');await textIs(latency.locator('#pipeline'),'92 ms');
  assert.match(await latency.locator('#saving').innerText(),/节省 400 ms/);
  await boundary.locator('#batch').fill('2');await textIs(boundary.locator('#total'),'3 次往返，共 252 ms');
  await boundary.locator('#dependent').check();await textIs(boundary.locator('#total'),'6 次往返，共 492 ms');assert.equal(await boundary.locator('#batch').isDisabled(),true);
  await click(boundary.locator('#reset'));await textIs(boundary.locator('#total'),'1 次往返，共 92 ms');
  await click(latency.locator('#low'));await textIs(latency.locator('#serial'),'18 ms');await textIs(latency.locator('#pipeline'),'13 ms');await textIs(boundary.locator('#total'),'1 次往返，共 13 ms');
  await click(latency.locator('#heavy'));await textIs(latency.locator('#serial'),'360 ms');await textIs(latency.locator('#pipeline'),'310 ms');
  await latency.locator('#commands').fill('1');await textIs(latency.locator('#serial'),'60 ms');await textIs(latency.locator('#pipeline'),'60 ms');
  await click(latency.locator('#original'));
  await mkdir('artifacts/reviews/session-v3',{recursive:true});
  await birthday.screenshot({path:'artifacts/reviews/session-v3/birthday-desktop.png'});
  await redis.screenshot({path:'artifacts/reviews/session-v3/redis-desktop.png'});
  await page.setViewportSize({width:390,height:1000});
  // Scroll each lazy iframe into view and wait for its measured height to reach the host.
  for(const id of ['birthday-compare','birthday-experiment','redis-compare','redis-boundary']){
    const element=page.locator('[data-block="'+id+'"] iframe');await element.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    const frame=await (await element.elementHandle())!.contentFrame();
    const height=await frame!.locator('body').evaluate(body=>Math.ceil(body.getBoundingClientRect().height));
    await page.waitForFunction(({id,height})=>document.querySelector<HTMLIFrameElement>('[data-block="'+id+'"] iframe')!.clientHeight>=height-1,{id,height});
    await frame!.evaluate(()=>window.scrollTo(0,0));
  }
  for(const frame of [compare,experiment,latency,boundary]){
    const size=await frame.locator('body').evaluate(body=>({scroll:body.scrollWidth,width:body.clientWidth,minFont:Math.min(...[...body.querySelectorAll('p,button,label')].map(el=>parseFloat(getComputedStyle(el).fontSize)))}));
    assert.ok(size.scroll<=size.width+1,JSON.stringify(size));assert.ok(size.minFont>=14,JSON.stringify(size));
  }
  await birthday.screenshot({path:'artifacts/reviews/session-v3/birthday-mobile.png'});
  await redis.screenshot({path:'artifacts/reviews/session-v3/redis-mobile.png'});
  await page.locator('[data-block="redis-compare"]').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await latency.locator('h3').waitFor();
  assert.equal(await latency.locator('h3').evaluate(el=>window.scrollY),0);
  await page.screenshot({path:'artifacts/reviews/session-v3/redis-mobile-visible.png'});
  for(const [card,steps] of [[birthday,6],[redis,7]] as const){
    await click(card.getByRole('button',{name:'看看它怎么变成这样的',exact:true}));
    for(let step=1;step<steps;step++){
      await click(card.getByRole('button',{name:'下一步',exact:true}));
      await card.getByText('已触发真实操作，请看文中的变化。',{exact:true}).waitFor();
    }
    await click(card.getByRole('button',{name:'结束讲解',exact:false}));
  }
  // Also inspect each block at exactly 320 CSS pixels, independently of host margins.
  for(const id of ['birthday-compare','birthday-experiment','redis-compare','redis-boundary']){
    const element=page.locator('[data-block="'+id+'"] iframe');
    await element.evaluate(el=>{(el as HTMLElement).style.width='320px'});
    const frame=await (await element.elementHandle())!.contentFrame();
    assert.ok(await frame!.locator('body').evaluate(body=>body.scrollWidth<=body.clientWidth+1),id+' overflow at 320px');
  }
  assert.deepEqual(errors,[]);assert.equal(await page.getByText(/运行错误|宿主异常/).count(),0);
  console.log('PASS: actual v3 candidates; birthday formulas, event comparison, 10,000-run cap/reset and shared state; Redis formulas, same-scale inputs, batch/dependency boundary and shared state; narrow layouts and 14px minimum labels. Screenshots saved for visual inspection. No model API call.');
}catch(error){console.error('Candidate UI failure',errors);throw error}finally{await browser.close()}
