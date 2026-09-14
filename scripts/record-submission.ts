// Public product demonstration in a clean test browser. No mocked data or account.
import {chromium,type Page,type FrameLocator} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/submission-final/raw',base='https://yida-world.zackguo.chatgpt.site';await mkdir(dir,{recursive:true});
const browser=await chromium.launch(),shots:any[]=[];
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function record(name:string,id:string,block:string,action:(p:Page,f:FrameLocator)=>Promise<void>){
 const context=await browser.newContext({viewport:{width:1600,height:1200},recordVideo:{dir,size:{width:1600,height:1200}}}),epoch=Date.now(),p=await context.newPage();
 await p.goto(base+'/#'+id);const card=p.locator('#'+id),area=card.locator('[data-block="'+block+'"]');await area.scrollIntoViewIfNeeded();const f=area.frameLocator('iframe');await f.locator('body').waitFor();
 if(block==='dlss-pair-1')await f.locator('#after').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth?Promise.resolve():new Promise<void>(resolve=>img.addEventListener('load',()=>resolve(),{once:true})));
 await area.evaluate(e=>window.scrollTo(0,window.scrollY+e.getBoundingClientRect().top-85));await pause(1000);
 const start=(Date.now()-epoch)/1000;await pause(1500);await action(p,f);await pause(2500);const duration=(Date.now()-epoch)/1000-start;
 await p.screenshot({path:'artifacts/submission-final/'+name+'.png'});const video=p.video()!;await context.close();const path=await video.path();shots.push({name,id,block,path,start,duration,source:base,actualBrowserActions:true});await writeFile(dir+'/manifest.json',JSON.stringify(shots,null,2));console.log(name+' recorded '+duration.toFixed(1)+'s');
}
try{
 await record('01-dlss','studio-eefcec7e-a1e9-45f9-81e3-4d3228feb20c','dlss-pair-1',async(p,f)=>{
  const box=(await f.locator('#compare').boundingBox())!;await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width*.18,box.y+box.height/2,{steps:60});await pause(1000);await p.mouse.move(box.x+box.width*.82,box.y+box.height/2,{steps:90});await p.mouse.up();await pause(1200);
  await f.locator('#zoom').focus();for(let i=0;i<10;i++){await p.keyboard.press('ArrowRight');await pause(80)}await pause(1500);await f.locator('#side').click();await pause(2000);await f.locator('#wipe').click();await pause(1000);
 });
 await record('02-cash','studio-3d0c8ad5-ea44-4f61-9530-f086b7135a6f','cash-river',async(p,f)=>{
  assert.equal(await f.locator('#pv').innerText(),'1,136,086.59 元');await f.locator('#save-a').click();await pause(800);await f.locator('#river').focus();for(let i=0;i<6;i++){await p.keyboard.press('ArrowRight');await pause(150)}for(let i=0;i<12;i++){await p.keyboard.press('ArrowUp');await pause(110)}await pause(1600);await f.locator('#rate').fill('8');await pause(2000);await f.locator('#income').fill('85000');await pause(2000);await f.locator('#undo-year').click();await pause(1000);
 });
 await record('03-population','studio-baa43112-f206-4e48-86d1-3d1427326601','population-crowd',async(p,f)=>{
  await f.locator('#save-a').click();await pause(1000);await f.locator('#y2035').click();await pause(2500);await f.locator('#older').fill('4.8');await pause(2500);await f.locator('#working').fill('7');await pause(2000);await f.locator('#transfer').click();await pause(1500);
 });
 await record('04-story','story-1747681485547843585','door-encounter',async(p,f)=>{
  await f.locator('#advance').click();await pause(1200);await f.locator('[data-look="figure"]').click();await pause(1600);await f.locator('#view').click();await pause(2500);await f.locator('#advance').click();await pause(2000);await f.locator('#advance').click();await pause(1700);await f.locator('#view').click();await pause(1500);
 });
 await record('05-source','studio-eefcec7e-a1e9-45f9-81e3-4d3228feb20c','dlss-pair-1',async(p,f)=>{
  const card=p.locator('#studio-eefcec7e-a1e9-45f9-81e3-4d3228feb20c');await f.locator('#position').focus();for(let i=0;i<20;i++)await p.keyboard.press('ArrowRight');const state=await f.locator('#position').inputValue();await card.getByRole('button',{name:'完整原文',exact:true}).click();await pause(3000);await card.getByRole('button',{name:'互动阅读',exact:true}).click();await pause(1000);await card.locator('[data-block="dlss-pair-1"]').scrollIntoViewIfNeeded();assert.equal(await f.locator('#position').inputValue(),state);await pause(2500);
 });
}finally{await browser.close()}
