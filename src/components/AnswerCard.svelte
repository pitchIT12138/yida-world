<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Answer, AnswerArtifact, PublicConfig, ModelTier, DemoCommand } from '../lib/types';
  import { generateChecked } from '../lib/client';
  import { downloadJSON,readLocal,writeLocal } from '../lib/storage';
  import Icon from './Icon.svelte';
  import WorldFrame from './WorldFrame.svelte';
  import ArtifactLinks from './ArtifactLinks.svelte';
  import ReadingParagraph from './ReadingParagraph.svelte';
  import {replacementBlock} from '../lib/block-media';
  import {hasCuratedMedia,loadCuratedMedia} from '../data/answers';
  import type {SourceAsset} from '../lib/types';
  import {sourceMedia} from '../lib/archive';
  let mediaStatus=$state<Record<string,boolean>>({});
  import SourceTools from './SourceTools.svelte';
  import VersionHistory from './VersionHistory.svelte';
  let {answer,config,onupdate,onnotice,onassets,onreview,onidea,onrestore,index=0,shareable=false}:{answer:Answer;config:PublicConfig;onupdate:(artifact:AnswerArtifact)=>void;onnotice:(text:string)=>void;onassets?:(assets:import('../lib/types').SourceAsset[])=>void;onreview?:()=>void;onidea?:(idea:string,selected:string[],error?:string)=>void;onrestore?:(answer:Answer)=>void;index?:number;shareable?:boolean}=$props();
  let root:HTMLElement;
  let inView=$state(false),mediaSource=$state(''),savedMedia=$state<SourceAsset[]>([]),mediaError=$state('');
  let sourceIdentity=$derived(JSON.stringify(answer.source));
  let effectiveAssets=$derived([...new Map([...(mediaSource===sourceIdentity?savedMedia:[]),...(answer.assets||[])].map(a=>[a.url,a])).values()]);
  let effectiveAnswer=$derived({...answer,assets:effectiveAssets});
  let needsMedia=$derived(hasCuratedMedia(answer.source)&&sourceMedia(answer.source).some(url=>!answer.assets?.some(a=>a.url===url))&&mediaSource!==sourceIdentity);
  $effect(()=>{
    const source=answer.source,identity=sourceIdentity;
    if(!inView||!needsMedia)return;
    let active=true;mediaError='';
    void loadCuratedMedia(source).then(assets=>{if(active){savedMedia=assets;mediaSource=identity}}).catch(e=>{if(active)mediaError=e instanceof Error?e.message:'原图加载失败'});
    return()=>{active=false};
  });
  let expanded=$state(false),editing=$state(false),selecting=$state(false),selected=$state<string[]>([]),selectionStart=$state(-1);
  let instruction=$state(''),tier=$state<ModelTier>('balanced'),busy=$state(false),status=$state(''),error=$state('');
  let votes=$state(false),bookmarked=$state(false),commentsOpen=$state(false),comment=$state(''),comments=$state<string[]>([]);
  let socialReady=$state(false),historyOpen=$state(false);
  $effect(()=>{if(!editing&&!busy){instruction=answer.workspace?.idea||'';selected=answer.workspace?.selectedParagraphIds||[]}});
  function recordIdea(){onidea?.(instruction,[...selected])}
  function restoreAnswer(value:Answer){const running=controller;controller=undefined;running?.abort();busy=false;status='';error='';historyOpen=false;editing=false;bindings={};selected=[];onrestore?.(value)}
  let bindings=$state<Record<string,string>>({}),reading=$state<{paragraphId:string;progress:number}>();
  let replaying=$state(false),sceneTarget=$state(''),sceneText=$state(''),sceneAction=$state(''),sourceOnly=$state(false);
  let sceneIndex=$state(0),autoReplay=$state(false),revealed=$state<string[]>([]),demo=$state<DemoCommand>(),demoNotice=$state('');
  let replayTimer:ReturnType<typeof setTimeout>|undefined,demoTimer:ReturnType<typeof setTimeout>|undefined;
  let articleState=$derived(Object.fromEntries((answer.artifact?.bindings||[]).map(b=>[b.id,bindings[b.id]??b.initial])));
  let controller:AbortController|undefined,replayId=0;
  let foldAt=$derived(answer.artifact&&answer.source.paragraphs.length<=8?answer.source.paragraphs.length:answer.artifact?6:3);
  let shown=$derived(expanded?answer.source.paragraphs:answer.source.paragraphs.slice(0,foldAt));
  $effect(()=>{if(socialReady)void writeLocal('social-'+answer.source.id,{votes,bookmarked,comments:[...comments]}).catch(()=>onnotice('本地互动暂时无法保存。'))});
  let effectiveTier=$derived(config.tiers.includes(tier)?tier:config.tiers[0]||'balanced');
  function selectParagraph(i:number){
    if(selectionStart===-1){selectionStart=i;selected=[answer.source.paragraphs[i].id]}
    else{const start=Math.min(selectionStart,i),end=Math.max(selectionStart,i);selected=answer.source.paragraphs.slice(start,end+1).map(p=>p.id);selectionStart=-1}recordIdea();
  }
  function captureSelection(){
    const selection=window.getSelection();if(!selection||selection.isCollapsed||!root?.contains(selection.anchorNode)||!root?.contains(selection.focusNode))return;
    const element=(n:Node|null)=>n?.nodeType===Node.ELEMENT_NODE?n as Element:n?.parentElement;
    const start=element(selection.anchorNode)?.closest('[data-paragraph]')?.getAttribute('data-paragraph');
    const end=element(selection.focusNode)?.closest('[data-paragraph]')?.getAttribute('data-paragraph');
    const a=answer.source.paragraphs.findIndex(p=>p.id===start),b=answer.source.paragraphs.findIndex(p=>p.id===end);
    if(a>=0&&b>=0){selected=answer.source.paragraphs.slice(Math.min(a,b),Math.max(a,b)+1).map(p=>p.id);selecting=true;recordIdea()}
  }
  async function process(){
    if(busy||!instruction.trim())return;recordIdea();
    if(!config.generationEnabled){error=config.reason||'生成暂不可用';return}
    historyOpen=false;const sourceAtStart=JSON.stringify(answer.source),run=new AbortController();controller=run;busy=true;error='';status='正在连接生成服务…';
    try{
      const artifact=await generateChecked({source:answer.source,current:answer.artifact,previous:answer.artifact?undefined:answer.reference,selectedParagraphIds:selected,instruction:instruction.trim(),tier:effectiveTier},run.signal,s=>{if(controller===run)status=s});
      if(controller!==run||run.signal.aborted)return;
      if(JSON.stringify(answer.source)!==sourceAtStart)throw new Error('生成期间原文已更新，请基于新原文重新生成。');
      onupdate(artifact);bindings={};expanded=true;editing=false;selected=[];selecting=false;onnotice('新的表达已提交后台保存，上一版保留在历史中。');
    }catch(e){if(controller===run){error=run.signal.aborted?'已取消，原文与上一版保持不变。':e instanceof Error?e.message:'生成未完成，上一版保持不变。';onidea?.(instruction,[...selected],error)}}
    finally{if(controller===run){busy=false;status=''}}
  }
  function scheduleReplay(){
    clearTimeout(replayTimer);
    if(!autoReplay||!replaying||demoNotice==='正在执行本步骤的操作…')return;
    if(sceneIndex>=(answer.artifact?.scene.length||0)-1){autoReplay=false;return}
    replayTimer=setTimeout(()=>void showScene(sceneIndex+1),Math.max(8000,sceneText.length*110));
  }
  async function showScene(index:number){
    const artifact=answer.artifact;if(!artifact?.scene.length)return;
    clearTimeout(replayTimer);clearTimeout(demoTimer);demo=undefined;demoNotice='';
    sceneIndex=Math.max(0,Math.min(artifact.scene.length-1,index));
    const step=artifact.scene[sceneIndex],token=replayId;
    sceneTarget=step.target;sceneText=step.text||'';sceneAction=step.action;
    const visible=new Set<string>();
    for(const s of artifact.scene.slice(0,sceneIndex+1)){if(s.action==='compare')visible.clear();if(s.action==='reveal')visible.add(s.target);if(s.action==='restore')artifact.blocks.forEach(b=>visible.add(b.id))}
    revealed=[...visible];sourceOnly=!revealed.length;
    await tick();if(token!==replayId||!replaying)return;
    const attribute=artifact.blocks.some(b=>b.id===step.target)?'data-block':'data-paragraph';
    const target=root.querySelector<HTMLElement>('['+attribute+'="'+CSS.escape(step.target)+'"]');
    const panel=root.querySelector<HTMLElement>('.design-replay');
    if(target){target.style.scrollMarginTop=((panel?.offsetHeight||200)+85)+'px';target.scrollIntoView({block:'start',behavior:'instant'})}
    if(step.demo){
      demo={...step.demo,id:crypto.randomUUID()};demoNotice='正在执行本步骤的操作…';
      demoTimer=setTimeout(()=>{if(token===replayId){demoNotice='未收到操作回执，可以重做本步或亲自尝试。';autoReplay=false}},5000);
    }
    scheduleReplay();
  }
  function replay(){if(!answer.artifact?.scene.length)return;replayId++;replaying=true;autoReplay=false;expanded=true;void showScene(0)}
  function receiveDemo(id:string,ok:boolean,message?:string){if(id!==demo?.id)return;clearTimeout(demoTimer);demoNotice=ok?'已触发真实操作，请看文中的变化。':'这次操作未完成：'+(message||'目标暂不可用');if(!ok)autoReplay=false;scheduleReplay()}
  function stopReplay(){replayId++;clearTimeout(replayTimer);clearTimeout(demoTimer);autoReplay=false;demo=undefined;replaying=false;sceneTarget='';sceneText='';sceneAction='';sourceOnly=false;revealed=[]}
  function emitBinding(key:string,value:string){if(answer.artifact?.bindings.some(b=>b.id===key)&&bindings[key]!==value)bindings={...bindings,[key]:value}}
  async function share(){
    if(!shareable){onnotice('这篇回答只在本地，请通过导出文件分享。');return}
    try{await navigator.clipboard.writeText(location.origin+location.pathname+'#'+answer.source.id);onnotice('回答链接已复制')}catch{onnotice('分享链接：'+location.origin+location.pathname+'#'+answer.source.id)}
  }
  onMount(()=>{
    let alive=true;
    const mediaObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){inView=true;mediaObserver.disconnect()}},{rootMargin:'300px'});mediaObserver.observe(root);
    void readLocal('social-'+answer.source.id,{votes:false,bookmarked:false,comments:[] as string[]}).then(value=>{if(alive){votes=!!value.votes;bookmarked=!!value.bookmarked;comments=Array.isArray(value.comments)?value.comments.filter(x=>typeof x==='string').slice(0,100):[];socialReady=true}});
    const receive=()=>captureSelection();
    root.addEventListener('mouseup',receive);
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
      const id=visible[0]?.target.getAttribute('data-paragraph');
      if(id){const i=answer.source.paragraphs.findIndex(p=>p.id===id);reading={paragraphId:id,progress:i/Math.max(1,answer.source.paragraphs.length-1)}}
    },{rootMargin:'-80px 0px -40% 0px'});
    const watch=()=>root.querySelectorAll('[data-paragraph]').forEach(el=>observer.observe(el));watch();
    const mutation=new MutationObserver(watch);mutation.observe(root,{childList:true,subtree:true});
    return()=>{alive=false;controller?.abort();stopReplay();mediaObserver.disconnect();observer.disconnect();mutation.disconnect();root.removeEventListener('mouseup',receive)};
  });
</script>

<article class="answer-card" class:replaying id={answer.source.id} bind:this={root}>
  <div class="answer-topline">
    <div class="author">
      <span class="avatar" style:background={answer.accent}>{answer.source.avatar}</span>
      <div><div class="author-name">{answer.source.author}<span class="author-dot"></span></div><div class="author-bio">{answer.source.bio}</div></div>
    </div>
    <span class="answer-number">{String(index+1).padStart(2,'0')} / 一答一世界</span>
  </div>
  <div class="source-meta">
    {#if answer.source.origin==='original'}原创示例 · 人物为虚构
    {:else if answer.source.imported}{answer.source.imported.method==='official'?'官方接口原文':'导入原文'} · {answer.source.imported.completeness==='confirmed'?(answer.source.imported.method==='official'?'接口返回正文':'用户已核对全文'):answer.source.imported.completeness==='partial'?'已知片段／待补全':'完整性待核对'}
    {:else if answer.source.origin==='personal'}我的原文 · 工作区保存
    {:else}知乎官方内容 · 接口返回片段{/if}
    {#if answer.tag==='交互新作'}<span> · {answer.source.publishedAt?'原文发表于 '+answer.source.publishedAt.slice(0,10):'新收录'}</span>{/if}
    {#if answer.source.bodyScope}<span> · {answer.source.bodyScope}</span>{/if}
    {#if answer.source.fetchedAt}<span> · 获取于 {answer.source.fetchedAt.slice(0,10)}</span>{/if}
    {#if answer.artifact}<span class="processed-dot">{answer.artifact.provenance.method==='codex'?'Codex 会话生成':'API 生成'}</span>{/if}
  </div>
  <h2>{answer.source.title}</h2>
  {#if replaying}
    <section class="design-replay" aria-label="逐步设计讲解">
      <header><span>此前设计讲解 · {sceneIndex+1} / {answer.artifact?.scene.length}</span><button onclick={stopReplay}>结束讲解 <Icon name="close" size={14}/></button></header>
      <h3>{answer.artifact?.scene[sceneIndex]?.title||'这一处设计的理由'}</h3>
      <p>{sceneText}</p>
      {#if demoNotice}<div class="demo-notice" role="status">{demoNotice}</div>{/if}
      <nav><button onclick={()=>void showScene(sceneIndex-1)} disabled={sceneIndex===0}>上一步</button><button class="replay-next" onclick={()=>void showScene(sceneIndex+1)} disabled={sceneIndex===(answer.artifact?.scene.length||0)-1}>下一步</button><button onclick={()=>{autoReplay=!autoReplay;scheduleReplay()}}>{autoReplay?'暂停自动讲解':'自动讲解'}</button>{#if demo}<button onclick={()=>void showScene(sceneIndex)}>重做本步</button>{/if}</nav>
      <small>{autoReplay?'每步至少停留 8 秒；长说明停留更久。':'按你的阅读节奏前进；演示会操作本篇控件。'}</small>
    </section>
  {/if}
  {#if selecting}
    <div class="selection-strip"><span>{selectionStart===-1?'点击起始和结束段落，或直接框选正文':'再点一个段落，确定连续选区'}</span><button onclick={()=>{selected=[];selectionStart=-1;selecting=false;recordIdea()}}>取消选区</button></div>
  {/if}
  <ArtifactLinks artifact={answer.artifact}/>{#if answer.artifact&&!replaying}<button class="text-button" onclick={()=>sourceOnly=!sourceOnly}>{sourceOnly?'显示交互':'只看原文'}</button>{/if}
  <div class="answer-body" class:source-only={sourceOnly}>
    {#each shown as paragraph,i (paragraph.id)}
      <div class="paragraph" class:selected={selected.includes(paragraph.id)} class:scene-focus={replaying&&sceneTarget===paragraph.id} data-paragraph={paragraph.id}>
        {#if selecting}<button class="paragraph-selector" aria-label={'选择第 '+(i+1)+' 段'} aria-pressed={selected.includes(paragraph.id)} onclick={()=>selectParagraph(i)}>{i+1}</button>{/if}
        <ReadingParagraph {paragraph} assets={effectiveAssets} folded={!sourceOnly&&!selecting&&!!mediaStatus[(answer.artifact?.provenance.runId||'')+(replacementBlock(answer.artifact,paragraph.id)?.id||'')]}/>
        {#if answer.artifact&&!sourceOnly}
          {#each answer.artifact.bindings.filter(b=>b.paragraphId===paragraph.id&&!b.hidden) as binding}
            <span class="text-binding">{binding.label} <strong>{bindings[binding.id]??binding.initial}</strong></span>
          {/each}
        {/if}
      </div>
      {#if answer.artifact}
        {#each answer.artifact.blocks.filter(b=>b.afterParagraphId===paragraph.id) as block (block.id+answer.artifact.provenance.runId)}
          <div class="block-area" class:flow-inline={block.kind==='inline'} class:flow-aside={block.kind==='aside'} data-block={block.id} hidden={sourceOnly||(replaying&&!revealed.includes(block.id))} class:scene-focus={replaying&&sceneTarget===block.id} class:scene-reveal={replaying&&sceneAction==='reveal'&&sceneTarget===block.id}>
            {#if block.mediaUrls?.length&&needsMedia}
              <p role="status">{mediaError?'保存的原图暂时无法载入，请刷新重试；可查看正文原图。':'正在载入保存的原图…'}</p>
            {:else}
              <WorldFrame {block} assets={effectiveAssets} onstatus={ok=>mediaStatus={...mediaStatus,[answer.artifact!.provenance.runId+block.id]:ok}} {reading} {articleState} demo={replaying&&sceneTarget===block.id?demo:undefined} ondemo={receiveDemo} onbinding={emitBinding}/>
            {/if}
          </div>
        {/each}
      {/if}
    {/each}
  </div>
  {#if answer.source.paragraphs.length>foldAt}
    <button class="expand-answer" onclick={()=>expanded=!expanded}>{expanded?'收起正文':'继续阅读，共 '+answer.source.paragraphs.length+' 段'}<span class:rotate={expanded}><Icon name="chevron" size={15}/></span></button>
  {/if}
  {#if answer.source.sourceUrl}<a class="source-link" href={answer.source.sourceUrl} target="_blank" rel="noreferrer">来源：{answer.source.sourceAuthor||answer.source.author} · {answer.source.title}<Icon name="external" size={12}/></a>{/if}
  <div class="answer-workspace-actions"><button class="text-button" onclick={onreview}>编辑原文</button><button class="text-button" onclick={()=>historyOpen=!historyOpen}>版本历史</button>{#if answer.workspace?.revision}<span>已建立后台版本记录</span>{/if}</div>
  {#if historyOpen}<VersionHistory {answer} onrestore={restoreAnswer}/>{/if}
  <SourceTools answer={effectiveAnswer} {onreview} onassets={assets=>onassets?.(assets)}/>
  {#if answer.artifact}
    <div class="process-note"><span class="tiny-world">✳</span><div><b>这篇回答的另一种表达</b><p>{answer.artifact.explanation}</p><button onclick={replay}><Icon name="play" size={13}/> 看看它怎么变成这样的</button></div></div>
    {#if answer.artifact.design}
      {@const design=answer.artifact.design}
      <details class="design-baseline"><summary>本篇设计基线 · 风格与实现约定 <span>{design.version}</span></summary>
        <p><b>表达目标</b> {design.intent}</p><p><b>阅读路线</b> {design.readingFlow}</p><p><b>语气</b> {design.voice}</p>
        <p><b>风格</b> {design.style.palette.join(' / ')}；{design.style.typography}；{design.style.surface}；{design.style.motion}</p>
        {#each design.decisions as decision}<p><b>{decision.title}</b> {decision.reason}<br/><small>取舍：{decision.tradeoff}</small></p>{/each}
        {#each design.components as component}<div class="component-record"><b>{answer.artifact.blocks.find(b=>b.id===component.blockId)?.title}</b><p>{component.purpose}</p><p>位置：{component.whyHere}</p><p>操作：{component.interaction}</p><p>实现：{component.implementation}</p><p>验收：{component.checks.join('；')}</p></div>{/each}
      </details>
    {/if}
  {:else}
    <div class="unprocessed"><span class="tiny-world">✳</span><span>文字准备好了，另一种表达等你来创造。</span><button onclick={()=>{editing=true;instruction='读懂这篇回答，为最值得增强的部分创造自然、紧凑的交互表达。'}}>让它活起来 <Icon name="arrow" size={15}/></button></div>
  {/if}
  {#if editing}
    <section class="edit-area" aria-label="修改这篇回答">
      <div class="edit-heading"><b>{answer.artifact?'还想怎么改？':'让这篇回答活起来'}</b><button class="icon-button" aria-label="关闭修改" onclick={()=>editing=false} disabled={busy}><Icon name="close" size={17}/></button></div>
      <textarea bind:value={instruction} aria-label="这篇回答的创作想法" oninput={e=>{instruction=e.currentTarget.value;recordIdea()}} maxlength="2000" rows="3" placeholder="写下你想解释的问题、比较的方案和希望读者得到的结论。想法会自动保存。" disabled={busy}></textarea>
      <div class="edit-controls">
        <button class="text-button" onclick={()=>{selecting=!selecting;expanded=true}} disabled={busy}><Icon name="layers" size={15}/>{selected.length?'已选 '+selected.length+' 段':'选择段落'}</button>
        {#if selected.length}<button class="text-button" onclick={()=>{selected=[];selectionStart=-1}} disabled={busy}>改为整篇</button>{/if}
        <div class="edit-right">
          {#if config.tiers.length>1}<select bind:value={tier} aria-label="生成模型档位" disabled={busy}><option value="balanced">经济模型</option><option value="frontier">强模型</option></select>{/if}
          {#if busy}<button class="button-secondary" onclick={()=>controller?.abort()}>取消</button>
          {:else}<button class="button-primary" onclick={process} disabled={!instruction.trim()||!config.generationEnabled}><Icon name="arrow" size={15}/>生成表达</button>{/if}
        </div>
      </div>
      {#if busy}<div class="generation-status" role="status"><span class="spinner"></span>{status}</div>{/if}
      {#if !config.generationEnabled}<p class="inline-notice">{config.reason||'生成服务尚未连接。'}</p>{/if}
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
    </section>
  {/if}
  <div class="answer-date">{answer.artifact?'加工于 '+new Date(answer.artifact.provenance.createdAt).toLocaleDateString('zh-CN'):'原文示例'} · {answer.tag}</div>
  <footer class="answer-actions">
    <button class="vote" class:active={votes} onclick={()=>{votes=!votes;onnotice(votes?'已在本地赞同':'已取消本地赞同')}}><span>▲</span> 赞同{votes?' 1':''}</button>
    <button onclick={()=>commentsOpen=!commentsOpen}><Icon name="comment" size={16}/><span>{comments.length?comments.length+' 条评论':'评论'}</span></button>
    <button onclick={()=>{bookmarked=!bookmarked;onnotice(bookmarked?'已在本地收藏':'已取消本地收藏')}} class:active={bookmarked}><Icon name="bookmark" size={16}/><span>{bookmarked?'已收藏':'收藏'}</span></button>
    <button onclick={share}><Icon name="share" size={16}/><span>分享</span></button>
    <button class="modify-trigger" onclick={()=>{editing=!editing;if(!instruction)instruction=answer.artifact?'在上一版基础上增强解释力和信息量，保留有效的操作与结论。':'为关键问题提供有依据的比较、解释或验证，让操作产生有意义的结果。';recordIdea()}}><Icon name="edit" size={16}/><span>{answer.artifact?'还想怎么改':'加工回答'}</span></button>
    {#if answer.artifact}<button class="export-button" aria-label="导出原文、媒体与生成产物" title="导出原文、媒体与生成产物" onclick={()=>downloadJSON(effectiveAnswer,answer.source.id+'.json')}><Icon name="download" size={16}/></button>{/if}
  </footer>
  {#if commentsOpen}
    <section class="comments"><h3>本地评论 <small>仅此浏览器可见</small></h3>{#each comments as text}<p>{text}</p>{/each}<form onsubmit={e=>{e.preventDefault();if(comment.trim()){comments=[...comments,comment.trim()];comment=''}}}><input bind:value={comment} maxlength="500" aria-label="评论内容" placeholder="写下你的感受…"/><button class="button-primary" disabled={!comment.trim()}>评论</button></form></section>
  {/if}
</article>

<style>.answer-workspace-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:14px 0}.answer-workspace-actions span{font-size:13px;color:#74848f}</style>
