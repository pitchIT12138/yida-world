import {answerAddress} from './rich-source';

const links=/https?:\/\/[^\s<>()[\]"']+/g;
const caption=/^([^\r\n]+?)\s+-\s+([^\r\n]+?)的回答\s+-\s+知乎$/;
export type AnswerShare={id:string;url:string;title?:string;author?:string};

/** A locator field accepts a share caption, a Markdown link, a URL, or an ID. */
export function answerShare(value:string):AnswerShare|undefined{
  const direct=answerAddress(value);if(direct)return direct;
  const found=(value.match(links)||[]).map(url=>answerAddress(url.replace(/[。，；：！？、）”’]+$/,''))).filter((a):a is NonNullable<typeof a>=>!!a);
  const unique=new Map(found.map(a=>[a.id,a]));if(unique.size!==1)return;
  const address=[...unique.values()][0];
  const label=value.slice(0,value.search(/https?:\/\//)).trim().replace(/[\[（("“]+$/,'').replace(/^["“]+/,'').trim();
  const meta=label.match(caption);
  return {...address,...(meta?{title:meta[1],author:meta[2]}:{})};
}

/** Avoid interpreting a full answer that merely cites a URL as a share card. */
export function shareOnly(value:string):AnswerShare|undefined{
  const share=answerShare(value);if(!share)return;
  if(answerAddress(value))return share;
  const remainder=value.replace(links,'').replace(/[\[\]()“”"'<>]/g,'').trim();
  return !remainder||caption.test(remainder)?share:undefined;
}

export function isHTMLSource(value:string){return /^\s*(?:<!doctype\s+html\b|<(?:html|body|div|p|article|section|h[1-6]|figure|blockquote|table|ul|ol|pre|img)\b)/i.test(value)}
