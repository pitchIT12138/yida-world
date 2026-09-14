<script lang="ts">
 import {onMount} from 'svelte';
 import AnswerCard from '../src/components/AnswerCard.svelte';
 import {seedAnswers} from '../src/data/answers';
 import {validateArtifact,validateSource} from '../src/lib/validation';
 import type {Answer} from '../src/lib/types';
 let candidate=$state<Answer>(),original=$state<Answer>(),selected=$state('api'),error=$state(''),notice=$state('');
 onMount(()=>{void(async()=>{try{
  const path=new URL(location.href).searchParams.get('candidate')||'';
  if(!/^artifacts\/deepseek-evaluation\/[\w-]+\/candidate\.json$/.test(path))throw Error('缺少有效实测记录路径');
  const response=await fetch('/'+path);if(!response.ok)throw Error('候选记录不存在');const a=await response.json();validateSource(a.source);validateArtifact(a.artifact,a.source);
  candidate={...a,votes:0,accent:'#8a663b',tag:'DeepSeek API 实测'};original=seedAnswers.find(s=>s.source.id===a.source.id);
 }catch(e){error=String(e)}})()});
 let answer=$derived(selected==='api'?candidate:original);
</script>
<main class="model-review">
 <header><h1>真实回答 · 模型效果对照</h1><p>同一原文，对照 DeepSeek API 实际输出与当前精选。切换不会改写 Studio 或精选。</p><nav><button aria-pressed={selected==='api'} onclick={()=>selected='api'}>DeepSeek 实测版</button><button aria-pressed={selected==='curated'} onclick={()=>selected='curated'}>当前精选版</button></nav>
 {#if candidate}<p>模型：{candidate.artifact?.provenance.model} · 用时 {((candidate.artifact?.provenance.elapsedMs||0)/1000).toFixed(1)} 秒 · 推理设置 {candidate.artifact?.provenance.reasoningEffort||'默认'}</p>{/if}</header>
 {#if error}<p role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
 {#if answer}{#key selected}<AnswerCard {answer} config={{generationEnabled:false,tiers:[],timeoutMs:120000,reason:'这是已完成调用的对照预览。'}} onupdate={()=>{}} onnotice={text=>notice=text}/>{/key}{/if}
</main>
<style>.model-review{max-width:788px;margin:auto;padding:20px 16px}header{padding:8px 0 20px}h1{font-size:24px}p{line-height:1.7}nav{display:flex;gap:10px}button{padding:10px;border:1px solid #bbcabd;border-radius:5px;background:white;color:#254334}button[aria-pressed=true]{background:#e3eee5}</style>
