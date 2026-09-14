import {Hono} from 'hono';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import type {RuntimeEnv} from './model';
import {digest} from './cloud';
export type Identity={id:string;name:string;avatar:string};
export function authConfigured(env:RuntimeEnv){return !!(env.DB&&env.ZHIHU_APP_ID&&env.ZHIHU_APP_KEY&&env.ZHIHU_REDIRECT_URI)}
export async function identity(request:Request,env:RuntimeEnv):Promise<Identity|undefined>{
 if(!env.DB)return;const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('yida_session='))?.slice(13);
 if(!cookie||!/^[a-f0-9-]{36}$/.test(cookie))return;
 return await env.DB.prepare('SELECT users.id,users.name,users.avatar FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?').bind(await digest(cookie),Date.now()).first<Identity>()||undefined;
}
export async function runner(request:Request,env:RuntimeEnv){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return !!env.RUNNER_TOKEN&&!!token&&await digest(token)===await digest(env.RUNNER_TOKEN)}
export function parseProfile(raw:string):Identity{
 // Protect decimal int64 identities before JSON.parse. Prefer the provider's string hash_id.
 const data=JSON.parse(raw.replace(/("(?:uid|id|user_id)"\s*:\s*)(\d{16,})(?=\s*[,}])/g,'$1"$2"'));
 const value=data.data||data.Data||data;if(data.code&&![0,20000].includes(data.code))throw Error('知乎账户资料读取失败');
 const id=value.hash_id||value.uid;if((typeof id!=='string'&&typeof id!=='number')||!String(id).match(/^[a-zA-Z0-9_-]{1,100}$/)||typeof id==='number'&&!Number.isSafeInteger(id))throw Error('知乎账户没有有效身份标识');
 return {id:'zhihu:'+id,name:String(value.fullname||value.name||'知友').slice(0,80),avatar:typeof value.avatar_path==='string'&&value.avatar_path.startsWith('https://')?value.avatar_path:''};
}
export const authRoutes=new Hono<{Bindings:RuntimeEnv}>();
authRoutes.get('/session',async c=>c.json({user:await identity(c.req.raw,c.env)||null,configured:authConfigured(c.env),required:c.env.AUTH_REQUIRED==='true'}));
authRoutes.get('/login',async c=>{
 if(!authConfigured(c.env))return c.text('知乎登录尚未配置，当前可以直接阅读精选。',503);
 const redirect=new URL(c.env.ZHIHU_REDIRECT_URI!);if(redirect.origin!==new URL(c.req.url).origin)return c.text('登录回调域名与当前网站不一致。',503);
 const state=crypto.randomUUID(),browser=crypto.randomUUID();
 await c.env.DB!.prepare('INSERT INTO oauth_states(hash,browser_hash,expires) VALUES(?,?,?)').bind(await digest(state),await digest(browser),Date.now()+600000).run();
 setCookie(c,'yida_oauth',browser,{httpOnly:true,secure:true,sameSite:'Lax',path:'/api/auth',maxAge:600});
 const url=new URL('https://openapi.zhihu.com/authorize');url.search=new URLSearchParams({app_id:c.env.ZHIHU_APP_ID!,redirect_uri:redirect.href,response_type:'code',state}).toString();return c.redirect(url.href);
});
authRoutes.get('/callback',async c=>{
 try{
  if(!authConfigured(c.env))return c.text('知乎登录尚未配置。',503);
  const state=c.req.query('state'),browser=getCookie(c,'yida_oauth'),code=c.req.query('authorization_code')||c.req.query('code');
  if(!state||!browser||!code||state.length>100||code.length>2000)throw Error('登录凭证缺失，请重新登录');
  const consumed=await c.env.DB!.prepare('DELETE FROM oauth_states WHERE hash=? AND browser_hash=? AND expires>? RETURNING hash').bind(await digest(state),await digest(browser),Date.now()).first();
  deleteCookie(c,'yida_oauth',{path:'/api/auth'});if(!consumed)throw Error('登录请求已过期或不匹配，请重新登录');
  const response=await fetch('https://openapi.zhihu.com/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({app_id:c.env.ZHIHU_APP_ID!,app_key:c.env.ZHIHU_APP_KEY!,grant_type:'authorization_code',redirect_uri:c.env.ZHIHU_REDIRECT_URI!,code}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('知乎授权暂不可用');const payload=await response.json() as any,token=payload.access_token||payload.data?.access_token;if(typeof token!=='string')throw Error('知乎未返回有效授权');
  const userResponse=await fetch('https://openapi.zhihu.com/user',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!userResponse.ok)throw Error('知乎账户资料读取失败');
  const user=parseProfile(await userResponse.text()),session=crypto.randomUUID();
  await c.env.DB!.batch([
   c.env.DB!.prepare('INSERT INTO users(id,name,avatar,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar').bind(user.id,user.name,user.avatar,new Date().toISOString()),
   c.env.DB!.prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').bind(await digest(session),user.id,Date.now()+7*86400000)
  ]);
  setCookie(c,'yida_session',session,{httpOnly:true,secure:true,sameSite:'Lax',path:'/',maxAge:604800});return c.redirect('/?login=success');
 }catch(e){return c.text(e instanceof Error?e.message:'登录失败，请重试',400)}
});
authRoutes.post('/logout',async c=>{const token=getCookie(c,'yida_session');if(token&&c.env.DB)await c.env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await digest(token)).run();deleteCookie(c,'yida_session',{path:'/'});return c.json({ok:true})});
