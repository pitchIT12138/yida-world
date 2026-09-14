import { build } from 'esbuild';
import { mkdir, copyFile, readdir, readFile, cp, stat } from 'node:fs/promises';
import path from 'node:path';
await mkdir('dist/server',{recursive:true});
const assets={};
async function collect(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const filename=path.join(dir,entry.name);
    if(entry.isDirectory())await collect(filename);
    else{
      const type={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(filename)];
      if(!type)throw new Error('Unexpected asset type: '+filename);
      assets['/'+path.relative('dist/client',filename)]={body:await readFile(filename,'utf8'),type};
    }
  }
}
await collect('dist/client');
await build({entryPoints:['server/worker.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:true,plugins:[{name:'inline-static-fallback',setup(b){b.onResolve({filter:/^yida:static-assets$/},()=>({path:'assets',namespace:'yida'}));b.onLoad({filter:/.*/,namespace:'yida'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}))}}]});
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');

try{await stat('drizzle');await cp('drizzle','dist/.openai/drizzle',{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e}
