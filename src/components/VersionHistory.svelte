<script lang="ts">
  import {onMount} from 'svelte';
  import type {Answer,AnswerVersion} from '../lib/types';
  import {loadVersions,loadVersion} from '../lib/workspace';
  let {answer,onrestore}:{answer:Answer;onrestore:(answer:Answer)=>void}=$props();
  let versions=$state<AnswerVersion[]>([]),error=$state(''),selected=$state<Answer>(),busy=$state(false);
  const labels:Record<string,string>={import:'导入',source:'修改原文',generation:'生成表达',restore:'恢复版本',draft:'初始记录',attempt:'生成尝试',media:'补充媒体'};
  onMount(()=>{void loadVersions(answer.source.id).then(value=>versions=value).catch(e=>error=e.message)});
  async function inspect(id:number){busy=true;try{selected=await loadVersion(answer.source.id,id);error=''}catch(e){error=e instanceof Error?e.message:'无法读取版本'}finally{busy=false}}
</script>
<section class="versions" aria-label="回答版本历史">
  <h3>每一次打磨，都有记录</h3>
  {#if !versions.length&&!error}<p>还没有后台版本记录。</p>{/if}
  {#each versions as version}<button class="version-row" disabled={busy} onclick={()=>inspect(version.id)}><span>{labels[version.kind]||version.kind} · {new Date(version.createdAt).toLocaleString('zh-CN')}</span><small>{version.instruction||version.title}</small></button>{/each}
  {#if selected}<div class="version-preview"><b>{selected.source.title}</b><p>{selected.workspace?.idea||'此版本尚未填写想法'}</p><p>{selected.artifact?selected.artifact.explanation:'此版本保留原文，尚无生成结果。'}</p><small>{selected.source.paragraphs.length} 段正文 · {selected.artifact?.blocks.length||0} 个交互片段</small><button class="button-outline" onclick={()=>onrestore(selected!)}>使用这一版继续打磨</button></div>{/if}
  {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
</section>
<style>.versions{margin:18px 0;padding:16px;border:1px solid #dce4e9;border-radius:8px}.versions h3{font-size:16px;margin:0 0 12px}.version-row{display:grid;text-align:left;gap:5px;width:100%;padding:12px 0;border:0;border-bottom:1px solid #e5ebef;background:transparent;color:#334b58;cursor:pointer}.version-row small{font-size:14px;color:#677b86;white-space:pre-wrap}.version-preview{padding-top:14px}.version-preview p{font-size:14px;line-height:1.7}.version-preview button{display:block;margin-top:12px}</style>
