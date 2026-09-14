import {answerAddress} from './rich-source';

export const MANUAL_WIDTH=1280,MANUAL_HEIGHT=800;
// Observed on Zhihu sign-in and in its public NetEase CAPTCHA loader.
const captchaHosts=new Set(['cstaticdun.126.net','cstaticdun1.126.net','c.dun.163.com','c.dun.163yun.com','c-v6.dun.163.com','ac.dun.163.com','ac.dun.163yun.com','ac-v6.dun.163yun.com','da.dun.163.com','necaptcha.nosdn.127.net','necaptcha-nosdn.126.net','ir-sdk.dun.163.com','ir-sdk.dun.163yun.com']);
export function isManualResource(value:string){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/(^|\.)(zhihu\.com|zhimg\.com|zhstatic\.com)$/.test(u.hostname)||captchaHosts.has(u.hostname))}catch{return false}
}
type Point={x:number;y:number};
export type ManualAction=
  |{type:'navigate';url:string}
  |{type:'click';x:number;y:number}
  |{type:'pointer';phase:'down'|'move'|'up';x:number;y:number}
  |{type:'drag';points:Point[]}
  |{type:'scroll';deltaY:number}
  |{type:'text';text:string}
  |{type:'key';key:string};
export function manualURL(value:string){
  if(value==='https://www.zhihu.com/signin'||value==='https://www.zhihu.com/')return value;
  return answerAddress(value)?.url;
}
export function validateManualAction(value:unknown):ManualAction{
  if(!value||typeof value!=='object')throw new Error('操作无效');const a=value as ManualAction;
  const point=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<MANUAL_WIDTH&&p.y>=0&&p.y<MANUAL_HEIGHT;
  switch(a.type){
    case 'navigate':{const url=typeof a.url==='string'?manualURL(a.url):undefined;if(url)return{type:a.type,url};break}
    case 'click':if(point(a))return{type:a.type,x:a.x,y:a.y};break;
    case 'pointer':if(point(a)&&['down','move','up'].includes(a.phase))return{type:a.type,phase:a.phase,x:a.x,y:a.y};break;
    case 'drag':if(Array.isArray(a.points)&&a.points.length>=2&&a.points.length<=100&&a.points.every(point))return{type:a.type,points:a.points.map(p=>({x:p.x,y:p.y}))};break;
    case 'scroll':if(Number.isFinite(a.deltaY)&&Math.abs(a.deltaY)<=3000)return{type:a.type,deltaY:a.deltaY};break;
    case 'text':if(typeof a.text==='string'&&a.text.length>0&&a.text.length<=2000)return{type:a.type,text:a.text};break;
    case 'key':if(['Enter','Tab','Shift+Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','ControlOrMeta+A'].includes(a.key))return{type:a.type,key:a.key};break;
  }throw new Error('操作内容或范围无效');
}
