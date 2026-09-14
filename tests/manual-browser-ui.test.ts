// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,tick} from 'svelte';
import ManualBrowser from '../src/components/ManualBrowser.svelte';
import {ZhihuSession} from '../src/lib/zhihu-session';
let target:HTMLDivElement,component:ReturnType<typeof mount>;
const id='c'.repeat(64);
let session:ZhihuSession;
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  URL.createObjectURL=vi.fn(()=>'blob:manual-test');URL.revokeObjectURL=vi.fn();session=new ZhihuSession();
  fetcher=vi.fn(async(path:string,options:RequestInit)=>{
    if(path.endsWith('/screen'))return new Response(new Uint8Array([255,216,255,217]),{headers:{'content-type':'image/jpeg'}});
    if(path.endsWith('/status'))return new Response(JSON.stringify({authenticated:false}));
    if(path==='/api/manual-browser'&&options.method==='POST')return new Response(JSON.stringify({id,width:1280,height:800}));
    return new Response(JSON.stringify({ok:true}));
  });vi.stubGlobal('fetch',fetcher);
  target=document.createElement('div');document.body.append(target);
  component=mount(ManualBrowser,{target,props:{session}});
});
afterEach(async()=>{await unmount(component);await session.close();target.remove();vi.unstubAllGlobals()});
function button(text:string){const el=[...target.querySelectorAll('button')].find(b=>b.textContent?.includes(text));if(!el)throw new Error('Missing button '+text);return el}
describe('manual window component',()=>{
  it('keeps the QR session when the panel closes and disconnects explicitly',async()=>{
    await vi.waitFor(()=>expect(target.querySelector('img')?.getAttribute('src')).toBe('blob:manual-test'));
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({url:'https://www.zhihu.com/signin'}));
    expect(target.textContent).not.toContain('导入当前回答');expect(target.textContent).not.toContain('打开这条回答');
    await unmount(component);expect(fetcher.mock.calls.some(([,o])=>o.method==='DELETE')).toBe(false);
    component=mount(ManualBrowser,{target,props:{session}});await tick();
    button('断开知乎').click();await vi.waitFor(()=>expect(session.current.phase).toBe('disconnected'));
    const close=fetcher.mock.calls.find(([,o])=>o.method==='DELETE');expect(close?.[1].headers).toMatchObject({'X-Reader-Session':id});
    expect(fetcher.mock.calls.every(([path])=>!path.includes(id))).toBe(true);
  });
  it('accepts direct typing and commits Chinese composition exactly once without a separate form',async()=>{
    await vi.waitFor(()=>expect(target.querySelector('img')).not.toBeNull());
    expect(target.querySelector('.window-input')).toBeNull();expect(target.textContent).not.toContain('发送并清空');
    const input=target.querySelector('textarea')!;
    input.value='abc';input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'abc'}));
    await vi.waitFor(()=>expect(fetcher.mock.calls.some(([p,o])=>p.endsWith('/action')&&o.body===JSON.stringify({type:'text',text:'abc'}))).toBe(true));
    expect(input.value).toBe('');
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='中文';
    input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'中文'}));
    input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',isComposing:true}));await tick();
    expect(fetcher.mock.calls.some(([,o])=>o.body?.toString().includes('中文'))).toBe(false);
    input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'中文'}));
    await vi.waitFor(()=>expect(fetcher.mock.calls.filter(([,o])=>o.body===JSON.stringify({type:'text',text:'中文'}))).toHaveLength(1));
    expect(input.value).toBe('');
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(document.activeElement).toBe(button('断开知乎'));
  });
  it('sends pointer down before release and lets cancellation release the remote mouse',async()=>{
    await vi.waitFor(()=>expect(target.querySelector('img')).not.toBeNull());
    const viewport=target.querySelector<HTMLDivElement>('[role=application]')!;
    viewport.setPointerCapture=vi.fn();viewport.hasPointerCapture=vi.fn(()=>false);
    vi.spyOn(viewport,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,bottom:800,right:1280,width:1280,height:800,toJSON(){}});
    viewport.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0,clientX:50,clientY:75}));
    await vi.waitFor(()=>expect(fetcher.mock.calls.some(([,o])=>o.body===JSON.stringify({type:'pointer',phase:'down',x:50,y:75}))).toBe(true));
    expect(document.activeElement).toBe(target.querySelector('textarea'));
    expect(fetcher.mock.calls.some(([,o])=>o.body?.toString().includes('"phase":"up"'))).toBe(false);
    viewport.dispatchEvent(new Event('pointercancel',{bubbles:true}));
    await vi.waitFor(()=>expect(fetcher.mock.calls.some(([,o])=>o.body===JSON.stringify({type:'pointer',phase:'up',x:50,y:75}))).toBe(true));
  });
});
