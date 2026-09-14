import {mount} from 'svelte';
import FlowReview from './FlowReview.svelte';
import '../src/style.css';
const report=(message:string)=>{const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='宿主异常：'+message;document.body.prepend(p)};
window.addEventListener('error',e=>report(e.message));
window.addEventListener('unhandledrejection',e=>report(String(e.reason)));
mount(FlowReview,{target:document.getElementById('app')!});
