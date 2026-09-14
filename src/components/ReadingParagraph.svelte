<script lang="ts">
 import SourceParagraph from './SourceParagraph.svelte';
 import type {Paragraph,SourceAsset} from '../lib/types';
 let {paragraph,assets,folded=false}:{paragraph:Paragraph;assets?:SourceAsset[];folded?:boolean}=$props();
</script>
{#if folded}
 <details class="original-media"><summary>查看这组对比的原图</summary><SourceParagraph {paragraph} {assets}/></details>
{:else}<SourceParagraph {paragraph} {assets}/>{/if}
<style>.original-media{font-size:13px;color:#64746d;margin:8px 0}.original-media summary{cursor:pointer}</style>
