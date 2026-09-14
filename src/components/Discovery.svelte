<script lang="ts">
 import {onMount} from 'svelte';
 let items=$state<{id:string;title:string;summary:string;url:string;fetchedAt:string}[]>([]),next=$state<number|null>(0),busy=$state(false),message=$state('');
 async function load(){busy=true;try{const response=await fetch('/api/discover?offset='+(next||0));if(!response.ok)throw Error('讨论暂时无法读取，请稍后重试。');const data=await response.json();items=[...items,...data.items];next=data.next;message=data.message||''}catch(e){message=String(e)}finally{busy=false}}
 onMount(()=>{void load()});
</script>
<section class="discovery" aria-label="讨论发现">
 <h2>讨论发现</h2><p>从知乎正在讨论的问题出发。取得正文后，才有机会成为可操作的回答。</p>
 {#each items as item (item.id)}<article><small>获取于 {new Date(item.fetchedAt).toLocaleString('zh-CN')}</small><h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a></h3>{#if item.summary}<p>{item.summary}</p>{/if}<span>讨论摘要 · 前往知乎阅读原文</span></article>{/each}
 {#if message}<p role="status">{message}</p>{/if}
 {#if next!==null}<button disabled={busy} onclick={load}>{busy?'正在读取…':'加载更多讨论'}</button>{/if}
</section>
<style>
 .discovery{padding:24px;background:white;border:1px solid #e6e8eb;border-radius:8px}.discovery>p,small,article>span{color:#737c87;font-size:14px;line-height:1.8}article{padding:22px 0;border-top:1px solid #edf0f2}h2{font-size:23px}h3{font-size:18px;line-height:1.6}a{color:#244e62;text-decoration:none}article p{font-size:15px;line-height:1.8;white-space:pre-wrap}button{padding:10px 16px;border:1px solid #ddd;background:white;border-radius:6px;cursor:pointer}
</style>
