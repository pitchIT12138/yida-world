import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {StudioStore} from '../studio/store';
import {verifyInteractive} from '../studio/verify';
import {interactionLibrary,validateLibraryReferences} from '../src/lib/interaction-library';
import type {AnswerArtifact} from '../src/lib/types';
const dir=await mkdtemp(tmpdir()+'/studio-ui-');process.env.STUDIO_DB=dir+'/studio.sqlite';process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING='true';
const server=await createServer({server:{host:"127.0.0.1",port:5189,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5189/studio/');await page.getByText('已读取本地素材库').waitFor();
 await page.getByLabel('标题',{exact:true}).fill('内部试验文章');await page.getByLabel('作者',{exact:true}).fill('试验作者');
 await page.getByLabel('正文',{exact:true}).evaluate(el=>{const data=new DataTransfer();data.setData('text/html','<p>第一段：比较两个条件。</p><p><strong>第二段</strong>：验证机制。</p>');data.setData('text/plain','第一段：比较两个条件。\n第二段：验证机制。');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))});
 await page.getByRole('button',{name:'保存原文',exact:true}).click();await page.getByText('已保存到本地后台').waitFor();
 await page.getByLabel('整体可视化想法').fill('先做比较，再解释结果');await page.getByRole('button',{name:'＋ 给这段加备注'}).first().click();await page.getByLabel('段落备注',{exact:true}).fill('此段使用参数实验');await page.getByText('已保存到本地后台').waitFor();await page.waitForTimeout(700);
 await page.reload();await page.getByRole('button',{name:/内部试验文章/}).click();assert.equal(await page.getByLabel('整体可视化想法').inputValue(),'先做比较，再解释结果');assert.equal(await page.getByLabel('段落备注',{exact:true}).inputValue(),'此段使用参数实验');assert.equal(await page.locator('.preview strong').first().innerText(),'第二段');
 // A second connection simulates an assistant or another browser writing first.
 const db=new StudioStore(process.env.STUDIO_DB!);let a=(await db.list())[0] as any;a.workspace.idea='另一个窗口更新';await db.saveRecord(a,a.workspace.revision,'draft');db.close();
 await page.getByLabel('整体可视化想法').fill('冲突窗口草稿');await page.getByRole('alert').filter({hasText:'另一个窗口'}).waitFor();assert.match(await page.evaluate(async()=>{const path='/src/lib/storage.ts';return (await import(path)).readLocal('studio-pending','')}),/冲突窗口草稿/);
 // Preserve explicit pending data, then use clean context to verify authoritative state.
 const clean=await browser.newPage();await clean.goto('http://127.0.0.1:5189/studio/');await clean.getByRole('button',{name:/内部试验文章/}).click();assert.equal(await clean.getByLabel('整体可视化想法').inputValue(),'另一个窗口更新');
 await clean.getByLabel('正文',{exact:true}).fill('修改后的段落。\n\n第二段：验证机制。');await clean.getByRole('button',{name:'保存原文',exact:true}).click();await clean.getByText('原段落已变化，请重新关联').waitFor();await clean.getByRole('button',{name:'查看版本历史'}).click();await clean.locator('.version').last().click();await clean.getByText('正在查看历史版本').waitFor();
 await mkdir('artifacts/reviews/studio',{recursive:true});await clean.screenshot({path:'artifacts/reviews/studio/desktop.png',fullPage:true});await clean.setViewportSize({width:390,height:844});await clean.screenshot({path:'artifacts/reviews/studio/mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 for(const [name,blockId,selector,output,expected] of [['birthday','birthday-compare','#fifty','#any','97.0%'],['redis','redis-compare','#low','#serial','18 ms']]){
 const envelope=JSON.parse(await readFile('src/data/generated/'+name+'.json','utf8'));const artifact=envelope.artifact as AnswerArtifact;
 const recipe=interactionLibrary.find(r=>r.blocks[0].id===blockId)!;artifact.blocks=structuredClone(recipe.blocks);artifact.bindings=structuredClone(recipe.bindings);artifact.scene=structuredClone(recipe.scene);artifact.design=undefined;artifact.libraryReferences=[{id:recipe.id,version:recipe.version,mode:'reuse',changes:'验收原实现直接复用',blockIds:[blockId]}];validateLibraryReferences(artifact);
 const evidence=await verifyInteractive(artifact,[{blockId,action:'click',selector,expect:{selector:output,text:expected}}]);await writeFile('artifacts/reviews/studio/'+recipe.id+'.json',JSON.stringify({source:recipe.source,recipeId:recipe.id,version:recipe.version,...evidence},null,2));
 if(name==='birthday'){const adapted=structuredClone(artifact);adapted.answerId='birthday-classroom';const adaptedBlock=adapted.blocks.find(b=>b.id===blockId)!;adaptedBlock.js=adaptedBlock.js.replaceAll("23","30");adaptedBlock.html=adaptedBlock.html.replaceAll("23","30");adapted.libraryReferences![0]={...adapted.libraryReferences![0],mode:'adapt',changes:'课堂案例默认人数和重置改为30人，保留独立均匀生日模型与比较公式'};validateLibraryReferences(adapted);await verifyInteractive(adapted,[{blockId,action:'click',selector:'#reset',expect:{selector:'#any',text:'70.6%'}},{blockId,action:'click',selector,expect:{selector:output,text:expected}}])}
 }
 console.log('工作台粘贴、保存恢复、冲突、失效备注、历史与两类组件桌面/手机交互通过；测试数据未加入精选。');
}finally{await browser.close();await server.close();await rm(dir,{recursive:true,force:true})}
