<script lang="ts">
  import { onMount } from 'svelte';
  import { frameDocument, validMessage } from '../lib/runtime';
  import type { InteractiveBlock,DemoCommand,SourceAsset } from '../lib/types';
  import Icon from './Icon.svelte';
  let {block,reading,onbinding,articleState={},demo,ondemo=()=>{},assets=[],onstatus=()=>{}}:{block:InteractiveBlock;assets?:SourceAsset[];onstatus?:(ready:boolean)=>void;reading?:{paragraphId:string;progress:number};onbinding:(key:string,value:string)=>void;articleState?:Record<string,string>;demo?:DemoCommand;ondemo?:(id:string,ok:boolean,message?:string)=>void}=$props();
  let frame=$state<HTMLIFrameElement>(),holder:HTMLDivElement;
  let mounted=$state(false),height=$state(360),error=$state(''),nonce=$state(0);
  const channel=crypto.randomUUID();
  let ready=$state(false),sentDemo='',visible=true;
  let doc=$derived(mounted?frameDocument(block,channel,location.origin,assets):'');
  $effect(()=>{height=block.height});
  function send(type:string,value:unknown){frame?.contentWindow?.postMessage({channel,type,value:JSON.parse(JSON.stringify(value??null))},'*')}
  $effect(()=>{if(reading)send('read',reading)});
  $effect(()=>{if(ready)send('state',articleState)});
  $effect(()=>{if(demo){mounted=true;if(ready&&demo.id!==sentDemo){sentDemo=demo.id;send('demo',demo)}}});
  onMount(()=>{
    const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)mounted=true;send('active',visible&&!document.hidden)},{rootMargin:'250px'});
    io.observe(holder);
    const receive=(event:MessageEvent)=>{
      if(!validMessage(event,frame?.contentWindow||null,channel,block.id))return;
      if(event.data.type==='resize'&&typeof event.data.value==='number'&&Number.isFinite(event.data.value))height=Math.max(36,Math.min(6000,event.data.value));
      if(event.data.type==='error'){error='这段交互遇到问题，可以重新打开。';onstatus(false)}
      if(event.data.type==='media-ready'&&!error)onstatus(true);
      if(event.data.type==='binding'&&ready){const v=event.data.value as any;if(v&&typeof v.key==='string'&&typeof v.value==='string')onbinding(v.key,v.value.slice(0,160))}
      if(event.data.type==='ready'){ready=true;if(reading)send('read',reading);send('state',articleState);send('active',visible&&!document.hidden)}
      if(event.data.type==='demo-result'){const v=event.data.value as any;if(v?.id===demo?.id&&typeof v.ok==='boolean')ondemo(v.id,v.ok,typeof v.message==='string'?v.message.slice(0,160):undefined)}
    };
    window.addEventListener('message',receive);
    const visibility=()=>send('active',visible&&!document.hidden);document.addEventListener('visibilitychange',visibility);
    return()=>{io.disconnect();window.removeEventListener('message',receive);document.removeEventListener('visibilitychange',visibility)};
  });
</script>
<div class="world-frame" bind:this={holder} style:min-height={height+'px'}>
  {#if error}
    <div class="frame-error"><Icon name="refresh"/><span>{error}</span><button onclick={()=>{error='';ready=false;onstatus(false);sentDemo='';nonce++}}>重新打开</button></div>
  {:else if mounted}
    {#key nonce}<iframe bind:this={frame} title={block.title} srcdoc={doc} sandbox="allow-scripts" referrerpolicy="no-referrer" style:height={height+'px'}></iframe>{/key}
  {:else}
    <div class="frame-wait">正在打开这篇回答的世界…</div>
  {/if}
</div>
