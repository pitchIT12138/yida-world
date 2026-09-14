import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';
import app from './server/app';
import {StudioStore} from './studio/store';
import {studioAPI} from './studio/api';
import {LocalWorkspace} from './server/local-workspace';
export default defineConfig(({mode})=>({
  resolve:process.env.VITEST?{conditions:['browser']}:undefined,
  plugins:[svelte(),{
    name:'yida-api',
    configureServer(server){
      if(process.env.VITEST)return;
      const studio=new StudioStore(process.env.STUDIO_DB||'.data/studio.sqlite');const internal=studioAPI(studio);
      server.httpServer?.once('close',()=>studio.close());
      const workspace=new LocalWorkspace('.data/workspace.sqlite');
      server.httpServer?.once('close',()=>workspace.close());
      server.middlewares.use('/api',async(req,res)=>{
        try{
          const vars=existsSync('.dev.vars')?parse(readFileSync('.dev.vars')):{};
          const env={...process.env,...loadEnv(mode,process.cwd(),''),...vars};
          if(!env.COLLECTOR_URL&&existsSync('.cache/collector/token')){
            env.COLLECTOR_URL='http://127.0.0.1:7337';env.COLLECTOR_TOKEN=readFileSync('.cache/collector/token','utf8').trim();
          }
          const controller=new AbortController();res.on('close',()=>controller.abort());
          const chunks:Buffer[]=[];let size=0;
          for await(const chunk of req){size+=chunk.length;if(size>((req.url?.startsWith('/workspace')||req.url?.startsWith('/studio'))?150000000:18000000)){res.statusCode=413;res.end('Request too large');return}chunks.push(chunk)}
          const headers=new Headers();
          for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
          const request=new Request('http://'+req.headers.host+'/api'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:Buffer.concat(chunks),signal:controller.signal});
          const response=request.url.includes('/api/studio')?await internal.fetch(new Request(request.url.replace('/api/studio',''),request)):await app.fetch(request,{...env,WORKSPACE_STORE:workspace} as any);
          res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));
          if(response.body){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;if(res.destroyed){await reader.cancel();break}res.write(value)}}
          res.end();
        }catch{if(!res.headersSent)res.statusCode=500;res.end('Local API request failed')}
      });
    }
  }],
  build:{outDir:'dist/client',emptyOutDir:true},
  test:{include:['tests/**/*.test.ts']}
}));
