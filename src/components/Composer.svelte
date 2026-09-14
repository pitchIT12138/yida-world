<script lang="ts">
  import {onDestroy,onMount} from 'svelte';
  import type { Answer,AnswerSource,SourceAsset,ContentSummary,ContentDetail } from '../lib/types';
  import {answerAddress,parseAnswerHTML,plainSource,richSource} from '../lib/rich-source';
  import {answerShare,shareOnly,isHTMLSource,type AnswerShare} from '../lib/answer-share';
  import {validateSource} from '../lib/validation';
  import {previewSource} from '../lib/source';
  import Icon from './Icon.svelte';
  import SourceParagraph from './SourceParagraph.svelte';
  import SourceTools from './SourceTools.svelte';
  import ManualBrowser from './ManualBrowser.svelte';
  import {zhihuSession,SessionError} from '../lib/zhihu-session';
  let {onadd,onclose,onimport,initial}:{onadd:(answer:Answer)=>void;onclose:()=>void;onimport:(file:File)=>Promise<void>;initial?:Answer}=$props();
  let title=$state(''),body=$state(''),author=$state(''),locator=$state(''),kind=$state<'knowledge'|'story'>('knowledge'),workId=$state('');
  let items=$state<ContentSummary[]>([]),loading=$state(false),error=$state(''),picker=$state(false);
  let draft=$state<AnswerSource>(),assets=$state<SourceAsset[]>([]),candidates=$state<AnswerSource[]>([]),confirmed=$state(false),showAll=$state(false),fileInput:HTMLInputElement;
  let controller:AbortController|undefined;
  let readVersion=0;
  let notice=$state(''),editingSource=$state(false);
  function editParagraph(id:string,value:string){if(!draft)return;draft={...draft,paragraphs:draft.paragraphs.map(p=>p.id===id?{id:p.id,text:value}:p)};confirmed=false}
  function appendParagraph(){if(draft)draft={...draft,paragraphs:[...draft.paragraphs,{id:draft.id+'-p'+crypto.randomUUID().slice(0,8),text:''}]}}
  const readFailed=$derived(!!error&&$zhihuSession.phase==='login');
  let preview=$derived.by(()=>draft?{...draft,title:title.trim()||draft.title,author:author.trim()||draft.author,sourceAuthor:author.trim()||draft.sourceAuthor,avatar:(author.trim()||draft.author).slice(0,1),imported:draft.imported?{...draft.imported,completeness:confirmed?'confirmed' as const:draft.imported.completeness==='partial'?'partial' as const:'unverified' as const}:undefined}:undefined);
  let answer=$derived<Answer|undefined>(preview?{source:preview,assets,votes:0,accent:'#658896',tag:'原文导入'}:undefined);
  function chooseSource(source:AnswerSource){validateSource(source);draft=source;title=source.title;author=source.author;assets=[];confirmed=false;showAll=false;if(source.sourceUrl)locator=source.sourceUrl;candidates=[];body='';error='';notice=''}
  function receive(sources:AnswerSource[]){
    if(sources.length===1){if(sources[0].title==='导入的知乎回答'&&title.trim())sources[0].title=title.trim();if(sources[0].author==='作者待核对'&&author.trim()){sources[0].author=author.trim();sources[0].sourceAuthor=author.trim();sources[0].avatar=author.trim().slice(0,1)}}
    if(sources.length===1&&!sources[0].sourceUrl){const address=answerAddress(locator);if(address){sources[0]=previewSource('zhihu-'+address.id,'','','',sources[0]);sources[0].sourceUrl=address.url}}
    sources.forEach(validateSource);if(!sources.length)throw new Error('没有可导入的正文');
    const target=answerAddress(locator);const found=target?sources.find(s=>answerAddress(s.sourceUrl||'')?.id===target.id):undefined;
    if(found)chooseSource(found);else if(sources.length===1)chooseSource(sources[0]);else candidates=sources;
  }
  function paste(e:ClipboardEvent){
    const html=e.clipboardData?.getData('text/html'),text=e.clipboardData?.getData('text/plain')||'';
    if(!html&&!text)return;e.preventDefault();readVersion++;loading=false;if(zhihuSession.current.pendingURL)void zhihuSession.close();error='';notice='';
    const shared=shareOnly(text);if(shared){useShare(shared);body='';notice='出处已记录。请在知乎展开回答，复制正文后粘贴到这里。';return}
    try{if(isHTMLSource(text))receive(parseAnswerHTML(text,'clipboard'));else if(html)receive(parseAnswerHTML(html,'clipboard'));else receive([plainSource(text,{title:title||undefined,author:author||undefined,url:answerAddress(locator)?.url})])}catch(e){error=e instanceof Error?e.message:'粘贴解析失败'}
  }
  function useShare(shared:AnswerShare){locator=shared.url;if(shared.title)title=shared.title;if(shared.author)author=shared.author;if(draft){draft=previewSource('zhihu-'+shared.id,'','','',draft);draft.sourceUrl=shared.url;confirmed=false}}
  function pasteLocator(e:ClipboardEvent){const shared=answerShare(e.clipboardData?.getData('text/plain')||'');if(shared){e.preventDefault();useShare(shared);notice=draft?'出处已更新。':'出处已记录。请复制回答正文后粘贴。'}}
  function openManual(){error='';void zhihuSession.start().catch(e=>error=e.message)}
  async function readLink(){
    const shared=answerShare(locator);if(!shared){error='请输入单条回答的分享文案、链接或回答 ID。';return}const recover=!!error&&zhihuSession.current.phase==='login';useShare(shared);const version=++readVersion;loading=true;error='';
    notice='';
    const shareTitle=title,shareAuthor=author;
    try{if(recover){for(let attempt=0;;attempt++){try{await zhihuSession.showLogin();break}catch(e){if(!(e instanceof SessionError)||e.code!=='SESSION_BUSY'||attempt>=10)throw e;await new Promise(resolve=>setTimeout(resolve,250))}}}const source=await zhihuSession.import(shared.url);if(version!==readVersion)return;if(source.title==='导入的知乎回答'&&shareTitle)source.title=shareTitle;if(source.author==='作者待核对'&&shareAuthor){source.author=shareAuthor;source.sourceAuthor=shareAuthor;source.avatar=shareAuthor.slice(0,1)}chooseSource(source)}catch(e){if(version===readVersion&&!(e instanceof SessionError&&['SUPERSEDED','CANCELLED'].includes(e.code)))error=e instanceof Error?e.message:'读取失败'}finally{if(version===readVersion)loading=false}
  }

  async function list(){picker=true;loading=true;error='';controller=new AbortController();try{const r=await fetch('/api/content/'+kind,{signal:controller.signal}),data=await r.json();if(!r.ok)throw new Error(data.error);items=data}catch(e){error=e instanceof Error?e.message:'读取失败'}finally{loading=false}}
  async function official(id:string){
    if(!/^\d{1,30}$/.test(id)){error='请输入官方作品 ID';return}loading=true;error='';controller=new AbortController();
    try{const r=await fetch('/api/content/'+kind+'/'+id,{signal:controller.signal}),data:ContentDetail&{error?:string}=await r.json();if(!r.ok)throw new Error(data.error);
      const meta={title:data.chapter_name,author:data.author_name,method:'official' as const};
      const source=/<(?:p|div|img|h[1-6]|table|figure)\b/i.test(data.content)?richSource(data.content,meta):plainSource(data.content,meta);
      source.origin=kind;source.workId=data.work_id;source.sourceUrl='https://api.zhihu.com/km-indep-home/hackathon/v2/'+kind+'/'+id;source.excerpt=true;source.imported!.completeness='partial';source.imported!.notes=['比赛内容接口返回章节／片段，不等同于任意知乎回答全文。'];chooseSource(source);picker=false;
    }catch(e){error=e instanceof Error?e.message:'读取失败'}finally{loading=false}
  }
  async function importFile(){const file=fileInput.files?.[0];if(!file)return;error='';loading=true;try{
    if(/\.(json|zip)$/i.test(file.name)){await onimport(file);return}
    if(file.size>4_000_000)throw new Error('文本／网页文件最多 4 MB，不会截断内容。');
    const text=await file.text();if(isHTMLSource(text))receive(parseAnswerHTML(text,'file'));else if(shareOnly(text)){useShare(shareOnly(text)!);notice='文件中只有分享链接，出处已记录，请补充回答正文。'}else receive([plainSource(text,{method:'file',title:title||undefined,author:author||undefined,url:answerAddress(locator)?.url})]);
  }catch(e){error=e instanceof Error?e.message:'文件读取失败'}finally{loading=false;fileInput.value=''}}
  function previewBody(){try{const shared=shareOnly(body);if(shared){useShare(shared);body='';notice='出处已记录，请补充回答正文。'}else if(isHTMLSource(body))receive(parseAnswerHTML(body,'clipboard'));else receive([plainSource(body,{title,author,url:answerAddress(locator)?.url})])}catch(e){error=e instanceof Error?e.message:'原文无效'}}
  function add(){try{if(!preview&&(shareOnly(body)||isHTMLSource(body))){previewBody();return}const source=preview||plainSource(body,{title,author,url:answerAddress(locator)?.url});validateSource(source);onadd({source,assets,votes:0,accent:'#658896',tag:'原文导入'})}catch(e){error=e instanceof Error?e.message:'保存失败'}}
  function reset(){draft=undefined;candidates=[];assets=[];title='';author='';body='';confirmed=false;error=''}
  onDestroy(()=>{readVersion++;controller?.abort()});
  onMount(()=>{if(initial){chooseSource(initial.source);assets=initial.assets||[];confirmed=initial.source.imported?.completeness==='confirmed'}});
</script>
<section class="composer" aria-label="导入回答">
  <div class="composer-heading"><div><span class="eyebrow">从真实回答开始</span><h2>{initial?'编辑这篇回答':'粘贴一篇回答'}</h2></div><button class="icon-button" aria-label="关闭导入回答" onclick={onclose}><Icon name="close"/></button></div>
  <p class="import-hint">在知乎展开回答，选中正文并复制，再粘贴到这里。无需登录本平台的知乎窗口，也无需安装组件。</p>
  {#if candidates.length}<div class="content-picker" aria-label="选择要导入的回答"><p>识别到 {candidates.length} 篇回答，请选择目标：</p>{#each candidates as source}<button onclick={()=>chooseSource(source)}><span><b>{source.author}</b> · {source.paragraphs[0]?.text.slice(0,90)}</span><Icon name="arrow" size={15}/></button>{/each}</div>{/if}
  {#if !draft}
    <textarea class="composer-body" bind:value={body} onpaste={paste} placeholder="在这里粘贴回答正文（Ctrl / ⌘ + V），会自动整理段落与可用格式。" rows="7" aria-label="粘贴回答正文"></textarea>
    {#if body.trim()}<button class="text-button" onclick={previewBody}>预览原文</button>{/if}
  {/if}
  {#if notice}<p class="inline-notice" role="status">{notice}</p>{/if}
  <label class="source-attribution">原回答链接（选填）<input bind:value={locator} onpaste={pasteLocator} onchange={()=>{const shared=answerShare(locator);if(shared)useShare(shared)}} aria-label="知乎回答链接或 ID" placeholder="用于记录出处，可粘贴回答分享文案"/></label>
  <div class="import-metadata"><label>标题<input bind:value={title} placeholder="未识别到时可补充标题" maxlength="160" aria-label="回答标题"/></label><label>作者<input bind:value={author} placeholder="保留原作者署名" maxlength="80" aria-label="原作者"/></label></div>
  {#if draft&&answer}
    {#if initial}<button class="button-outline" onclick={()=>editingSource=!editingSource}>{editingSource?'查看原文预览':'编辑正文段落'}</button>{/if}
    {#if editingSource}<div class="source-editor" aria-label="原文段落编辑"><p>逐段修改文字；改动的段落保存为纯文本，其他段落的图文格式保留。之前的原文和生成结果会留在版本历史中。</p>{#each draft.paragraphs as paragraph,i (paragraph.id)}<label>第 {i+1} 段<textarea aria-label={'编辑第 '+(i+1)+' 段'} value={paragraph.text} oninput={e=>editParagraph(paragraph.id,e.currentTarget.value)} rows="3"></textarea></label>{/each}<button class="text-button" onclick={appendParagraph}>新增一段</button></div>{/if}
    <div class="import-preview" aria-label="导入原文预览"><div class="import-preview-meta">{draft.paragraphs.length} 段 · {draft.paragraphs.reduce((n,p)=>n+p.text.length,0).toLocaleString()} 字 · 原顺序保留</div>{#each showAll?draft.paragraphs:draft.paragraphs.slice(0,5) as paragraph}<SourceParagraph {paragraph} {assets}/>{/each}{#if draft.paragraphs.length>5}<button class="text-button" onclick={()=>showAll=!showAll}>{showAll?'收起预览':'展开全部原文核对'}</button>{/if}</div>
    {#if draft.imported?.completeness!=='partial'}<label class="full-source-confirm"><input type="checkbox" bind:checked={confirmed}/>我已与知乎原文核对，导入的是全文，包含全部图片和内容</label>{:else}<p class="inline-notice">当前来源明确包含未展开内容或仅提供片段，请补充全文后再归档。</p>{/if}
    <SourceTools {answer} onassets={value=>assets=value}/>
    <button class="text-button" onclick={reset}>重新粘贴另一篇回答</button>
  {/if}
  <div class="composer-bottom"><span>{confirmed?'已核对全文':'可先保存当前内容，完整性待核对'}</span><button class="button-primary" onclick={add} disabled={loading||(!draft&&!body.trim())}>{initial?'保存修改':'加入本页'} <Icon name="arrow" size={15}/></button></div>
  <div class="local-import"><button class="text-button" onclick={()=>fileInput.click()} disabled={loading}><Icon name="upload" size={15}/>导入本地文件或离线包</button><input type="file" accept=".zip,.json,.txt,.html,.htm" bind:this={fileInput} hidden onchange={importFile}/></div>
  <details class="official-import"><summary>可选：尝试联网读取</summary>
    <p class="inline-notice">需要连接知乎，可能遇到访问限制。读取失败时仍可直接粘贴正文。</p>
    <button class="button-outline" onclick={readLink} disabled={loading||!locator.trim()}>{loading?($zhihuSession.authenticated?'正在读取全文…':'等待扫码登录…'):'读取链接全文'}</button>
  <div class="zhihu-connection">
    {#if $zhihuSession.authenticated||readFailed}<span>{readFailed?'知乎会话已保留 · 回答暂未读取成功':'✓ 知乎已连接 · 可尝试读取链接'}</span><button class="text-button" onclick={()=>void zhihuSession.close()}>断开知乎</button>
    {:else if $zhihuSession.phase==='disconnected'||$zhihuSession.phase==='error'}<button class="text-button" onclick={openManual}>扫码登录知乎</button>{/if}
  </div>
  {#if !readFailed&&['connecting','login'].includes($zhihuSession.phase)}<ManualBrowser/>{/if}
  </details>
  <details class="official-import"><summary>可选：官方内容</summary><div class="import-toolbar"><select bind:value={kind} aria-label="知乎内容类型" disabled={loading} onchange={()=>{picker=false;items=[]}}><option value="knowledge">知乎知识</option><option value="story">知乎故事</option></select><button class="text-button" onclick={list} disabled={loading}>选择官方内容</button><input bind:value={workId} aria-label="官方作品 ID" placeholder="作品 ID"/><button class="text-button" onclick={()=>official(workId.trim())} disabled={loading}>按作品 ID 导入</button></div>
  {#if picker}<div class="content-picker">{#each items as item}<button disabled={loading} onclick={()=>official(item.work_id)}><span>{item.title}</span><Icon name="arrow" size={15}/></button>{/each}</div>{/if}
</details>
  {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
</section>

<style>
.source-attribution{display:grid;gap:7px;font-size:14px;margin:14px 0;color:#536b77}
.source-attribution input{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d8e1e6;border-radius:7px;font:inherit;background:white;color:#243744}
.local-import{margin-top:10px}.source-editor{margin:16px 0}.source-editor p{font-size:14px;line-height:1.7;color:#60717b}.source-editor label{display:grid;gap:7px;margin:12px 0;font-size:14px}.source-editor textarea{width:100%;box-sizing:border-box;padding:10px;font:inherit;line-height:1.8;border:1px solid #d8e1e6;border-radius:6px;resize:vertical}
</style>
