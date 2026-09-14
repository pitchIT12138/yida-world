<script lang="ts">
  import {onMount} from 'svelte';
  import AnswerCard from '../src/components/AnswerCard.svelte';
  import {seedAnswers} from '../src/data/seeds';
  import {validateArtifact} from '../src/lib/validation';
  import {probeArtifact} from '../src/lib/client';
  import type {AnswerArtifact} from '../src/lib/types';
  const files=Object.values(import.meta.glob<{source:{id:string};artifact:AnswerArtifact}>('../artifacts/candidates/*.json',{eager:true,import:'default'}));
  const answers=seedAnswers.map(a=>({...a,artifact:validateArtifact(files.find(f=>f.source.id===a.source.id)!.artifact,a.source)}));
  let checks=$state<Record<string,string>>({});
  onMount(()=>{let alive=true;const controller=new AbortController();void(async()=>{for(const a of answers){if(!alive)break;checks[a.source.id]='检查中';try{await probeArtifact(a.artifact,controller.signal);checks[a.source.id]='启动通过'}catch(e){checks[a.source.id]=String(e)}}})();return()=>{alive=false;controller.abort()}});
</script>
<main style="max-width:760px;margin:24px auto;padding:0 16px">
  <h1 style="font-size:22px;margin-bottom:12px">文章编排与设计讲解验收</h1>
  <p style="font-size:13px;color:#82929f">实际候选产物，使用同一阅读宿主。测试页不进入发布包。</p>
  <nav style="display:flex;flex-wrap:wrap;gap:10px;margin:15px 0 25px">{#each answers as a}<a href={'#'+a.source.id} style="font-size:12px">{a.source.id} · {checks[a.source.id]||'待检查'}</a>{/each}</nav>
  {#each answers as answer,i}<AnswerCard {answer} index={i} config={{generationEnabled:false,tiers:[],timeoutMs:120000,reason:'离线设计基线验收'}} onnotice={()=>{}} onupdate={()=>{}}/>{/each}
</main>
