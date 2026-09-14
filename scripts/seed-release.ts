import {readFile,readdir} from 'node:fs/promises';
import {parse} from 'dotenv';
import {validateSource,validateArtifact} from '../src/lib/validation';
const env={...process.env,...parse(await readFile('.dev.vars','utf8'))};if(!env.RELEASE_URL||!env.RUNNER_TOKEN)throw Error('需要 RELEASE_URL 和 RUNNER_TOKEN');
for(const name of (await readdir('src/data/generated')).filter(n=>n.endsWith('.json'))){const a=JSON.parse(await readFile('src/data/generated/'+name,'utf8'));validateSource(a.source);validateArtifact(a.artifact,a.source);for(const [path,body]of [['/api/admin/seed',a],['/api/admin/media/'+a.source.id,{assets:a.assets||[]}]]){const r=await fetch(env.RELEASE_URL+path,{method:'POST',headers:{Authorization:'Bearer '+env.RUNNER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('迁移失败 '+a.source.id+': '+r.status+' '+await r.text())}console.log('Preserved '+a.source.id+' media='+(a.assets?.length||0))}
