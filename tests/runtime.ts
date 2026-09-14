import { frameDocument,validMessage } from '../src/lib/runtime';
import { probeArtifact } from '../src/lib/client';
import type {AnswerArtifact}from '../src/lib/types';
const a:AnswerArtifact={version:1,answerId:'test',explanation:'TEST ONLY',blocks:[{id:'counter',afterParagraphId:'p1',title:'测试计数器',html:'<button id="add">增加</button><output id="count">0</output><button id="escape">尝试读取父页面</button><span id="boundary"></span>',css:'body{padding:20px}button{margin:10px}',js:'let n=0;document.querySelector("#add").onclick=()=>{document.querySelector("#count").textContent=String(++n);world.emit("count",n)};document.querySelector("#escape").onclick=()=>{try{parent.document.body;document.querySelector("#boundary").textContent="FAIL"}catch{document.querySelector("#boundary").textContent="DOM 隔离通过"}};',height:160}],bindings:[],scene:[],provenance:{method:'api',runId:'TEST-ONLY',sourceHash:'test',model:'TEST-ONLY',tier:'balanced',createdAt:'2026-09-06',prompt:'TEST ONLY'}};
const checks=document.querySelector('#checks')!;
const record=(text:string)=>{const p=document.createElement('p');p.textContent=text;checks.append(p)};
const frame=document.createElement('iframe');frame.title='测试计数器';frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='width:90%;height:200px;border:1px solid #ddd';const channel='test-channel';
window.addEventListener('message',e=>{if(!validMessage(e,frame.contentWindow,channel,'counter'))return;if(e.data.type==='binding')record('正文绑定收到：'+JSON.stringify(e.data.value));if(e.data.type==='ready')record('启动消息：通过')});
frame.srcdoc=frameDocument(a.blocks[0],channel,location.origin);document.querySelector('#frames')!.append(frame);
try{await probeArtifact(a,new AbortController().signal);record('候选产物启动检查：通过')}catch(e){record('FAIL: '+String(e))}
const broken=structuredClone(a);broken.blocks[0].js='throw new Error("TEST EXPECTED ERROR")';
try{await probeArtifact(broken,new AbortController().signal);record('FAIL: 未捕获运行错误')}catch{record('运行错误检查：通过（已阻止替换旧版）')}
