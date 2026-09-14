import app from './app';
import type { RuntimeEnv } from './model';
// @ts-ignore resolved by the production build
import staticAssets from 'yida:static-assets';
export default {
  async fetch(request:Request,env:RuntimeEnv,ctx:any){
    if(new URL(request.url).pathname.startsWith('/api/'))return app.fetch(request,{...env,AUTH_REQUIRED:'true'},ctx);
    const pathname=new URL(request.url).pathname;
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    if(env.ASSETS){const response=await env.ASSETS.fetch(request);if(response.status!==404)return response}
    const asset=staticAssets[pathname==='/'?'/index.html':pathname];
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'}});
  }
};
