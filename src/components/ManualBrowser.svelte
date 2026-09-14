<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {MANUAL_WIDTH,MANUAL_HEIGHT,type ManualAction} from '../lib/manual-browser';
  import {zhihuSession,SessionError,type ZhihuSession} from '../lib/zhihu-session';
  let {session=zhihuSession}:{session?:ZhihuSession}=$props();
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,sequence=Promise.resolve();
  const controller=new AbortController();
  let frame=$state(''),error=$state(''),pending=$state(0);
  const ready=$derived($session.phase==='login');
  let viewport:HTMLDivElement,keyboard:HTMLTextAreaElement;
  let inputX=$state(0),inputY=$state(0),composing=false;
  let pointerActive=false,lastPoint={x:0,y:0},latestMove:{x:number;y:number}|undefined,moveTimer:ReturnType<typeof setTimeout>|undefined;
  let refreshQueued=false;
  async function request(path:string,method:string,body?:unknown){
    for(let attempt=0;attempt<25;attempt++){
      try{return await session.request(path,method,body,controller.signal)}catch(e){
        if(e instanceof SessionError&&e.code==='SESSION_BUSY'){await new Promise(r=>setTimeout(r,200));continue}throw e;
      }
    }throw new Error('窗口操作尚未完成，请稍后重试。');
  }
  function enqueue(run:()=>Promise<void>,interactive=true){
    if(stopped)return;if(interactive){pending++;error=''}
    sequence=sequence.then(async()=>{if(!stopped)await run()}).catch(e=>{if(!stopped)error=e instanceof Error?e.message:'窗口操作失败'}).finally(()=>{if(interactive)pending--});
  }
  async function screen(){
    const response=await request('/screen','GET');const blob=await response.blob();if(stopped)return;
    const next=URL.createObjectURL(blob);if(frame)URL.revokeObjectURL(frame);frame=next;
  }
  function refresh(){if(refreshQueued||stopped||!ready)return;refreshQueued=true;enqueue(async()=>{try{await screen()}finally{refreshQueued=false}},false)}
  function poll(){if(stopped)return;if(ready)refresh();timer=setTimeout(poll,pointerActive?150:800)}
  function action(value:ManualAction){if(!ready)return;enqueue(async()=>{await request('/action','POST',value);refresh()})}
  function point(e:PointerEvent){const r=viewport.getBoundingClientRect();return {x:Math.max(0,Math.min(MANUAL_WIDTH-1,(e.clientX-r.left)/r.width*MANUAL_WIDTH)),y:Math.max(0,Math.min(MANUAL_HEIGHT-1,(e.clientY-r.top)/r.height*MANUAL_HEIGHT))}}
  function focusKeyboard(p:{x:number;y:number}){inputX=p.x/MANUAL_WIDTH*100;inputY=p.y/MANUAL_HEIGHT*100;keyboard.focus({preventScroll:true})}
  function down(e:PointerEvent){
    if(e.button!==0||!ready)return;e.preventDefault();lastPoint=point(e);focusKeyboard(lastPoint);viewport.setPointerCapture(e.pointerId);pointerActive=true;
    action({type:'pointer',phase:'down',...lastPoint});
  }
  function flushMove(){clearTimeout(moveTimer);moveTimer=undefined;if(latestMove){action({type:'pointer',phase:'move',...latestMove});latestMove=undefined}}
  function move(e:PointerEvent){if(!pointerActive)return;lastPoint=point(e);latestMove=lastPoint;if(!moveTimer)moveTimer=setTimeout(flushMove,80)}
  function up(e:PointerEvent){if(!pointerActive)return;lastPoint=point(e);flushMove();action({type:'pointer',phase:'up',...lastPoint});pointerActive=false;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId)}
  function cancelPointer(){if(!pointerActive)return;clearTimeout(moveTimer);moveTimer=undefined;latestMove=undefined;pointerActive=false;action({type:'pointer',phase:'up',...lastPoint})}
  let wheelDelta=0,wheelTimer:ReturnType<typeof setTimeout>|undefined;
  function wheel(e:WheelEvent){e.preventDefault();wheelDelta=Math.max(-3000,Math.min(3000,wheelDelta+e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?800:1)));if(wheelTimer)return;wheelTimer=setTimeout(()=>{action({type:'scroll',deltaY:wheelDelta});wheelDelta=0;wheelTimer=undefined},150)}
  function key(e:KeyboardEvent){
    if(e.isComposing||composing)return;
    if(e.key==='Escape'){e.preventDefault();viewport.closest('section')?.querySelector('button')?.focus();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v')return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();action({type:'key',key:'ControlOrMeta+A'});return}
    if(['Enter','Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)){e.preventDefault();action({type:'key',key:e.key==='Tab'&&e.shiftKey?'Shift+Tab':e.key});return}
    // Printable text is committed by the native input/IME events below.
    if(e.target===viewport&&e.key.length===1)keyboard.focus({preventScroll:true});
  }
  function paste(e:ClipboardEvent){e.preventDefault();const text=e.clipboardData?.getData('text/plain');if(text){if(text.length>2000){error='一次最多输入 2000 字。';return}action({type:'text',text})}}
  function commitText(){const text=keyboard.value;keyboard.value='';if(!text)return;if(text.length>2000){error='一次最多输入 2000 字。';return}action({type:'text',text})}
  function typed(e:Event){if(!composing&&!(e as InputEvent).isComposing)commitText()}
  function composed(){composing=false;commitText()}
  function beforeInput(e:InputEvent){if(!composing&&!e.isComposing&&['deleteContentBackward','deleteContentForward','insertLineBreak'].includes(e.inputType)){e.preventDefault();action({type:'key',key:e.inputType==='insertLineBreak'?'Enter':e.inputType==='deleteContentBackward'?'Backspace':'Delete'})}}
  function destroy(){stopped=true;controller.abort();clearTimeout(timer);clearTimeout(wheelTimer);clearTimeout(moveTimer);if(frame)URL.revokeObjectURL(frame);if(keyboard)keyboard.value=''}
  onMount(()=>{void session.start().catch(()=>{});poll()});
  onDestroy(destroy);
</script>
<section class="manual-browser" aria-label="知乎扫码登录">
  <div class="window-toolbar"><strong>用知乎 App 扫码登录</strong><span>{pending?'正在完成操作…':'登录后自动读取链接'}</span><button class="text-button" onclick={()=>void session.close()}>断开知乎</button></div>
  <p class="window-note">打开知乎 App → 我的 → 扫一扫。确认登录后，这个窗口会自动收起；粘贴的回答链接会直接读取。</p>
  <!-- This is an interactive remote viewport; Escape returns keyboard focus to its toolbar. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="viewport" bind:this={viewport} role="application" aria-label="知乎远程页面，可点击、拖动、滚动和键盘输入；Escape 返回工具栏" tabindex="0" onfocus={e=>{if(e.target===viewport)keyboard?.focus({preventScroll:true})}} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancelPointer} onlostpointercapture={cancelPointer} onkeydown={key} onpaste={paste} onwheel={wheel}>
    <textarea class="keyboard-capture" bind:this={keyboard} style:left={inputX+'%'} style:top={inputY+'%'} aria-label="直接在知乎页面输入" tabindex="-1" autocomplete="off" autocapitalize="off" spellcheck="false" oninput={typed} onbeforeinput={beforeInput} oncompositionstart={()=>composing=true} oncompositionend={composed}></textarea>
    {#if frame}<img src={frame} alt="本次会话的知乎页面" draggable="false"/>{:else}<span>正在等待页面画面…</span>{/if}
  </div>
  {#if error||$session.error}<p class="inline-error" role="alert">{error||$session.error}</p>{/if}
</section>
<style>
  .manual-browser{margin:16px 0;padding:14px;border:1px solid #d7e1dd;border-radius:12px;background:#f7faf8;color:#30453e}
  .window-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.window-toolbar strong{font-size:15px}.window-toolbar span{font-size:12px;color:#71847a}.window-toolbar button{margin-left:auto}.window-note{font-size:12px;line-height:1.7;margin:10px 0}
  .viewport{width:100%;aspect-ratio:1280/800;background:#fff;border:1px solid #d7e1dd;border-radius:5px;overflow:hidden;position:relative;touch-action:none;outline-offset:3px}.viewport img{width:100%;height:100%;display:block;pointer-events:none;user-select:none}.viewport>span{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:#708279}.viewport:focus{outline:2px solid #688c7e}.keyboard-capture{position:absolute;width:1px;height:20px;min-width:0;min-height:0;padding:0;margin:0;border:0;resize:none;background:transparent;color:transparent;caret-color:transparent;opacity:.01;overflow:hidden;pointer-events:none;font-size:16px;outline:none}.viewport:focus-within{outline:2px solid #688c7e}.inline-error{font-size:13px}
</style>
