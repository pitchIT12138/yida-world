<script lang="ts">
 import {artifactLinks} from '../lib/block-media';
 import type {AnswerArtifact} from '../lib/types';
 let {artifact}:{artifact?:AnswerArtifact}=$props();
 const links=$derived(artifactLinks(artifact));
</script>
{#if links.length}<details><summary>补充资料与核验来源</summary><ul>{#each links as link}<li><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a></li>{/each}</ul></details>{/if}
<style>details{font-size:13px;color:#536963;margin:12px 0}summary{cursor:pointer}a{color:#2b6d68;overflow-wrap:anywhere}li{margin:7px 0}</style>
