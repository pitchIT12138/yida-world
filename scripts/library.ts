import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {publicCandidate} from '../server/curation';
import {verifyInteractive} from '../studio/verify';
import type {InteractionRecipe} from '../src/lib/interaction-library';
import {argument} from './generation-api';
const command=process.argv[2];
if(command==='add'){
 const item=publicCandidate(JSON.parse(await readFile(argument('file'),'utf8')));
 const meta=JSON.parse(await readFile(argument('meta'),'utf8'));const blockIds=argument('blocks').split(',');
 if(!/^[a-z0-9-]{1,70}$/.test(meta.id)||!/^\d{1,5}$/.test(meta.version)||Number(meta.version)<1)throw Error('组件 id 或版本无效');
 for(const field of ['title','goal','when','avoid','guidance'])if(typeof meta[field]!=='string'||!meta[field].trim())throw Error('缺少 '+field);
 if(!Array.isArray(meta.tags)||!meta.tags.length||meta.tags.some((t:unknown)=>typeof t!=='string'||!t)||!Array.isArray(meta.parameters)||!Array.isArray(meta.checks)||!meta.checks.length)throw Error('缺少标签、参数或验收条件');
 const blocks=blockIds.map(id=>{const b=item.artifact.blocks.find(b=>b.id===id);if(!b)throw Error('组件块不存在');return b});
 const evidence=await verifyInteractive(item.artifact,JSON.parse(await readFile(argument('checks'),'utf8')),item.assets);
 const recipe:InteractionRecipe={id:meta.id,version:meta.version,title:meta.title,tags:meta.tags,goal:meta.goal,when:meta.when,avoid:meta.avoid,guidance:meta.guidance,parameters:meta.parameters,checks:meta.checks,source:{answerId:item.source.id,runId:item.artifact.provenance.runId},blocks,bindings:item.artifact.bindings,scene:item.artifact.scene.filter(s=>blockIds.includes(s.target))};
 const dir='library/interactions/'+recipe.id;await mkdir(dir,{recursive:true});await writeFile(dir+'/'+recipe.version+'.json',JSON.stringify(recipe,null,2),{flag:'wx'});await writeFile(dir+'/'+recipe.version+'.review.json',JSON.stringify(evidence,null,2),{flag:'wx'});console.log('组件已入库，旧版本不覆盖');
}else if(command!=='sync')throw Error('支持 add --file --blocks --meta --checks 或 sync');
// All versions remain resolvable, newest versions are selected for generation.
const all:InteractionRecipe[]=[];for(const id of await readdir('library/interactions'))for(const file of (await readdir('library/interactions/'+id)).filter(f=>/^\d+\.json$/.test(f)))all.push(JSON.parse(await readFile('library/interactions/'+id+'/'+file,'utf8')));
await writeFile('src/data/interactions/catalog.json',JSON.stringify(all,null,2));console.log('已同步 '+all.length+' 个组件版本');
