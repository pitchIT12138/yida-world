<script lang="ts">
  import {onDestroy} from 'svelte';
  import type {Answer,SourceAsset} from '../lib/types';
  import {assetFromBytes,assetMatchesSource,canArchiveCompletely,collectMedia,createArchive,missingMedia,saveBlob,sourceMedia,unresolvedSourceNotes} from '../lib/archive';
  import {downloadJSON} from '../lib/storage';
  import Icon from './Icon.svelte';
  let {answer,onassets,onreview}:{answer:Answer;onassets:(assets:SourceAsset[])=>void;onreview?:()=>void}=$props();
  let busy=$state(false),status=$state(''),error=$state(''),target=$state(''),fileInput:HTMLInputElement;
  let controller=$state<AbortController>();
  let missing=$derived(missingMedia(answer)),total=$derived(sourceMedia(answer.source).length),complete=$derived(canArchiveCompletely(answer));
  async function saveMedia(){
    controller=new AbortController();busy=true;error='';
    try{const result=await collectMedia(answer,controller.signal,(done,total)=>status=`正在保存原媒体 ${done} / ${total}`);onassets(result.assets);status=result.cancelled?'已取消，已取得的媒体会保留；可继续保存剩余文件。':result.failures.length?`${result.failures.length} 个媒体尚未保存，可重试或补充原文件。`:'原媒体已全部读取，可以导出到本地。';}
    catch(e){error=controller.signal.aborted?'已取消保存，可以重试。':e instanceof Error?e.message:'保存失败'}finally{busy=false}
  }
  async function exportArchive(){busy=true;error='';status='正在校验并打包原文和媒体…';try{const bytes=await createArchive(answer);saveBlob(new Blob([new Uint8Array(bytes)],{type:'application/zip'}),answer.source.id+'.zip');status='离线包已下载，解压后打开 index.html。'}catch(e){error=e instanceof Error?e.message:'导出失败'}finally{busy=false}}
  async function attach(){const file=fileInput.files?.[0];if(!file)return;busy=true;error='';try{if(file.size>20_000_000)throw new Error('单个媒体文件最多 20 MB');const asset=await assetFromBytes(target,new Uint8Array(await file.arrayBuffer()),file.type);if(!assetMatchesSource(answer.source,asset))throw new Error('文件类型与原文不一致：图片位置需原图，嵌入播放器需原音视频。');onassets([...(answer.assets||[]).filter(a=>a.url!==target),asset]);status='原文件已补充，请在正文中核对内容与原文一致。'}catch(e){error=e instanceof Error?e.message:'文件读取失败'}finally{fileInput.value='';busy=false}}
  onDestroy(()=>controller?.abort());
</script>
<details class="source-tools">
  <summary>原文与离线保存 <span>{total?`媒体 ${total-missing.length} / ${total} 已保存`:'无外链媒体'} · {complete?'可导出完整包':'待核对／补全'}</span></summary>
  <p>完整包保留正文结构、图片和可下载媒体，解压后可离线阅读。JSON 保留当前进度，支持继续补全。</p>
  {#if answer.source.imported?.completeness!=='confirmed'&&answer.source.imported}<p class="inline-notice">尚未核对全文。请在导入预览中与知乎全文核对后勾选确认；已截取内容不能标为全文。</p>{/if}
  {#if answer.source.excerpt}<p class="inline-notice">官方接口提供的是内容片段，不能导出为全文包。</p>{/if}
  {#each unresolvedSourceNotes(answer) as note}<p class="inline-notice">{note}</p>{/each}
  <div class="source-tool-actions">
    {#if onreview&&answer.source.imported}<button class="text-button" onclick={onreview} disabled={busy}>核对／补全原文</button>{/if}
    {#if missing.length}<button class="button-outline" onclick={saveMedia} disabled={busy}>保存全部原媒体</button>{/if}
    <button class="button-primary" onclick={exportArchive} disabled={!complete||busy}><Icon name="download" size={15}/>下载完整离线包</button>
    <button class="text-button" disabled={busy} onclick={()=>downloadJSON(answer,answer.source.id+'.json')}>导出当前 JSON</button>
    {#if busy&&controller}<button class="text-button" onclick={()=>controller?.abort()}>取消</button>{/if}
  </div>
  {#if missing.length}<ul class="missing-media">{#each missing as url,i}<li><span>媒体 {i+1}</span>{#if url.startsWith('urn:yida:media:')}<span>原文未提供地址</span>{:else}<a href={url} target="_blank" rel="noreferrer">查看原文件</a>{/if}<button class="text-button" disabled={busy} onclick={()=>{target=url;fileInput.click()}}>补充本地原文件</button></li>{/each}</ul>{/if}
  <input bind:this={fileInput} type="file" accept="image/*,video/mp4,video/webm,audio/*" hidden onchange={attach}/>
  {#if status}<p role="status" class="inline-notice">{status}</p>{/if}{#if error}<p role="alert" class="inline-error">{error}</p>{/if}
</details>
