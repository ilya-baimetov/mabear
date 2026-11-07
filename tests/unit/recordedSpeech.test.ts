import {afterEach,describe,expect,it,vi} from 'vitest';
import {RecordedSpeechBank} from '../../src/engine/audio/recordedSpeech';
import recordings from '../../src/shared/recordedSpeech.json';
import {speechKey,type SpeechRecording} from '../../src/shared/speech';
import type {Timeline,Lang} from '../../src/shared/schema';

function context(duration=1.25){
  return {decodeAudioData:vi.fn(async()=>({duration}) as AudioBuffer)} as unknown as AudioContext;
}
function timeline(lines:{text:string;lang:Lang;start:number;duration?:number;actor?:string}[],offset=0,duration=10):Timeline{
  return {duration:offset+duration,segments:[{offset,segment:{duration,dialogue:lines.map(l=>({text:l.text,lang:l.lang,start:l.start,dur:l.duration??2,actor:l.actor??'masha',visemes:[]})),emotes:[],foley:[],sfx:[],ambience:[],music:[],ducking:[]}}]} as unknown as Timeline;
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

describe('selected Masha recording bank',()=>{
  it('does not spend when the browser cannot decode or play audio',async()=>{
    const request=vi.fn();const bank=new RecordedSpeechBank(()=>null,request as typeof fetch);
    await expect(bank.load('New voice line without audio support','en')).rejects.toThrow('audio_unavailable');
    expect(request).not.toHaveBeenCalled();
  });
  it('reuses the exact baked selected voice without a paid API call or browser speech',async()=>{
    const line=(recordings as SpeechRecording[])[0],ctx=context(1.234);
    const browserSpeech=vi.fn();vi.stubGlobal('speechSynthesis',{speak:browserSpeech});
    const request=vi.fn(async(_path:string)=>new Response(new Uint8Array([73,68,51])));
    const bank=new RecordedSpeechBank(()=>ctx,request as typeof fetch);
    const [a,b]=await Promise.all([bank.load(line.text,line.lang),bank.load(line.text,line.lang)]);
    expect(a).toBe(b);expect(a.recording.url).toBe(line.url);expect(a.buffer.duration).toBe(1.234);
    expect(request).toHaveBeenCalledOnce();expect(request.mock.calls[0][0]).toBe(line.url);
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();expect(browserSpeech).not.toHaveBeenCalled();
    expect(await bank.load(line.text,line.lang)).toBe(a);expect(request).toHaveBeenCalledOnce();
  });

  it('prepares only selected-range Masha lines, including a sentence already in progress',async()=>{
    const ctx=context(1.75);const id='a'.repeat(64);
    const request=vi.fn(async(path:string,init?:RequestInit)=>path==='/api/speech'?Response.json({status:'ready',id,url:'/api/speech/audio/'+id,duration:1}):new Response(new Uint8Array([1,2,3])));
    const bank=new RecordedSpeechBank(()=>ctx,request as typeof fetch);
    const tl=timeline([{text:'Before',lang:'en',start:0,duration:1},{text:'Already speaking',lang:'en',start:2,duration:3},{text:'Later',lang:'en',start:7},{text:'Bear stays wordless',lang:'en',start:4,actor:'bear'}]);
    const durations=await bank.prepare(tl,'en',3,6);
    expect(durations).toEqual({[speechKey('Already speaking','en')]:1.75});
    const submitted=request.mock.calls.filter(([path])=>path==='/api/speech').map(([,init])=>JSON.parse(String(init!.body)));
    expect(submitted).toEqual([{text:'Already speaking',lang:'en'}]);
    expect(bank.get('Before','en')).toBeUndefined();expect(bank.get('Later','en')).toBeUndefined();
  });

  it('keeps identical text in Russian and English as distinct cache entries',async()=>{
    const ctx=context(),id='b'.repeat(64);
    const request=vi.fn(async(path:string)=>path==='/api/speech'?Response.json({status:'ready',id,url:'/api/speech/audio/'+id,duration:1}):new Response(new Uint8Array([1])));
    const bank=new RecordedSpeechBank(()=>ctx,request as typeof fetch);
    await Promise.all([bank.load('Rare audition line','en'),bank.load('Rare audition line','ru')]);
    expect(request.mock.calls.filter(([path])=>path==='/api/speech')).toHaveLength(2);
    expect(bank.get('Rare audition line','en')).not.toBe(bank.get('Rare audition line','ru'));
  });

  it('surfaces generation denial and never falls back to device speech',async()=>{
    const speak=vi.fn();vi.stubGlobal('speechSynthesis',{speak});
    const request=vi.fn(async()=>Response.json({error:'voice_allowance_reached'},{status:429}));
    const bank=new RecordedSpeechBank(()=>context(),request as typeof fetch);
    await expect(bank.load('A line outside the recording collection','en')).rejects.toThrow('voice_allowance_reached');
    expect(speak).not.toHaveBeenCalled();expect(request).toHaveBeenCalledOnce();
    expect(bank.get('A line outside the recording collection','en')).toBeUndefined();
  });

  it('uses one accepted job through polling and never posts it again',async()=>{
    vi.useFakeTimers();const id='c'.repeat(64);const requests:string[]=[];
    const request=vi.fn(async(path:string)=>{
      requests.push(path);
      if(path==='/api/speech')return Response.json({status:'pending',id});
      if(path==='/api/speech/status/'+id)return Response.json({status:'ready',id,url:'/api/speech/audio/'+id,duration:2});
      return new Response(new Uint8Array([1]));
    });
    const bank=new RecordedSpeechBank(()=>context(2),request as typeof fetch);
    const job=bank.load('A unique newly written thought','en');
    await vi.advanceTimersByTimeAsync(2100);const result=await job;
    expect(result.buffer.duration).toBe(2);expect(requests).toEqual(['/api/speech','/api/speech/status/'+id,'/api/speech/audio/'+id]);
  });

  it('rejects untrusted or malformed playback URLs before fetching them',async()=>{
    const request=vi.fn(async()=>Response.json({status:'ready',id:'d'.repeat(64),url:'https://elsewhere.example/audio.mp3',duration:2}));
    const bank=new RecordedSpeechBank(()=>context(),request as typeof fetch);
    await expect(bank.load('Another new thought','en')).rejects.toThrow('speech_not_ready');expect(request).toHaveBeenCalledOnce();
  });

  it('holds a newly appended paragraph at its boundary until that paragraph is voiced',async()=>{
    const line=(recordings as SpeechRecording[])[0];
    const first=timeline([{text:line.text,lang:line.lang,start:0}],0,5);
    const second=timeline([{text:'New words after the first scene',lang:'en',start:1}],5,5);
    const tl:Timeline={duration:10,segments:[...first.segments,...second.segments]};
    const bank=new RecordedSpeechBank(()=>context(),vi.fn(async()=>new Response(new Uint8Array([1]))) as typeof fetch);
    expect(bank.readyUntil(tl,'en',0)).toBe(0);
    await bank.load(line.text,line.lang);
    expect(bank.readyUntil(tl,'en',0)).toBe(5);expect(bank.readyUntil(tl,'en',3)).toBe(5);
  });
});
