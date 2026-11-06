// Optional live smoke test: key arrives only over stdin, never persisted or logged.
import {readFileSync,writeFileSync} from 'node:fs';
import {handleDirect} from '../worker/direct';
import {initialWorldState} from '../src/compiler/worldState';
const key=readFileSync(0,'utf8').trim();if(!key.startsWith('sk-ant-'))throw new Error('No Anthropic key supplied');
const body={lang:'ru',paragraph:'Медведица машет Мишке. Заяц берёт морковку. Свинка танцует. Белочка прыгает. Медведь-спортсмен хлопает.',previous:[],worldState:initialWorldState(),episodeId:'expansion-smoke',paragraphId:'new-cast',model:'claude-haiku-5-5'};
const response=await handleDirect(new Request('https://local-test/api/direct',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{ANTHROPIC_API_KEY:key});
const result=await response.json() as any;
const report={http:response.status,source:result.source,model:result.model,usage:result.usage,error:result.error,actors:[...new Set(result.beatScript?.beats?.map((b:any)=>b.actor))],beats:result.beatScript?.beats?.map((b:any)=>({actor:b.actor,verb:b.verb,target:b.target,line:b.line}))};
writeFileSync('docs/expansion/director-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
