import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {ZhihuReader,ReaderError} from './reader';
import {ManualBrowsers} from './manual';

async function jsonBody(req:import('node:http').IncomingMessage){
  if(!req.headers['content-type']?.startsWith('application/json'))throw new ReaderError('INVALID_BODY','仅接受 JSON。',400);
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>16000)throw new ReaderError('INVALID_BODY','请求过大。',413);chunks.push(Buffer.from(chunk))}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ReaderError('INVALID_BODY','请求格式无效。',400)}
}

const directory=resolve(process.env.COLLECTOR_DATA_DIR||'.cache/collector');
await mkdir(directory,{recursive:true,mode:0o700});
let token=process.env.COLLECTOR_TOKEN||'';
if(!token){try{token=(await readFile(resolve(directory,'token'),'utf8')).trim()}catch{token=randomBytes(32).toString('hex');await writeFile(resolve(directory,'token'),token,{mode:0o600})}}
if(token.length<32)throw new Error('COLLECTOR_TOKEN must contain at least 32 characters');
const reader=new ZhihuReader(resolve(directory,'browser-profile'),process.env.COLLECTOR_HEADED==='true');
const manual=new ManualBrowsers();
const reaper=setInterval(()=>void manual.reap().catch(()=>{}),60000);reaper.unref();
if(process.argv.includes('--login')){await reader.login();console.log('请在读取服务打开的知乎窗口中正常登录；完成后保留服务运行。')}
const host=process.env.COLLECTOR_HOST||'127.0.0.1',port=Number(process.env.COLLECTOR_PORT||7337);
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const send=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify(data))};
  const expected=Buffer.from('Bearer '+token),received=Buffer.from(req.headers.authorization||'');
  if(received.length!==expected.length||!timingSafeEqual(received,expected)){send(401,{code:'UNAUTHORIZED',error:'读取服务鉴权失败。'});return}
  const url=new URL(req.url||'/', 'http://collector.local');
  if(url.pathname==='/sessions'||url.pathname.startsWith('/sessions/')){
    try{
      if(url.pathname==='/sessions'&&req.method==='POST'){
        const body=await jsonBody(req);if(body?.url!==undefined&&typeof body.url!=='string')throw new ReaderError('INVALID_BODY','链接无效。',400);
        const session=await manual.create(body?.url);
        if(res.destroyed)await manual.remove(session.id);else send(201,session);return;
      }
      const match=/^\/sessions\/([a-f0-9]{64})(?:\/(screen|status|answer|action|capture))?$/.exec(url.pathname);
      if(!match){send(404,{error:'窗口不存在。'});return}
      const [,id,operation]=match;
      if(operation==='screen'&&req.method==='GET'){
        const bytes=await manual.screen(id);res.setHeader('Content-Type','image/jpeg');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);return;
      }
      if(operation==='status'&&req.method==='GET'){send(200,await manual.status(id));return}
      if(operation==='answer'&&req.method==='GET'){send(200,{source:await manual.read(id,url.searchParams.get('url')||'')});return}
      if(operation==='action'&&req.method==='POST'){send(200,await manual.action(id,await jsonBody(req)));return}
      if(operation==='capture'&&req.method==='POST'){send(200,{source:await manual.capture(id)});return}
      if(!operation&&req.method==='DELETE'){await manual.remove(id);send(200,{ok:true});return}
      send(405,{error:'操作方式无效。'});
    }catch(e){send(e instanceof ReaderError?e.status:500,{code:e instanceof ReaderError?e.code:'WINDOW_FAILED',error:e instanceof ReaderError?e.message:'窗口操作未完成，请重试。'})}
    return;
  }
  if(req.method!=='GET'){send(405,{error:'仅支持读取。'});return}
  if(url.pathname==='/health'){send(200,{service:'yida-zhihu-reader',ready:true});return}
  if(url.pathname!=='/answer'){send(404,{error:'Not found'});return}
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),55000);res.on('close',()=>abort.abort());
  try{send(200,{source:await reader.read(url.searchParams.get('url')||'',abort.signal)})}
  catch(e){send(e instanceof ReaderError?e.status:500,{code:e instanceof ReaderError?e.code:'READER_FAILED',error:e instanceof ReaderError?e.message:'读取失败。'})}
  finally{clearTimeout(timer)}
});
server.listen(port,host,()=>console.log(`Zhihu reader listening on http://${host}:${port}; credential retained only on the server.`));
async function close(){clearInterval(reaper);server.close();await Promise.allSettled([reader.close(),manual.close()]);process.exit(0)}
process.on('SIGINT',close);process.on('SIGTERM',close);
