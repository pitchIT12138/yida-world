import {mkdtemp,writeFile,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {unzipSync} from 'fflate';
import {richSource} from '../src/lib/rich-source';
import {createArchive,assetFromBytes,sha256} from '../src/lib/archive';
import {offlineReading} from '../src/lib/offline-reading';
import type {Answer,AnswerArtifact} from '../src/lib/types';
const dir=await mkdtemp(tmpdir()+'/yida-rebuild-'),browser=await chromium.launch({headless:true});
try{
 const source=richSource('<p>回退测试正文</p><p><img src="https://example.com/image.png"></p>',{method:'clipboard',title:'媒体回归测试'});source.imported!.completeness='confirmed';
 const asset=await assetFromBytes('https://example.com/image.png',new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')),'image/png');
 const artifact:AnswerArtifact={version:1,answerId:source.id,explanation:'测试用',blocks:[{id:'media',afterParagraphId:source.paragraphs[1].id,title:'原图测试',html:'<img data-source-image="https://example.com/image.png"><button id="go">改变</button><p id="out">初始</p>',css:'img{width:100px}',js:'document.querySelector("#go").onclick=()=>{document.querySelector("#out").textContent="已改变"}',height:200,mediaUrls:[asset.url],replaceParagraphIds:[source.paragraphs[1].id]}],bindings:[],scene:[],provenance:{method:'codex',tier:'session',runId:'local-regression',sourceHash:await sha256(new TextEncoder().encode(JSON.stringify(source))),model:'explicit test fixture',createdAt:new Date().toISOString(),prompt:'test only'}};
 const a:Answer={source,artifact,assets:[asset],votes:0,accent:'',tag:'test'};const archive=await createArchive(a);const files=unzipSync(archive);for(const [path,data]of Object.entries(files)){await mkdir(dir+'/'+path.split('/').slice(0,-1).join('/'),{recursive:true});await writeFile(dir+'/'+path,data)}
 const page=await browser.newPage();await page.goto(pathToFileURL(dir+'/index.html').href);const f=page.frameLocator('#media');await f.locator('#go').click();assert.equal(await f.locator('#out').innerText(),'已改变');await page.waitForFunction(()=>!(document.querySelector('details') as HTMLDetailsElement).open);await page.getByRole('button',{name:'只看原文'}).click();assert.equal(await page.locator('details').getAttribute('open'),'');assert.equal(await page.locator('#media').isVisible(),false);
 // A missing saved asset must keep the original visible instead of folding it.
 await writeFile(dir+'/missing.html','<!doctype html>'+offlineReading({...a,assets:[]},new Map([[asset.url,[...Object.keys(files)].find(p=>p.startsWith('media/'))!]])));
 await page.goto(pathToFileURL(dir+'/missing.html').href);
 await page.waitForFunction(()=>document.querySelector('iframe')?.getAttribute('data-failed')==='yes');
 assert.equal(await page.locator('details').getAttribute('open'),'');
 assert.equal(await page.locator('details img').evaluate(img=>(img as HTMLImageElement).naturalWidth),1);
 // Touch drag in the real image comparator, using saved original bytes and isolated iframe runtime.
 const dlss=JSON.parse(await readFile('artifacts/candidates/studio-eefcec7e-a1e9-45f9-81e3-4d3228feb20c.json','utf8'));
 const {StudioStore}=await import('../studio/store');const db=new StudioStore('.data/studio.sqlite');let images;try{images=(await db.list()).find(a=>a.source.id===dlss.source.id)!.assets}finally{db.close()}
 const {frameDocument}=await import('../src/lib/runtime');const block=dlss.artifact.blocks.find((b:any)=>b.mediaUrls?.length);const mobile=await browser.newPage({viewport:{width:360,height:850},hasTouch:true});await mobile.route('http://rebuild.local/',route=>route.fulfill({contentType:'text/html',body:'<iframe id="target" sandbox="allow-scripts" style="border:0;width:100%;height:800px"></iframe>'}));await mobile.goto('http://rebuild.local/');await mobile.locator('#target').evaluate((el,doc)=>(el as HTMLIFrameElement).srcdoc=doc,frameDocument(block,block.id,'http://rebuild.local',images));const mf=mobile.frameLocator('#target');const box=await mf.locator('#compare').boundingBox();assert.ok(box);await mobile.touchscreen.tap(box.x+box.width*.25,box.y+box.height*.5);assert.match(await mf.locator('#status').innerText(),/A 区域 25%；B 区域 75%/);await mobile.mouse.move(box.x+box.width*.25,box.y+box.height*.5);await mobile.mouse.down();await mobile.mouse.move(box.x+box.width*.75,box.y+box.height*.5,{steps:8});await mobile.mouse.up();assert.equal(await mf.locator('#status').innerText(),'A 区域 75%；B 区域 25%');await mf.locator('#both').click();assert.equal(await mf.locator('#status').innerText(),'A 区域 50%；B 区域 50%');await mkdir('artifacts/reviews/rebuild',{recursive:true});await mobile.screenshot({path:'artifacts/reviews/rebuild/dlss-touch.png'});
 console.log('离线图片注入、交互、原图折叠、只看原文、360px触摸与复位通过。');
}finally{await browser.close();await rm(dir,{recursive:true,force:true})}
