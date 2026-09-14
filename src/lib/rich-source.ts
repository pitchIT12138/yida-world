import { parse, parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { AnswerSource, ImportRecord } from './types';
import {mediaMime} from './media';

type Node = { nodeName:string; tagName?:string; value?:string; attrs?:{name:string;value:string}[]; childNodes?:Node[] };
const allowed = new Set('p div span section article h1 h2 h3 h4 h5 h6 br hr strong b em i u s del ins sub sup mark small blockquote pre code ul ol li dl dt dd table thead tbody tfoot tr th td caption figure figcaption a img video audio source math mrow mi mn mo ms mtext mspace msup msub msubsup mfrac msqrt mroot munder mover munderover mtable mtr mtd semantics annotation'.split(' '));
const discard = new Set('script style noscript template button input textarea select form nav header footer object embed link meta base'.split(' '));
const voids=new Set(['br','hr','img','source']);
const blocks=new Set('p h1 h2 h3 h4 h5 h6 blockquote pre ul ol dl table figure video audio math hr'.split(' '));
const containers=new Set(['div','span','section','article']);
export const MAX_SOURCE_HTML=4_000_000;
export const EMBEDDED_MEDIA_NOTE='嵌入播放器已保留来源链接，尚未取得可离线保存的媒体文件。';
export const attr=(n:Node,k:string)=>n.attrs?.find(a=>a.name===k)?.value||'';
const children=(n:Node)=>n.childNodes||[];
const hasClass=(n:Node,k:string)=>attr(n,'class').split(/\s+/).includes(k);
export function escapeHTML(s:string){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
export function safeURL(value:string,base='https://www.zhihu.com'):string|undefined {
  if(!value.trim())return;
  try{const u=new URL(value,base);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href}catch{}return;
}
export function mediaReference(value:string):string|undefined{return /^urn:yida:media:[a-zA-Z0-9_-]{1,120}$/.test(value)?value:safeURL(value)}
function imageURL(value:string):string|undefined{
  const match=value.match(/^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(match){try{const prefix=Uint8Array.from(atob(match[2].slice(0,48)),c=>c.charCodeAt(0));if(mediaMime(prefix,match[1])===match[1])return value}catch{}return}
  return mediaReference(value);
}
export function answerAddress(value:string):{id:string;url:string}|undefined {
  const s=value.trim();if(/^\d{1,30}$/.test(s))return{id:s,url:'https://www.zhihu.com/answer/'+s};
  try{const u=new URL(s);if(!['www.zhihu.com','zhihu.com','m.zhihu.com'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)return;
    const m=u.pathname.match(/^(?:\/question\/\d+)?\/answer\/(\d{1,30})\/?$/);if(m)return{id:m[1],url:'https://www.zhihu.com'+u.pathname.replace(/\/$/,'')};
  }catch{}return;
}
function walk(n:Node,fn:(n:Node)=>void){fn(n);children(n).forEach(c=>walk(c,fn))}
function first(n:Node,p:(n:Node)=>boolean):Node|undefined {if(p(n))return n;for(const c of children(n)){const r=first(c,p);if(r)return r}return;}
function plain(n:Node):string {
  if(discard.has(n.tagName||''))return '';
  if(n.nodeName==='#text')return n.value||'';
  if(n.tagName==='img')return '[图片'+(attr(n,'alt')?'：'+attr(n,'alt'):'')+']';
  return children(n).map(plain).join('')+(/^(p|div|h[1-6]|li|tr|blockquote|pre|br|figcaption)$/.test(n.tagName||'')?'\n':'');
}
function render(n:Node):string {
  if(n.nodeName==='#text')return escapeHTML(n.value||'');
  const tag=n.tagName||'';
  if(discard.has(tag))return '';
  if(tag==='iframe'){
    const u=safeURL(attr(n,'src'));return u?'<a href="'+escapeHTML(u)+'" data-embedded="true" target="_blank" rel="noopener noreferrer">[嵌入内容：'+escapeHTML(attr(n,'title')||u)+']</a>':'';
  }
  const inner=children(n).map(render).join('');
  if(!allowed.has(tag))return inner;
  let attrs='';
  const put=(k:string,v:string)=>{attrs+=' '+k+'="'+escapeHTML(v)+'"'};
  if(tag==='a'){
    const href=safeURL(attr(n,'href'));if(href)put('href',href);
    if(attr(n,'data-embedded')==='true')put('data-embedded','true');
    put('target','_blank');put('rel','noopener noreferrer');
  }
  if(['img','video','audio','source'].includes(tag)){
    const original=attr(n,'data-original'),actual=attr(n,'data-actualsrc'),src=tag==='img'?imageURL(original||actual||attr(n,'src')):mediaReference(attr(n,'src'));
    if(src)put('src',src);
    if(tag==='img'){put('alt',attr(n,'alt'));put('loading','lazy');put('referrerpolicy','no-referrer')}
    if(tag==='video'||tag==='audio'){put('controls','');put('preload','none');const poster=safeURL(attr(n,'poster'));if(poster)put('poster',poster)}
    if(tag==='source'&&/^(image|video|audio)\/[\w.+-]+$/.test(attr(n,'type')))put('type',attr(n,'type'));
  }
  if(['td','th'].includes(tag))for(const k of ['colspan','rowspan'])if(/^[1-9]\d{0,2}$/.test(attr(n,k)))put(k,attr(n,k));
  if(tag==='ol'&&/^-?\d{1,6}$/.test(attr(n,'start')))put('start',attr(n,'start'));
  if(tag==='math'&&['block','inline'].includes(attr(n,'display')))put('display',attr(n,'display'));
  if(tag==='annotation'&&attr(n,'encoding')==='application/x-tex')put('encoding','application/x-tex');
  return '<'+tag+attrs+'>'+inner+(voids.has(tag)?'':'</'+tag+'>');
}
export function sanitizeRichHTML(html:string):string {
  if(html.length>MAX_SOURCE_HTML)throw new Error('原文过大，单篇富文本最多 4 MB；内容没有截断。');
  // Removing wrappers can change HTML parsing (e.g. block elements inside p).
  // Return a fixed point so validation never rejects our own cleaned output.
  let current=html;
  for(let pass=0;pass<6;pass++){const next=children(parseFragment(current) as Node).map(render).join('');if(next===current)return next;current=next}
  throw new Error('正文结构无法自动整理，原内容仍保留，请检查嵌套的表格或特殊嵌入内容。');
}
export function richText(html:string){return plain(parseFragment(html) as Node).trim()}
export function mediaURLs(html:string):string[]{
  const urls=new Set<string>();walk(parseFragment(html) as Node,n=>{if(['img','video','audio','source'].includes(n.tagName||'')){for(const key of ['src','poster']){const u=mediaReference(attr(n,key));if(u)urls.add(u)}}if(n.tagName==='a'&&attr(n,'data-embedded')==='true'){const u=safeURL(attr(n,'href'));if(u)urls.add(u)}});return [...urls];
}
export function embeddedURLs(html:string):string[]{
  const urls=new Set<string>();walk(parseFragment(html) as Node,n=>{if(n.tagName==='a'&&attr(n,'data-embedded')==='true'){const url=safeURL(attr(n,'href'));if(url)urls.add(url)}});return [...urls];
}
export function mediaRequirements(html:string):Map<string,Set<string>>{
  const requirements=new Map<string,Set<string>>();
  const add=(url:string|undefined,kinds:string[])=>{if(!url)return;const previous=requirements.get(url);requirements.set(url,new Set(previous?kinds.filter(k=>previous.has(k)):kinds))};
  function visit(n:Node,parentKind?:string){
    const tag=n.tagName||'',kind=tag==='img'?'image':['audio','video'].includes(tag)?tag:parentKind;
    if(['img','audio','video','source'].includes(tag))add(mediaReference(attr(n,'src')),kind?[kind]:['image','audio','video']);
    if(tag==='video')add(safeURL(attr(n,'poster')),['image']);
    if(tag==='a'&&attr(n,'data-embedded')==='true')add(safeURL(attr(n,'href')),['audio','video']);
    children(n).forEach(c=>visit(c,kind));
  }visit(parseFragment(html) as Node);return requirements;
}
export function mapMediaHTML(html:string,resolve:(url:string)=>string,mime?:(url:string)=>string|undefined):string {
  // Input must have passed validateSource. Only replace canonical media attribute values.
  const mapped=html.replace(/\b(src|poster)="([^"]+)"/g,(_,key,url)=>{
    const decoded=url.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");return key+'="'+escapeHTML(resolve(decoded))+'"';
  });
  if(!mime)return mapped;
  return mapped.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g,link=>{
    const node=children(parseFragment(link) as Node)[0];if(!node||attr(node,'data-embedded')!=='true')return link;
    const url=attr(node,'href'),kind=mime(url)?.split('/')[0];if(kind!=='audio'&&kind!=='video')return link;
    return '<span class="embedded-media"><'+kind+' controls preload="none" src="'+escapeHTML(resolve(url))+'"></'+kind+'>'+link+'</span>';
  });
}
function splitRich(html:string):{html:string;text:string}[]{
  const out:string[]=[];let inline='';const flush=()=>{if(inline.trim())out.push('<p>'+inline+'</p>');inline=''};
  function visit(n:Node){const tag=n.tagName||'';if(blocks.has(tag)){flush();out.push(render(n))}
    else if(containers.has(tag)&&(tag!=='span'||children(n).some(c=>blocks.has(c.tagName||'')||containers.has(c.tagName||'')))){flush();children(n).forEach(visit);flush()}
    else inline+=render(n);
  }
  children(parseFragment(html) as Node).forEach(visit);flush();
  return out.map(sanitizeRichHTML).filter(h=>richText(h)||/<(?:img|video|audio|math|hr)\b/.test(h)).map(html=>({html,text:richText(html)||'[媒体内容]'}));
}
export function authorAvatar(author:string){return Array.from(author.trim())[0]||'知'}
export function richSource(html:string,meta:{title?:string;author?:string;url?:string;method:ImportRecord['method'];notes?:string[];partial?:boolean}):AnswerSource {
  if(html.length>MAX_SOURCE_HTML)throw new Error('原文过大，单篇富文本最多 4 MB；内容没有截断。');
  const address=meta.url?answerAddress(meta.url):undefined,id=address?'zhihu-'+address.id:'mine-'+crypto.randomUUID();
  // Missing URLs become local attachment identifiers, never fabricated upstream URLs.
  const prepared=parseFragment(html) as Node;let slot=0;
  walk(prepared,n=>{
    const tag=n.tagName;
    const missing=tag==='img'?!imageURL(attr(n,'data-original')||attr(n,'data-actualsrc')||attr(n,'src')):
      ['video','audio'].includes(tag||'')&&!mediaReference(attr(n,'src'))&&!first(n,c=>c.tagName==='source'&&!!mediaReference(attr(c,'src')));
    if(missing){n.attrs=(n.attrs||[]).filter(a=>!['data-original','data-actualsrc','src'].includes(a.name));n.attrs.push({name:'src',value:'urn:yida:media:'+id+'-'+slot++})}
  });
  const safe=sanitizeRichHTML(serialize(prepared as DefaultTreeAdapterMap['parentNode']));
  const notes=[...(meta.notes||[])];
  if(/data-embedded="true"/.test(safe))notes.push(EMBEDDED_MEDIA_NOTE);
  if(/<img\b(?![^>]*\bsrc=)[^>]*>/.test(safe))notes.push('有图片缺少可读取的地址，请补充原图。');
  let unsupported=false;
  walk(parseFragment(html) as Node,n=>{if(['canvas','object','embed'].includes(n.tagName||'')||(n.tagName==='svg'&&!hasClass(n,'ZDI'))||(n.tagName==='iframe'&&!safeURL(attr(n,'src'))))unsupported=true});
  if(unsupported)notes.push('原文包含尚未转换的绘图或嵌入对象，需补充其原始内容后才能归档全文。');
  let absentMedia=false;walk(parseFragment(safe) as Node,n=>{if(['video','audio'].includes(n.tagName||'')&&!attr(n,'src')&&!first(n,c=>c.tagName==='source'&&!!attr(c,'src')))absentMedia=true});
  if(absentMedia)notes.push('原文包含没有文件地址的音视频，请补充原始媒体。');
  return {id,title:meta.title?.trim()||'导入的知乎回答',author:meta.author?.trim()||'作者待核对',bio:'导入原文',avatar:authorAvatar(meta.author||''),origin:'zhihu',sourceUrl:address?.url,sourceAuthor:meta.author,
    imported:{method:meta.method,completeness:meta.partial?'partial':'unverified',notes},paragraphs:splitRich(safe).map((p,i)=>({...p,id:id+'-p'+i}))};
}
export function parseAnswerHTML(html:string,method:ImportRecord['method']='file'):AnswerSource[]{
  if(html.length>MAX_SOURCE_HTML)throw new Error('网页超过 4 MB，请复制目标回答；不会截断导入。');
  const doc=parse(html) as Node;const answers:Node[]=[];walk(doc,n=>{if(hasClass(n,'AnswerItem'))answers.push(n)});
  const results:AnswerSource[]=[];
  for(const node of answers){
    let meta:{itemId?:string;title?:string;authorName?:string}={};try{meta=JSON.parse(attr(node,'data-zop'))}catch{}
    const id=attr(node,'name')||attr(node,'data-zop').match(/"itemId"\s*:\s*"?(\d+)/)?.[1]||String(meta.itemId);const body=first(node,n=>hasClass(n,'RichContent-inner'));if(!body)continue;
    const link=first(node,n=>n.tagName==='a'&&attr(n,'href').includes('/answer/'+id));
    const author=meta.authorName||plain(first(node,n=>hasClass(n,'AuthorInfo-name'))||{nodeName:''}).trim();
    const more=first(node,n=>n.tagName==='button'&&/展开阅读全文|查看全部|展开剩余/.test(plain({...n,tagName:'span'})));
    results.push(richSource(serialize(body as DefaultTreeAdapterMap['parentNode']),{title:meta.title,author,url:link?safeURL(attr(link,'href')):id,method,partial:!!more,notes:more?['该回答仍有未展开内容，请先在知乎展开全文后重新复制。']:[]}));
  }
  if(results.length)return results;
  // A normal copy from Zhihu includes these attribution lines at either end.
  const text=plain(doc),author=text.match(/(?:^|\n)作者[：:]\s*([^\n]+)/)?.[1]?.trim();
  const link=text.match(/(?:链接[：:]\s*)?(https:\/\/www\.zhihu\.com\/(?:question\/\d+\/)?answer\/\d+)/)?.[1];
  // Whole unrelated/login pages must not be mistaken for an answer.
  if(/<html\b/i.test(html)&&!first(doc,n=>hasClass(n,'RichText')||hasClass(n,'ztext')))
    throw new Error('网页中没有识别到回答正文。请展开目标回答，正常复制后在此粘贴。');
  const body=first(doc,n=>n.tagName==='body')||doc;
  return [richSource(serialize(body as DefaultTreeAdapterMap['parentNode']),{author,url:link,method})];
}
export function plainSource(text:string,meta:{title?:string;author?:string;url?:string;method?:ImportRecord['method']}={}):AnswerSource {
  const author=meta.author||text.match(/(?:^|\n)作者[：:]\s*([^\n]+)/)?.[1]?.trim();
  const url=meta.url||text.match(/https:\/\/www\.zhihu\.com\/(?:question\/\d+\/)?answer\/\d+/)?.[0];
  return richSource(text.split(/\r?\n/).map(line=>'<p>'+escapeHTML(line)+'</p>').join(''),{...meta,author,url,method:meta.method||'clipboard'});
}
