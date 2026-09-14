import {injectBlockMedia} from './block-media';
import type { InteractiveBlock, SourceAsset } from './types';
export type BlockMessage = { channel: string; blockId: string; type: string; value?: unknown };
export function validMessage(event: Pick<MessageEvent,'source'|'data'>, frame: Window | null, channel: string, blockId: string): event is MessageEvent<BlockMessage> {
  const d=event.data;
  return !!frame && event.source===frame && !!d && typeof d==='object' && d.channel===channel && d.blockId===blockId && ['ready','resize','binding','error','demo-result','media-ready'].includes(d.type);
}
export function frameDocument(block: InteractiveBlock, channel: string, origin: string, assets:SourceAsset[]=[]): string {
  const safe = (v: unknown) => JSON.stringify(v).replace(/</g,'\\u003c');
  const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const bridge = [
    '(function(){',
    'const channel='+safe(channel)+', blockId='+safe(block.id)+', hostOrigin='+safe(origin)+';',
    'const send=(type,value)=>parent.postMessage({channel,blockId,type,value},hostOrigin==="null"?"*":hostOrigin);',
    'let alive=true, active=true; const cleanups=[]; const pauses=[]; const readers=[]; const states=[];',
    'window.world={emit:(key,value)=>send("binding",{key,value:String(value).slice(0,160)}),',
    'ready:()=>send("ready"), onRead:fn=>readers.push(fn), onActive:fn=>pauses.push(fn), onState:fn=>states.push(fn),',
    'cleanup:fn=>cleanups.push(fn), get active(){return active}};',
    'addEventListener("message",event=>{if(event.source!==parent || event.origin!==hostOrigin || event.data?.channel!==channel)return;',
    'const d=event.data;if(d.type==="read")readers.forEach(fn=>fn(d.value));',
    'if(d.type==="state" && d.value && typeof d.value==="object")states.forEach(fn=>fn(d.value));',
    'if(d.type==="demo"){const c=d.value;try{if(!c||typeof c.id!=="string"||typeof c.selector!=="string"||c.selector.length>160)throw Error("操作格式无效");const el=document.querySelector(c.selector);if(!el||el.disabled||!el.getClientRects().length)throw Error("此刻没有可操作的目标");if(c.event==="click"){el.click()}else if(c.event==="input"&&(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)){el.value=String(c.value||"").slice(0,160);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}else throw Error("操作类型无效");send("demo-result",{id:c.id,ok:true})}catch(e){send("demo-result",{id:c?.id,ok:false,message:String(e.message).slice(0,160)})}}',
    'if(d.type==="active"){active=!!d.value;pauses.forEach(fn=>fn(active))}});',
    'Promise.all(Array.from(document.querySelectorAll("img[data-missing-image],img[src] ")).map(img=>img.hasAttribute("data-missing-image")?Promise.reject(Error("图片未保存")):img.decode())).then(()=>send("media-ready")).catch(()=>send("error","图片读取失败"));',
    'addEventListener("error",e=>send("error",String(e.message).slice(0,300)));',
    'addEventListener("unhandledrejection",e=>send("error",String(e.reason).slice(0,300)));',
    'addEventListener("pagehide",()=>{alive=false;cleanups.forEach(fn=>{try{fn()}catch{}})});',
    'new ResizeObserver(()=>{if(alive)send("resize",Math.ceil(document.body.getBoundingClientRect().height))}).observe(document.body);',
    '})();'
  ].join('\n');
  const base='*{box-sizing:border-box}html,body{margin:0;min-height:0}body{font:15px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft Yahei",sans-serif;color:#252a34}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #1677ff;outline-offset:3px}button{touch-action:manipulation}img{max-width:100%}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>'+base+block.css+'</style></head><body>'+injectBlockMedia(block,assets)+'<script>'+bridge+'</script><script>try{\n'+block.js+'\nwindow.world.ready();\n}catch(e){parent.postMessage({channel:'+safe(channel)+',blockId:'+safe(block.id)+',type:"error",value:String(e.message).slice(0,300)},'+safe(origin)+');}</script></body></html>';
}
