import {MASHA_VOICE,mashaSpeechInput,speechKey,speechText} from '../src/shared/speech';
import type {Lang} from '../src/shared/schema';
import type {DurableObjectNamespace,DurableObjectState} from '@cloudflare/workers-types';

export interface SpeechEnv { FAL_KEY?:string; MASHA_SPEECH?:DurableObjectNamespace; }
interface Job { id:string;text:string;lang:Lang;status:'submitting'|'pending'|'ready'|'failed';requestId?:string;statusUrl?:string;resultUrl?:string;duration?:number;chunks?:number;error?:string;checkedAt?:number; }
const QUEUE='https://queue.fal.run/';
// Fixed lifetime generation allowance: 10,000 characters = $1 at the checked
// MiniMax rate. Reservations survive restarts and unknown submissions are not retried.
export const SPEECH_CHARACTER_CAP=10000;
export const SPEECH_LINE_LIMIT=500;
const CHUNK=60000;
const reply=(data:unknown,status=200)=>Response.json(data,{status});
const validId=(id:string)=>/^[a-f0-9]{64}$/.test(id);
async function idFor(text:string,lang:Lang):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(MASHA_VOICE.revision+':'+speechKey(text,lang)));
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function queueUrl(url:unknown):url is string {
  return typeof url==='string'&&/^https:\/\/queue\.fal\.run\/fal-ai\/minimax\/requests\/[a-zA-Z0-9-]+(?:\/status)?$/.test(url);
}
function mediaUrl(url:unknown):url is string {
  if(typeof url!=='string')return false;
  try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='fal.media'||u.hostname.endsWith('.fal.media'))&&!u.username&&!u.password;}catch{return false;}
}

/** A single durable coordinator deduplicates lines, reserves spend and stores audio. */
export class MashaSpeech {
  constructor(private state:DurableObjectState,private env:SpeechEnv){}
  private async upstream(url:string,init?:RequestInit):Promise<Response>{
    // workerd supports manual/follow, but rejects redirect:"error" before I/O.
    // Manual plus the caller's status checks also prevents credential forwarding.
    return fetch(url,{...init,headers:{...init?.headers,Authorization:`Key ${this.env.FAL_KEY}`},signal:AbortSignal.timeout(8000),redirect:'manual'});
  }
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url),tail=url.pathname.split('/').pop()??'';
    if(request.method==='GET'&&url.pathname.startsWith('/api/speech/audio/')){
      if(!validId(tail))return reply({error:'invalid_id'},400);
      const job=await this.state.storage.get<Job>('job:'+tail);
      if(!job||job.status!=='ready')return reply({error:'recording_not_found'},404);
      const keys=Array.from({length:job.chunks!},(_,i)=>`audio:${tail}:${i}`);
      const chunks=await this.state.storage.get<ArrayBuffer>(keys);
      const total=keys.reduce((n,k)=>n+(chunks.get(k)?.byteLength??0),0),bytes=new Uint8Array(total);
      let offset=0;for(const key of keys){const chunk=chunks.get(key);if(!chunk)return reply({error:'recording_incomplete'},503);bytes.set(new Uint8Array(chunk),offset);offset+=chunk.byteLength;}
      return new Response(bytes,{headers:{'content-type':'audio/mpeg','content-length':String(bytes.byteLength)}});
    }
    return this.state.blockConcurrencyWhile(async()=>{
      if(request.method==='POST'&&url.pathname==='/api/speech'){
        if(!this.env.FAL_KEY)return reply({error:'speech_not_configured'},503);
        let body:{text?:unknown;lang?:unknown};
        try{const raw=await request.text();if(raw.length>4000)return reply({error:'line_too_long'},413);body=JSON.parse(raw);}catch{return reply({error:'invalid_request'},400);}
        if(typeof body.text!=='string'||!['en','ru'].includes(String(body.lang)))return reply({error:'invalid_request'},400);
        const text=speechText(body.text),lang=body.lang as Lang;
        if(!text||text.length>SPEECH_LINE_LIMIT)return reply({error:'line_too_long'},400);
        const id=await idFor(text,lang),existing=await this.state.storage.get<Job>('job:'+id);
        if(existing)return this.status(existing);
        const reserved=await this.state.storage.get<number>('reservedCharacters')??0;
        if(reserved+text.length>SPEECH_CHARACTER_CAP)return reply({error:'voice_allowance_reached'},429);
        // Persist BEFORE network I/O. A connection failure is not proof no job ran.
        const job:Job={id,text,lang,status:'submitting'};
        await this.state.storage.put({'reservedCharacters':reserved+text.length,['job:'+id]:job});
        try{
          const res=await this.upstream(QUEUE+MASHA_VOICE.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(mashaSpeechInput(text,lang))});
          if(!res.ok){
            console.warn('Masha speech submission rejected',{status:res.status});
            throw new Error('speech_submission_failed');
          }
          const data=await res.json() as {request_id?:string;status_url?:string;response_url?:string};
          if(!data.request_id||!queueUrl(data.status_url)||!queueUrl(data.response_url)){
            console.warn('Masha speech queue response invalid',{hasRequestId:!!data.request_id,statusUrlValid:queueUrl(data.status_url),resultUrlValid:queueUrl(data.response_url)});
            throw new Error('speech_submission_unknown');
          }
          Object.assign(job,{status:'pending',requestId:data.request_id,statusUrl:data.status_url,resultUrl:data.response_url});
        }catch(error){
          // Operational diagnostics deliberately exclude provider bodies, user
          // dialogue and credentials. Unknown submissions are still not retried.
          console.warn('Masha speech submission held',{error:error instanceof Error?error.name:'unknown'});
          job.status='failed';job.error='speech_submission_needs_review';
        }
        await this.state.storage.put('job:'+id,job);
        // Poll in a separate request: submit + status + result + download could
        // otherwise exceed the Durable Object's concurrency-block wall deadline.
        return job.status==='pending'?reply({status:'pending',id:job.id},202):reply({error:job.error},503);
      }
      if(request.method==='GET'&&url.pathname.startsWith('/api/speech/status/')&&validId(tail)){
        const job=await this.state.storage.get<Job>('job:'+tail);
        if(!job)return reply({error:'job_not_found'},404);
        return this.status(job);
      }
      return reply({error:'method_not_allowed'},405);
    });
  }
  private async status(job:Job):Promise<Response>{
    if(job.status==='submitting')return reply({error:'speech_submission_needs_review'},503);
    if(job.status==='failed')return reply({error:job.error??'speech_failed'},503);
    if(job.status==='pending'&&this.env.FAL_KEY&&Date.now()-(job.checkedAt??0)>1000){
      job.checkedAt=Date.now();await this.state.storage.put('job:'+job.id,job);
      try{
        const response=await this.upstream(job.statusUrl!);
        if(!response.ok)return reply({status:'pending',id:job.id},202);
        const data=await response.json() as {status?:string};
        if(data.status==='COMPLETED'){
          const result=await this.upstream(job.resultUrl!);
          if(result.status>=500||result.status===429||result.status===408)return reply({status:'pending',id:job.id},202);
          if(!result.ok){job.status='failed';job.error='speech_generation_failed';}
          else{
            const output=await result.json() as {audio?:{url?:string};duration_ms?:number};
            if(!mediaUrl(output.audio?.url)||!(Number(output.duration_ms)>0&&Number(output.duration_ms)<120000))throw new Error('invalid_result');
            const audio=await fetch(output.audio!.url!,{signal:AbortSignal.timeout(8000),redirect:'manual'});
            if(!audio.ok)throw new Error('audio_download_failed');
            const bytes=await audio.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>2_000_000)throw new Error('invalid_audio');
            const chunks:Record<string,ArrayBuffer>={};
            for(let i=0;i<Math.ceil(bytes.byteLength/CHUNK);i++)chunks[`audio:${job.id}:${i}`]=bytes.slice(i*CHUNK,(i+1)*CHUNK);
            await this.state.storage.put(chunks);
            Object.assign(job,{status:'ready',duration:Number(output.duration_ms)/1000,chunks:Object.keys(chunks).length});
          }
          await this.state.storage.put('job:'+job.id,job);
        }else if(data.status!=='IN_QUEUE'&&data.status!=='IN_PROGRESS'){
          job.status='failed';job.error='speech_generation_failed';await this.state.storage.put('job:'+job.id,job);
        }
      }catch{return reply({status:'pending',id:job.id},202);}
    }
    if(job.status==='failed')return reply({error:job.error},503);
    return job.status==='ready'?reply({status:'ready',id:job.id,url:`/api/speech/audio/${job.id}`,duration:job.duration}):reply({status:'pending',id:job.id},202);
  }
}

export async function handleSpeech(request:Request,env:SpeechEnv):Promise<Response>{
  if(!env.MASHA_SPEECH)return reply({error:'speech_not_configured'},503);
  // Browser test typings and workerd expose equivalent Fetch interfaces with
  // different TypeScript brands; the deployed binding uses workerd's Request.
  const object=env.MASHA_SPEECH.get(env.MASHA_SPEECH.idFromName(MASHA_VOICE.revision)) as unknown as {fetch(request:Request):Promise<Response>};
  return object.fetch(request);
}
