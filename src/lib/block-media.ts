import type {InteractiveBlock,SourceAsset,AnswerArtifact} from './types';
import {parseFragment,serialize} from 'parse5';
import {safeURL,richText} from './rich-source';
export function artifactLinks(artifact:AnswerArtifact|undefined){
 const found=new Map<string,string>();
 function visit(node:any){if(node.tagName==='a'){const url=safeURL(node.attrs?.find((a:any)=>a.name==='href')?.value||'');if(url)found.set(url,richText(serialize(node))||url)}for(const child of node.childNodes||[])visit(child)}
 for(const block of artifact?.blocks||[])visit(parseFragment(block.html));return [...found].map(([url,title])=>({url,title}));
}
export function blockMediaReady(block:InteractiveBlock,assets:SourceAsset[]=[]){
  return (block.mediaUrls||[]).every(url=>assets.some(a=>a.url===url&&/^image\/(png|jpeg|gif|webp|avif)$/.test(a.mime)&&!!a.data));
}
export function blockImageReferences(html:string){
 const refs:string[]=[];
 function visit(node:any){if(node.tagName==='img'){const ref=node.attrs?.find((a:any)=>a.name==='data-source-image')?.value;if(ref)refs.push(ref)}for(const child of node.childNodes||[])visit(child)}
 visit(parseFragment(html));return refs;
}
export function injectBlockMedia(block:InteractiveBlock,assets:SourceAsset[]=[]){
  const images=new Map(assets.filter(a=>block.mediaUrls?.includes(a.url)&&/^image\/(png|jpeg|gif|webp|avif)$/.test(a.mime)).map(a=>[a.url,'data:'+a.mime+';base64,'+a.data]));
  const document=parseFragment(block.html);
  function visit(node:any){if(node.tagName==='img'){const ref=node.attrs?.find((a:any)=>a.name==='data-source-image');if(ref){const src=images.get(ref.value);node.attrs=node.attrs.filter((a:any)=>!['src','srcset','data-source-image'].includes(a.name));node.attrs.push(src?{name:'src',value:src}:{name:'data-missing-image',value:'true'})}}for(const child of node.childNodes||[])visit(child)}
  visit(document);return serialize(document);
}
export function replacementBlock(artifact:AnswerArtifact|undefined,paragraphId:string){return artifact?.blocks.find(b=>b.replaceParagraphIds?.includes(paragraphId))}
