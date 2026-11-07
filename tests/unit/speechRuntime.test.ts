import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

interface RuntimeResult {
  submittedStatus:number;
  status:number;
  body:{status:string;duration?:number};
  bytes?:number[];
  calls:{url:string;method:string;redirect:string;hasAuthorization:boolean}[];
}

// Unit tests use Node's Request, which accepts redirect:"error". The deployed
// workerd constructor rejects it before I/O, so exercise the actual source with
// native workerd Request validation and an entirely local provider transport.
const fixture=`
import {MashaSpeech} from './worker/speech.ts';
export default {
  async fetch(incoming) {
    const mode=new URL(incoming.url).pathname.slice(1);
    if(mode==='request-proof') {
      let unsupported;
      try { new Request('https://example.invalid',{redirect:'error'}); }
      catch(error) { unsupported={name:error.name,message:error.message}; }
      return Response.json({unsupported,manual:new Request('https://example.invalid',{redirect:'manual'}).redirect});
    }
    const data=new Map(),calls=[];
    const state={
      storage:{
        async get(key){return Array.isArray(key)?new Map(key.filter(k=>data.has(k)).map(k=>[k,structuredClone(data.get(k))])):structuredClone(data.get(key));},
        async put(key,value){for(const [k,v] of typeof key==='string'?[[key,value]]:Object.entries(key))data.set(k,structuredClone(v));}
      },
      blockConcurrencyWhile:fn=>fn()
    };
    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async (input,init)=>{
      // This is the real workerd constructor, not Node's or a fake Request.
      const request=new Request(input,init);
      calls.push({url:request.url,method:request.method,redirect:request.redirect,hasAuthorization:request.headers.has('authorization')});
      if(request.method==='POST')return mode==='submit-redirect'
        ?new Response(null,{status:307,headers:{location:'https://attacker.invalid/collect'}})
        :Response.json({request_id:'test-request',status_url:'https://queue.fal.run/fal-ai/minimax/requests/test-request/status',response_url:'https://queue.fal.run/fal-ai/minimax/requests/test-request'});
      if(request.url.endsWith('/status'))return Response.json({status:'COMPLETED'});
      if(request.url==='https://queue.fal.run/fal-ai/minimax/requests/test-request')return Response.json({audio:{url:'https://v3.fal.media/test.mp3'},duration_ms:1250});
      if(request.url==='https://v3.fal.media/test.mp3')return mode==='audio-redirect'
        ?new Response(null,{status:302,headers:{location:'https://attacker.invalid/collect'}})
        :new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}});
      throw new Error('Unexpected local transport URL');
    };
    try {
      const worker=new MashaSpeech(state,{FAL_KEY:'test-only'});
      const first=await worker.fetch(new Request('https://storybook.invalid/api/speech',{method:'POST',body:JSON.stringify({text:'A runtime test line',lang:'en'})}));
      const submitted=await first.json();
      let status,body,bytes;
      if(submitted.id) {
        const response=await worker.fetch(new Request('https://storybook.invalid/api/speech/status/'+submitted.id));
        status=response.status;body=await response.json();
        if(body.status==='ready')bytes=[...new Uint8Array(await (await worker.fetch(new Request('https://storybook.invalid'+body.url))).arrayBuffer())];
      }
      return Response.json({submittedStatus:first.status,submitted,status,body,bytes,calls});
    }finally{globalThis.fetch=nativeFetch;}
  }
};`;

describe('Masha speech on the deployed JavaScript runtime',()=>{
  let runtime:Miniflare;
  beforeAll(async()=>{
    const bundle=await build({stdin:{contents:fixture,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
    runtime=new Miniflare({cf:false,telemetry:{enabled:false},enableDevRegistry:false,workers:[{config:{
      name:'speech-runtime-test',compatibilityDate:'2026-11-05',
      manifest:{mainModule:'worker.js',modulesRoot:'/',modules:{'worker.js':{type:'esm',contents:bundle.outputFiles[0].text}}}
    }}]});
    await runtime.ready;
  });
  afterAll(async()=>{await runtime?.dispose();});

  it('demonstrates the native runtime constraint that Node mocks miss',async()=>{
    const result=await (await runtime.dispatchFetch('http://localhost/request-proof')).json() as {unsupported:{name:string;message:string};manual:string};
    expect(result.unsupported.name).toBe('TypeError');
    expect(result.unsupported.message).toContain('Invalid redirect value');
    expect(result.manual).toBe('manual');
  });

  it('constructs every production provider/media request in workerd and stores the recording',async()=>{
    const result=await (await runtime.dispatchFetch('http://localhost/success')).json() as RuntimeResult;
    expect(result.submittedStatus).toBe(202);expect(result.status).toBe(200);
    expect(result.body).toMatchObject({status:'ready',duration:1.25});
    expect(result.bytes).toEqual([73,68,51,1,2,3]);
    expect(result.calls).toHaveLength(4);
    expect(result.calls.map((call:{redirect:string})=>call.redirect)).toEqual(['manual','manual','manual','manual']);
    expect(result.calls.map((call:{hasAuthorization:boolean})=>call.hasAuthorization)).toEqual([true,true,true,false]);
  });

  it.each(['submit-redirect','audio-redirect'])('rejects %s without following or accepting its payload',async(mode)=>{
    const result=await (await runtime.dispatchFetch('http://localhost/'+mode)).json() as RuntimeResult;
    if(mode==='submit-redirect'){
      expect(result.submittedStatus).toBe(503);expect(result.calls).toHaveLength(1);
    }else{
      expect(result.status).toBe(202);expect(result.body.status).toBe('pending');
      expect(result.calls).toHaveLength(4);expect(result.bytes).toBeUndefined();
    }
    expect(result.calls.every((call:{redirect:string,url:string})=>call.redirect==='manual'&&!call.url.includes('attacker.invalid'))).toBe(true);
  });
});
