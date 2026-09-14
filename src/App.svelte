<script lang="ts">
  import { onMount } from 'svelte';
  import type { Answer, AnswerArtifact, PublicConfig } from './lib/types';
  import { seedAnswers } from './data/answers';
  import {realAnswersFirst} from './lib/answer-order';
  import { mergeSavedAnswers } from './lib/answers';
  import { readLocal, writeLocal, downloadJSON } from './lib/storage';
  import { validateArtifact, validateSource } from './lib/validation';
  import { probeArtifact } from './lib/client';
  import {readArchive,validateAssets,sha256} from './lib/archive';
  import {previewSource} from './lib/source';
  import {loadWorkspace,saveWorkspace} from './lib/workspace';
  import AnswerCard from './components/AnswerCard.svelte';
  import Composer from './components/Composer.svelte';
  import Icon from './components/Icon.svelte';
  import Discovery from './components/Discovery.svelte';
  let answers=$state<Answer[]>(seedAnswers),composer=$state(false),query=$state(''),tab=$state<'all'|'mine'|'generated'|'discover'|'new'>('all');
  let config=$state<PublicConfig>({generationEnabled:false,tiers:[],timeoutMs:120000,reason:'正在确认生成服务状态…'});
  let notice=$state(''),introOpen=$state(false),followed=$state(false),loaded=$state(false);
  let toastTimer:ReturnType<typeof setTimeout>,restoreOpen=$state(false);
  let reviewing=$state<Answer>();
  let saveStatus=$state('正在读取后台记录…');
  const revisions=new Map<string,number>(),pending=new Map<string,Answer>(),draftTimers=new Map<string,ReturnType<typeof setTimeout>>();
  let backendQueue=Promise.resolve(),localQueue=Promise.resolve();
  let cacheScope='',publicIds=$state<string[]>([]),myIds=$state<string[]>([]),feedNext=$state<number|null>(0),feedBusy=$state(false);
  const cacheKey=(key:string)=>cacheScope+key;
  async function logout(){await backendQueue;const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok)location.reload();else notify('退出失败，请重试。')}
  async function loadFeed(){feedBusy=true;try{const r=await fetch('/api/feed?offset='+(feedNext||0));if(!r.ok)throw Error('交互新作暂时无法读取');const data=await r.json();for(const a of data.items){validateSource(a.source);validateArtifact(a.artifact,a.source)}publicIds=[...new Set([...publicIds,...data.items.map((a:Answer)=>a.source.id)])];answers=[...data.items.filter((a:Answer)=>!myIds.includes(a.source.id)),...answers.filter(a=>!data.items.some((b:Answer)=>b.source.id===a.source.id)||myIds.includes(a.source.id))];feedNext=data.next}catch(e){notify(String(e))}finally{feedBusy=false}}
  function queueSave(value:Answer,kind:string){
    if(config.authRequired&&!config.user){notify('登录后可以保存自己的作品。');return Promise.resolve()}
    if(config.user&&!myIds.includes(value.source.id))myIds=[...myIds,value.source.id];
    const snapshot=JSON.parse(JSON.stringify(value)) as Answer;
    pending.set(snapshot.source.id,snapshot);void writeLocal(cacheKey('workspace-pending'),[...pending.values()]);saveStatus='正在保存到后台…';
    backendQueue=backendQueue.then(async()=>{
      const id=snapshot.source.id,expected=revisions.get(id)||0;
      try{
        const saved=await saveWorkspace(snapshot,expected,kind);revisions.set(id,saved.workspace!.revision);
        answers=answers.map(a=>a.source.id===id?{...a,workspace:{idea:'',selectedParagraphIds:[],...a.workspace,revision:saved.workspace!.revision,updatedAt:saved.workspace!.updatedAt}}:a);
        if(pending.get(id)===snapshot)pending.delete(id);await writeLocal(cacheKey('workspace-pending'),[...pending.values()]);await persist();saveStatus=pending.size?'仍有修改待保存':'已保存到后台';
      }catch(e){saveStatus='后台未保存 · 浏览器已保留草稿';notify(e instanceof Error?e.message:'后台保存失败')}
    });return backendQueue;
  }
  function saveIdea(id:string,idea:string,selectedParagraphIds:string[],lastError?:string){
    const current=answers.find(a=>a.source.id===id);if(!current)return;
    const next={...current,workspace:{revision:revisions.get(id)||0,updatedAt:current.workspace?.updatedAt||'',idea,selectedParagraphIds,lastError}};
    answers=answers.map(a=>a.source.id===id?next:a);pending.set(id,JSON.parse(JSON.stringify(next)));void writeLocal(cacheKey('workspace-pending'),[...pending.values()]);void persist();
    clearTimeout(draftTimers.get(id));saveStatus='正在保存想法…';draftTimers.set(id,setTimeout(()=>{draftTimers.delete(id);void queueSave(answers.find(a=>a.source.id===id)!,lastError?'attempt':'draft')},400));
  }
  function ensurePrevious(answer:Answer|undefined){if(answer&&!revisions.has(answer.source.id))void queueSave(answer,'import')}
  function restoreVersion(answer:Answer){
    const current=answers.find(a=>a.source.id===answer.source.id);ensurePrevious(current);
    answers=answers.map(a=>a.source.id===answer.source.id?{...answer,workspace:{idea:'',selectedParagraphIds:[],...answer.workspace,revision:revisions.get(answer.source.id)||0,updatedAt:''}}:a);
    void queueSave(answers.find(a=>a.source.id===answer.source.id)!,'restore');void persist();notify('已切换到所选版本；后续修改会继续保留历史。');
  }
  async function refreshConfig(){try{const response=await fetch('/api/config');if(!response.ok)throw 0;config=await response.json();notify(config.generationEnabled?'模型配置已就绪':'模型接入暂留，原文编辑和想法保存可正常使用。')}catch{notify('暂时无法读取模型配置')}}

  let filtered=$derived(realAnswersFirst(answers.filter(a=>(tab!=='mine'||(config.authRequired?myIds.includes(a.source.id):!seedAnswers.some(s=>s.source.id===a.source.id)))&&(tab!=='new'||publicIds.includes(a.source.id))&&(tab!=='generated'||!!a.artifact)&&(!query.trim()||[a.source.title,a.source.author,a.tag,...a.source.paragraphs.map(p=>p.text)].join(' ').toLowerCase().includes(query.trim().toLowerCase())))));
  let generated=$derived(answers.filter(a=>!!a.artifact).length);
  function notify(message:string){notice=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>notice='',5000)}
  async function persist(){const snapshot=JSON.parse(JSON.stringify(answers));localQueue=localQueue.then(()=>writeLocal(cacheKey('answers'),snapshot)).catch(()=>notify('浏览器备份暂不可用，请关注后台保存状态。'));return localQueue}
  function update(id:string,artifact:AnswerArtifact){const old=answers.find(a=>a.source.id===id);ensurePrevious(old);clearTimeout(draftTimers.get(id));answers=answers.map(a=>a.source.id===id?{...a,artifact,reference:undefined}:a);void persist();void queueSave(answers.find(a=>a.source.id===id)!,'generation')}
  function add(input:Answer){
    const editId=reviewing?.source.id;const old=answers.find(a=>a.source.id===(editId||input.source.id));ensurePrevious(old);
    const source=editId&&input.source.id!==editId?previewSource(editId,'','','',input.source):input.source;
    const same=old&&JSON.stringify(old.source)===JSON.stringify(source);
    const answer:Answer={...old,...input,source,reference:old&&!same?(old.artifact?{source:old.source,artifact:old.artifact}:old.reference):old?.reference,workspace:old?.workspace,artifact:input.artifact||(same?old?.artifact:undefined),assets:[...new Map([...(old?.assets||[]),...(input.assets||[])].map(a=>[a.url,a])).values()]};
    if(answer.workspace)answer.workspace={...answer.workspace,selectedParagraphIds:answer.workspace.selectedParagraphIds.filter(id=>source.paragraphs.some(p=>p.id===id))};
    answers=[answer,...answers.filter(a=>a.source.id!==answer.source.id)];composer=false;tab=seedAnswers.some(a=>a.source.id===source.id)?'all':'mine';query='';void persist();void queueSave(answer,editId?'source':'import');notify(editId?'原文已更新，之前的版本保留在历史中。':'原文已加入本页并提交后台保存。');
    setTimeout(()=>document.getElementById(answer.source.id)?.scrollIntoView({block:'start'}),0);
  }
  function saveAssets(id:string,assets:import('./lib/types').SourceAsset[]){answers=answers.map(a=>a.source.id===id?{...a,assets}:a);void persist();void queueSave(answers.find(a=>a.source.id===id)!,'media')}
  async function importArtifact(file:File){
    if(file.size>150000000)throw new Error('文件过大，请控制在 150 MB 以内。');
    if(/\.zip$/i.test(file.name)){
      const answer=await readArchive(new Uint8Array(await file.arrayBuffer()));
      if(answer.artifact)await probeArtifact(answer.artifact,new AbortController().signal);
      add(answer);return;
    }
    const parsed=JSON.parse(await file.text());
    if(Array.isArray(parsed)){
      if(parsed.length>100)throw new Error('备份回答数量过多');
      for(const a of parsed){validateSource(a.source);await validateAssets(a.assets);if(a.artifact){validateArtifact(a.artifact,a.source);if(await sha256(new TextEncoder().encode(JSON.stringify(a.source)))!==a.artifact.provenance.sourceHash)throw new Error('备份中的原文与生成记录不一致');await probeArtifact(a.artifact,new AbortController().signal)}}
      const merged=new Map(answers.map(a=>[a.source.id,a]));
      for(const a of parsed)merged.set(a.source.id,a);
      answers=[...merged.values()];for(const value of parsed)void queueSave(value,'import');composer=false;tab='all';query='';void persist();notify('已合并本地备份，重复回答以备份为准。');return;
    }
    const source=validateSource(parsed.source);const assets=await validateAssets(parsed.assets);
    if(!parsed.artifact){add({source,assets,votes:0,accent:'#658896',tag:'原文导入'});return}
    const artifact=validateArtifact(parsed.artifact,source);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(source)));
    const fingerprint=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(fingerprint!==artifact.provenance.sourceHash)throw new Error('文件中的原文与生成记录指纹不一致');
    await probeArtifact(artifact,new AbortController().signal);
    const old=answers.find(a=>a.source.id===source.id);
    ensurePrevious(old);
    const answer={...old,source,artifact,reference:undefined,assets:[...new Map([...(old?.assets||[]),...(assets||[])].map(a=>[a.url,a])).values()],workspace:old?.workspace?{...old.workspace,selectedParagraphIds:old.workspace.selectedParagraphIds.filter(id=>source.paragraphs.some(p=>p.id===id))}:undefined,votes:old?.votes||0,accent:old?.accent||'#6c8695',tag:old?.tag||'导入产物'};
    answers=old?answers.map(a=>a.source.id===source.id?answer:a):[answer,...answers];
    composer=false;tab='generated';query='';void persist();void queueSave(answer,'import');notify('产物已导入并通过启动检查；模型记录来自所选文件。');
  }
  async function restore(){
    for(const value of seedAnswers){ensurePrevious(answers.find(a=>a.source.id===value.source.id));void queueSave(value,'restore')}
    answers=[...structuredClone(seedAnswers),...answers.filter(a=>!seedAnswers.some(s=>s.source.id===a.source.id))];await persist();tab='all';restoreOpen=false;notify('已恢复原始文章和随项目保存的精选版本');
  }
  function startWriting(){if(config.authRequired&&!config.user){if(config.loginConfigured)location.assign('/api/auth/login');else notify('知乎登录尚未接通，当前可直接阅读精选。');return}if(!loaded){notify('正在恢复本地原文和图片，请稍候。');return}reviewing=undefined;composer=true;setTimeout(()=>document.querySelector('.composer')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}),0)}
  function reviewSource(answer:Answer){startWriting();reviewing=answer}
  onMount(()=>{
    let alive=true;const disposers:(()=>void)[]=[];
    void(async()=>{
      try{const r=await fetch('/api/config');if(!r.ok)throw 0;config=await r.json()}catch{config={authRequired:!import.meta.env.DEV,generationEnabled:false,tiers:[],timeoutMs:120000,reason:'服务暂不可用，原文仍可阅读。'}}
      cacheScope=config.authRequired?'account:'+(config.user?.id||'guest')+':':'';
      const local=config.authRequired&&!config.user?[]:await readLocal<Answer[]>(cacheKey('answers'),[]),outbox=config.authRequired&&!config.user?[]:await readLocal<Answer[]>(cacheKey('workspace-pending'),[]);
      if(!alive)return;
      let remote:Answer[]|undefined;
      try{if(config.authRequired&&!config.user)throw 0;remote=await loadWorkspace();myIds=remote.map(a=>a.source.id);for(const a of remote){validateSource(a.source);revisions.set(a.source.id,a.workspace?.revision||0)}saveStatus='已连接后台'}catch{saveStatus=config.authRequired&&!config.user?'游客阅读 · 登录后创作与保存':'后台未连接 · 使用浏览器备份'}
      try{
        const saved=remote?[...remote,...local.filter(a=>!remote!.some(r=>r.source.id===a.source.id))]:local;
        for(const a of saved){validateSource(a.source);await validateAssets(a.assets);if(a.artifact)validateArtifact(a.artifact,a.source)}
        answers=await mergeSavedAnswers(seedAnswers,saved);
        if(remote)for(const a of local.filter(a=>!remote!.some(r=>r.source.id===a.source.id)))void queueSave(a,'import');
        for(const a of outbox){validateSource(a.source);const server=remote?.find(r=>r.source.id===a.source.id);answers=[a,...answers.filter(value=>value.source.id!==a.source.id)];pending.set(a.source.id,a);if(remote&&(!server||server.workspace?.revision===a.workspace?.revision))void queueSave(a,'draft');else saveStatus='已恢复待保存草稿，请核对后台版本'}
      }catch{notify('部分记录未能读取，已保留原始示例与浏览器备份。')}
      loaded=true;
      void loadFeed();
      try{const r=await fetch('/api/config');if(r.ok&&alive)config=await r.json();else throw 0}catch{if(alive)config={generationEnabled:false,tiers:[],timeoutMs:120000,reason:'生成服务暂时无法连接，原文阅读仍然可用。'}}
      if(location.hash)setTimeout(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(),200);
    })();
    // The same visible actions, optionally exposed to compatible browser agents.
    const context=(document as any).modelContext;
    if(context?.registerTool){
      const controller=new AbortController();disposers.push(()=>controller.abort());
      const tools=[
        {name:'list_answers',description:'Read the visible answer titles and whether each has a saved generated result.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>answers.map(a=>({id:a.source.id,title:a.source.title,generated:!!a.artifact}))},
        {name:'start_answer_creation',description:'Open the answer composer. This does not save or generate an answer.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{startWriting();return {composerOpen:true}}},
      ];
      for(const t of tools)try{void Promise.resolve(context.registerTool(t,{signal:controller.signal})).catch(()=>{})}catch{}
    }
    return()=>{alive=false;clearTimeout(toastTimer);disposers.forEach(f=>f())};
  });
</script>

<svelte:head><title>如果知乎回答可以互动，大家会怎么用？ - 一答一世界</title></svelte:head>
<a class="skip-link" href="#answers">跳到回答</a>
<header class="site-header">
  <nav class="header-inner" aria-label="主导航">
    <a class="zhihu-logo" href="/" aria-label="一答一世界首页">一答<span>一世界</span></a>
    <button class="nav-current" onclick={()=>{tab='all';query=''}}>首页</button>
    <button class="desktop-nav" onclick={()=>tab='discover'}>讨论发现</button>
    <button class="desktop-nav" onclick={()=>{tab='new';query=''}}>交互新作</button>
    <div class="header-search"><input bind:value={query} aria-label="搜索本页回答" placeholder="在回答里，发现另一种可能"/><Icon name="search" size={18}/></div>
    <button class="header-create" aria-label="导入或写回答" onclick={startWriting}><Icon name="edit" size={16}/><span>导入回答</span></button>
    <span class="nav-separator"></span>
    <button class="icon-button notification" aria-label="查看实验说明" onclick={()=>introOpen=!introOpen}><Icon name="bell" size={21}/></button>
    {#if config.user}<button class="my-avatar" aria-label={'查看 '+config.user.name+' 的作品'} onclick={()=>tab='mine'}>{config.user.name.slice(0,1)}</button><button class="text-button" onclick={logout}>退出</button>{:else if config.authRequired}<button class="text-button" onclick={()=>config.loginConfigured?location.assign('/api/auth/login'):notify('知乎登录尚未接通，当前可以直接阅读。')}>{config.loginConfigured?'知乎登录':'登录尚未接通'}</button>{/if}
  </nav>
</header>
<section class="question-section">
  <div class="question-inner">
    <div class="topic-tags"><button onclick={()=>query=''}>知乎黑客松 2026</button><button onclick={()=>query=''}>AI 与创作</button><button onclick={()=>tab='generated'}>互动回答</button></div>
    <div class="question-title-row"><h1>如果知乎回答可以互动，大家会怎么用？</h1><div class="question-counts"><span>原文样本<strong>{answers.length}</strong></span><span>已生成<strong>{generated}</strong></span></div></div>
    <p class="question-description">有些知识，读懂不如试一次。有些想象，文字还没有说完。<br class="mobile-break"/>如果程序也能成为回答的一部分，会发生什么？</p>
    <div class="question-actions"><button class="button-primary" class:following={followed} onclick={()=>{followed=!followed;notify(followed?'已在本地关注这个实验':'已取消关注')}}>{followed?'已关注实验':'关注这个实验'}</button><button class="button-outline" onclick={startWriting}><Icon name="edit" size={17}/>写回答</button><button class="text-button" onclick={()=>introOpen=!introOpen}><Icon name="comment" size={16}/>关于这个实验</button><span class="prototype-label"><span></span>独立参赛原型 · 非知乎官方功能</span></div>
  </div>
</section>
<main class="page-grid">
  <div class="feed">
    {#if introOpen}
      <section class="intro-note"><div><span class="eyebrow">一答一世界</span><h2>文字没有说完的，让程序继续表达。</h2><p>Agent 阅读文章，用代码创造适合它的视觉和交互。每个结果都可以回到原文、看到加工说明，再用一句话改变表达。</p><p>精选来自同一条真实生成链路。尚未生成的文章保留原貌。赞同、收藏、评论和个人预览作为浏览器偏好保存；原文、想法和版本保存在后台。</p></div><button class="icon-button" aria-label="关闭说明" onclick={()=>introOpen=false}><Icon name="close"/></button></section>
    {/if}
    {#if composer}{#key reviewing?.source.id||'new'}<Composer initial={reviewing} onadd={add} onclose={()=>composer=false} onimport={importArtifact}/>{/key}{/if}
    <p class="workspace-status" role="status">{saveStatus}</p>
    <div class="feed-tabs" id="answers"><div role="tablist" aria-label="回答筛选"><button role="tab" aria-selected={tab==='all'} class:current={tab==='all'} onclick={()=>tab='all'}>全部回答 <span>{answers.length}</span></button><button role="tab" aria-selected={tab==='generated'} class:current={tab==='generated'} onclick={()=>tab='generated'}>已生成 <span>{generated}</span></button><button role="tab" aria-selected={tab==='mine'} class:current={tab==='mine'} onclick={()=>tab='mine'}>我的作品</button><button role="tab" aria-selected={tab==='new'} class:current={tab==='new'} onclick={()=>tab='new'}>交互新作</button><button role="tab" aria-selected={tab==='discover'} class:current={tab==='discover'} onclick={()=>tab='discover'}>讨论发现</button></div><span class="feed-sort">真实回答优先 <Icon name="chevron" size={13}/></span></div>
    {#if tab==='discover'}<Discovery/>{:else}
    {#if filtered.length}
      {#each filtered as answer,i (answer.source.id)}<AnswerCard {answer} {config} index={i} shareable={seedAnswers.some(a=>a.source.id===answer.source.id)} onupdate={a=>update(answer.source.id,a)} onassets={assets=>saveAssets(answer.source.id,assets)} onreview={()=>reviewSource(answer)} onidea={(idea,selected,error)=>saveIdea(answer.source.id,idea,selected,error)} onrestore={restoreVersion} onnotice={notify}/>{/each}
    {:else}
      <section class="empty-state"><Icon name={tab==='generated'?'leaf':'search'} size={32}/><h2>{query?'还没有找到这篇回答':tab==='generated'?'第一个世界，等你创造':tab==='new'?'新作正在酝酿':'你的回答，会长成什么样？'}</h2><p>{tab==='generated'?'经过真实加工的结果会出现在这里。可以从现有原文开始，也可以导入此前保存的产物。':tab==='new'?'通过验收的新作会出现在这里。现在可以先读精选回答。':'写下或导入一段文字，让 Agent 帮你找到另一种表达。'}</p><button class="button-primary" onclick={tab==='generated'?()=>tab='all':startWriting}>{tab==='generated'?'去读原文':'写一篇回答'}</button></section>
    {/if}
    {#if tab==='new'&&feedNext!==null}<button class="button-outline" disabled={feedBusy} onclick={loadFeed}>{feedBusy?'正在读取…':'加载更多新作'}</button>{/if}
    {/if}
    <div class="feed-end"><span></span><p>每一篇回答，都有新的可能。</p><span></span></div>
  </div>
  <aside class="sidebar">
    <section class="creator-card"><div class="creator-title"><span class="creator-icon"><Icon name="edit" size={20}/></span><h2>创作中心</h2><span class="local-label">工作区</span></div><p>你负责表达，<br/>让 Agent 想想另一种可能。</p><button class="button-outline" onclick={startWriting}>开始创作 <Icon name="arrow" size={16}/></button><div class="creator-stats"><span>我的预览<b>{answers.filter(a=>!seedAnswers.some(s=>s.source.id===a.source.id)).length}</b></span><span>已生成回答<b>{generated}</b></span></div></section>
    <section class="side-world"><div class="world-wordmark">一答<span>一世界</span><i>✳</i></div><p>同一个阅读空间，<br/>每篇回答自己的表达。</p><div class="world-divider"></div><div class="world-note"><span class="status-light" class:connected={config.generationEnabled}></span>{config.generationEnabled?'在线生成已启用':generated?'默认世界已生成 · 可直接体验':'原文已就绪 · 等待生成'}</div><p class="side-small">{config.generationEnabled?'从原文出发，实时生成代码、视觉与交互。':generated?'默认示例由 Codex 读取原文生成。连接模型后，可在网页继续修改。':'从原文出发，让 Agent 创造适合它的表达。'}</p></section>
    <section class="related"><h2>从这些回答开始</h2>{#each realAnswersFirst(seedAnswers).filter(a=>a.source.origin!=='original').slice(0,4) as a}<a href={'#'+a.source.id} onclick={()=>{tab='all';query=''}}><span>{a.source.title}</span><Icon name="arrow" size={14}/></a>{/each}</section>
    <section class="side-tools"><button onclick={refreshConfig}><Icon name="refresh" size={15}/>刷新模型配置</button><p class="side-small">{config.generationEnabled?'模型配置已就绪，可以在回答下方继续加工。':'经济档与高能力档可分别连接模型。'}登录后可生成并保存个人作品。</p><button onclick={()=>downloadJSON(answers,'yida-local-backup.json')}><Icon name="download" size={15}/>备份当前预览</button><button onclick={()=>restoreOpen=!restoreOpen}><Icon name="refresh" size={15}/>恢复初始版本</button>{#if restoreOpen}<div class="restore-confirm"><p>将恢复随项目提供的示例版本，当前版本会保留在后台历史中；新增回答保留。</p><button onclick={restore}>确认恢复</button><button onclick={()=>restoreOpen=false}>取消</button></div>{/if}</section>
    <footer class="site-footer">知乎黑客松 2026 · 知识炼金场<br/>一答一世界 / 独立实验原型<br/><span>AI 创作 · 内容为先</span></footer>
  </aside>
</main>
{#if notice}<div class="toast" role="status"><Icon name="check" size={17}/>{notice}</div>{/if}
