<script lang="ts">
  import type { Paragraph, SourceAsset } from '../lib/types';
  import { mapMediaHTML } from '../lib/rich-source';
  import { base64ToBytes } from '../lib/archive';
  let {paragraph,assets=[]}:{paragraph:Paragraph;assets?:SourceAsset[]}=$props();
  let urls=$state<Record<string,string>>({});
  $effect(()=>{
    const map:Record<string,string>={};
    for(const asset of assets){if(paragraph.html?.includes(asset.url.replace(/&/g,'&amp;')))map[asset.url]=URL.createObjectURL(new Blob([base64ToBytes(asset.data)],{type:asset.mime}))}
    urls=map;return()=>Object.values(map).forEach(u=>URL.revokeObjectURL(u));
  });
  let html=$derived(paragraph.html?mapMediaHTML(paragraph.html,url=>urls[url]||url,url=>urls[url]?assets.find(a=>a.url===url)?.mime:undefined):'');
</script>
{#if paragraph.html}<div class="source-rich">{@html html}</div>{:else}<p>{paragraph.text}</p>{/if}
