import {afterEach,describe,expect,it,vi} from 'vitest';
import type {DurableObjectState,DurableObjectNamespace} from '@cloudflare/workers-types';
import {MashaSpeech,SPEECH_CHARACTER_CAP} from '../../worker/speech';
import bridge from '../../worker/bridge';

const origin='https://storybook.example';
const post=(text='A brand new line',lang='en')=>new Request(origin+'/api/speech',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({text,lang})});
const get=(path:string)=>new Request(origin+path);
function memoryState(){
  const data=new Map<string,unknown>();let tail=Promise.resolve();
  const storage={
    async get(key:string|string[]){return Array.isArray(key)?new Map(key.filter(k=>data.has(k)).map(k=>[k,structuredClone(data.get(k))])):structuredClone(data.get(key));},
    async put(key:string|Record<string,unknown>,value?:unknown){for(const [k,v] of typeof key==='string'?[[key,value]]:Object.entries(key))data.set(k as string,structuredClone(v));},
  };
  const state={storage,blockConcurrencyWhile<T>(fn:()=>Promise<T>):Promise<T>{const work=tail.then(fn);tail=work.then(()=>undefined,()=>undefined);return work;}} as unknown as DurableObjectState;
  return {data,state};
}
const receipt=(n=1)=>({request_id:`request-${n}`,status_url:`https://queue.fal.run/fal-ai/minimax/requests/request-${n}/status`,response_url:`https://queue.fal.run/fal-ai/minimax/requests/request-${n}`});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('paid Masha speech coordinator',()=>{
  it('deduplicates simultaneous normalized lines and persists the selected voice recipe before charging',async()=>{
    const {state,data}=memoryState();
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST'){
        expect(data.get('reservedCharacters')).toBe('Hello, Bear!'.length);
        expect([...data.entries()].some(([key,value])=>key.startsWith('job:')&&(value as {status:string}).status==='submitting')).toBe(true);
        const input=JSON.parse(String(init.body));
        expect(input.voice_setting).toEqual({voice_id:'Lively_Girl',speed:1,vol:1,pitch:0,emotion:'happy',english_normalization:false});
        expect(input.language_boost).toBe('English');
        return Response.json(receipt());
      }
      expect(url).toBe(receipt().status_url);return Response.json({status:'IN_PROGRESS'});
    });vi.stubGlobal('fetch',fetch);
    const worker=new MashaSpeech(state,{FAL_KEY:'test-only'});
    const replies=await Promise.all([worker.fetch(post('  Hello,\n Bear!  ')),worker.fetch(post('Hello, Bear!'))]);
    const bodies=await Promise.all(replies.map(r=>r.json()));
    expect(bodies[0].id).toBe(bodies[1].id);
    expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect(data.get('reservedCharacters')).toBe(12);
  });

  it('keeps language identities separate for the same text',async()=>{
    const {state}=memoryState();let submissions=0;
    const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?Response.json(receipt(++submissions)):Response.json({status:'IN_QUEUE'}));vi.stubGlobal('fetch',fetch);
    const worker=new MashaSpeech(state,{FAL_KEY:'test-only'});
    const en=await (await worker.fetch(post('Ha!','en'))).json();const ru=await (await worker.fetch(post('Ha!','ru'))).json();
    expect(en.id).not.toBe(ru.id);expect(submissions).toBe(2);
    const inputs=fetch.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init!.body)));
    expect(inputs.map(x=>x.language_boost)).toEqual(['English','Russian']);
  });

  it('enforces the durable lifetime allowance before any provider request',async()=>{
    const {state,data}=memoryState();data.set('reservedCharacters',SPEECH_CHARACTER_CAP-3);
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const response=await new MashaSpeech(state,{FAL_KEY:'test-only'}).fetch(post('four'));
    expect(response.status).toBe(429);expect(await response.json()).toEqual({error:'voice_allowance_reached'});
    expect(fetch).not.toHaveBeenCalled();expect(data.get('reservedCharacters')).toBe(SPEECH_CHARACTER_CAP-3);
  });

  it('never resubmits an ambiguous paid request, including after object recreation',async()=>{
    const {state,data}=memoryState();const fetch=vi.fn(async()=>{throw new Error('connection lost after submit');});vi.stubGlobal('fetch',fetch);
    const first=await new MashaSpeech(state,{FAL_KEY:'test-only'}).fetch(post('Unknown outcome'));
    const retry=await new MashaSpeech(state,{FAL_KEY:'test-only'}).fetch(post('Unknown outcome'));
    expect(first.status).toBe(503);expect(retry.status).toBe(503);expect(fetch).toHaveBeenCalledOnce();
    expect(data.get('reservedCharacters')).toBe('Unknown outcome'.length);
  });

  it('caches complete audio across restarts and never sends the secret to its CDN',async()=>{
    const {state}=memoryState();const bytes=new Uint8Array(130123).map((_,i)=>i%251);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST')return Response.json(receipt());
      if(url===receipt().status_url)return Response.json({status:'COMPLETED'});
      if(url===receipt().response_url)return Response.json({audio:{url:'https://v3b.fal.media/voice.mp3'},duration_ms:2042});
      expect(url).toBe('https://v3b.fal.media/voice.mp3');expect(new Headers(init?.headers).get('authorization')).toBeNull();
      return new Response(bytes,{headers:{'content-type':'audio/mpeg'}});
    });vi.stubGlobal('fetch',fetch);
    const worker=new MashaSpeech(state,{FAL_KEY:'test-only'});const pending=await (await worker.fetch(post())).json();
    const ready=await (await worker.fetch(get('/api/speech/status/'+pending.id))).json();
    expect(ready.status).toBe('ready');expect(ready.duration).toBe(2.042);
    const fresh=new MashaSpeech(state,{FAL_KEY:'test-only'});const response=await fresh.fetch(get(ready.url));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    const again=await (await fresh.fetch(post())).json();expect(again).toEqual(ready);expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not fetch an untrusted result URL or expose the provider credential',async()=>{
    const {state}=memoryState();const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST')return Response.json(receipt());
      if(url===receipt().status_url)return Response.json({status:'COMPLETED'});
      return Response.json({audio:{url:'https://attacker.example/steal'},duration_ms:1000});
    });vi.stubGlobal('fetch',fetch);
    const worker=new MashaSpeech(state,{FAL_KEY:'test-only-secret'});const pending=await (await worker.fetch(post())).json();
    const response=await worker.fetch(get('/api/speech/status/'+pending.id));
    expect(response.status).toBe(202);expect(await response.text()).not.toContain('test-only-secret');
    expect(fetch.mock.calls.some(([url])=>url.includes('attacker.example'))).toBe(false);
  });

  it('can recover a transient result-fetch failure without spending twice',async()=>{
    const {state}=memoryState();let resultAttempts=0;let clock=10000;vi.spyOn(Date,'now').mockImplementation(()=>clock);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST')return Response.json(receipt());
      if(url===receipt().status_url)return Response.json({status:'COMPLETED'});
      if(url===receipt().response_url)return ++resultAttempts===1?new Response('temporary',{status:503}):Response.json({audio:{url:'https://v3b.fal.media/recovered.mp3'},duration_ms:1000});
      return new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}});
    });vi.stubGlobal('fetch',fetch);
    const worker=new MashaSpeech(state,{FAL_KEY:'test-only'});
    const pending=await (await worker.fetch(post('Recover this line'))).json();
    const first=await worker.fetch(get('/api/speech/status/'+pending.id));
    expect(first.status).toBe(202);
    clock+=2000;
    const recovered=await (await worker.fetch(post('Recover this line'))).json();expect(recovered.status).toBe('ready');
    expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  });
});

describe('speech bridge protects the paid route and private recordings',()=>{
  const stub=vi.fn(async()=>Response.json({status:'pending',id:'a'.repeat(64)}));
  const namespace={idFromName:()=>({}),get:()=>({fetch:stub})} as unknown as DurableObjectNamespace;
  it('authenticates before invoking the speech object, including media GETs',async()=>{
    stub.mockClear();const service=vi.fn(async()=>new Response(null,{status:302}));
    const env={ASSETS:{fetch:vi.fn()},STORY_SERVICE:{fetch:service},MASHA_SPEECH:namespace};
    for(const request of [post(),get('/api/speech/audio/'+'a'.repeat(64))])expect((await bridge.fetch(request,env)).status).toBe(401);
    expect(stub).not.toHaveBeenCalled();expect(service.mock.calls).toHaveLength(2);
  });
  it('rejects cross-origin generation before reaching the object',async()=>{
    stub.mockClear();const request=new Request(origin+'/api/speech',{method:'POST',headers:{origin:'https://elsewhere.example'},body:'{}'});
    const res=await bridge.fetch(request,{ASSETS:{fetch:vi.fn()},STORY_SERVICE:{fetch:async()=>new Response(null,{status:200})},MASHA_SPEECH:namespace});
    expect(res.status).toBe(403);expect(stub).not.toHaveBeenCalled();
  });
});
