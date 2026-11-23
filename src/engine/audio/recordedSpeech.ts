import recordings from '../../shared/recordedSpeech.json';
import {
  speechKey,
  speechText,
  type SpeechErrorResponse,
  type SpeechRecording,
  type SpeechRequest,
  type SpeechStatusResponse,
} from '../../shared/speech';
import type {Lang, Timeline} from '../../shared/schema';
import {interjection} from './tts';
import {flattenTimeline} from './scheduler';

const BUILT_IN = new Map((recordings as SpeechRecording[]).map(r => [speechKey(r.text,r.lang),r]));
export class SpeechUnavailable extends Error {
  constructor(readonly code: string) { super(code); }
}
interface Prepared { recording: SpeechRecording; buffer: AudioBuffer; }

function withTimeoutSignal(parent: AbortSignal, ms: number): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  if (parent.aborted) {
    ctrl.abort(parent.reason);
    return { signal: ctrl.signal, cleanup: () => {} };
  }
  const onAbort = () => ctrl.abort(parent.reason);
  parent.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms);
  return {
    signal: ctrl.signal,
    cleanup() {
      clearTimeout(timer);
      parent.removeEventListener('abort', onAbort);
    },
  };
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new SpeechUnavailable('speech_aborted'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SpeechUnavailable('speech_aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** One identity, one unmodified recording per line. Decode once, resume via AudioContext. */
export class RecordedSpeechBank {
  private ready = new Map<string, Prepared>();
  private pending = new Map<string, Promise<Prepared>>();
  private controller = new AbortController();
  private disposed = false;
  constructor(private context: () => AudioContext | null, private request: typeof fetch = (...args) => fetch(...args)) {}
  get(text: string, lang: Lang): Prepared | undefined { return this.ready.get(speechKey(text,lang)); }
  readyUntil(timeline:Timeline,lang:Lang,from:number):number {
    for(const {offset,segment} of timeline.segments){
      if(offset+segment.duration<=from)continue;
      if(segment.dialogue.some(c=>c.actor==='masha'&&offset+c.start+c.dur>from&&!this.get(c.text,c.lang??lang)))return offset;
      if(segment.emotes.some(c=>{const text=c.actor==='masha'?interjection('masha',c.emote,lang):null;return text&&offset+c.start>=from&&!this.get(text,lang);}))return offset;
    }
    return timeline.duration;
  }

  private async json(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    if (this.disposed || this.controller.signal.aborted) throw new SpeechUnavailable('speech_aborted');
    const { signal, cleanup } = withTimeoutSignal(this.controller.signal, 20000);
    try {
      const response = await this.request(path, { ...init, signal });
      const body = await response.json().catch(() => ({})) as Partial<SpeechErrorResponse> & Record<string, unknown>;
      if (!response.ok) throw new SpeechUnavailable(typeof body.error === 'string' ? body.error : `speech_http_${response.status}`);
      return body;
    } finally {
      cleanup();
    }
  }
  async load(text: string, lang: Lang): Promise<Prepared> {
    if(this.disposed||this.controller.signal.aborted)throw new SpeechUnavailable('speech_aborted');
    if(!this.context())throw new SpeechUnavailable('audio_unavailable');
    const key=speechKey(text,lang), hit=this.ready.get(key);
    if(hit)return hit;
    const waiting=this.pending.get(key); if(waiting)return waiting;
    const job=(async()=>{
      let recording=BUILT_IN.get(key);
      if(!recording){
        const payload: SpeechRequest = { text: speechText(text), lang };
        let result=await this.json('/api/speech',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}) as Partial<SpeechStatusResponse>;
        for(let poll=0;result.status==='pending'&&poll<60;poll++){
          if(this.disposed||this.controller.signal.aborted)throw new SpeechUnavailable('speech_aborted');
          if(typeof result.id!=='string'||!/^[a-f0-9]{64}$/.test(result.id))throw new SpeechUnavailable('invalid_speech_job');
          await abortableSleep(2000, this.controller.signal);
          if(this.disposed||this.controller.signal.aborted)throw new SpeechUnavailable('speech_aborted');
          result=await this.json(`/api/speech/status/${result.id}`) as Partial<SpeechStatusResponse>;
        }
        if(result.status!=='ready'||typeof result.url!=='string'||!result.url.startsWith('/api/speech/audio/'))throw new SpeechUnavailable('speech_not_ready');
        recording={text:speechText(text),lang,url:result.url,duration:Number(result.duration)};
      }
      if(this.disposed||this.controller.signal.aborted)throw new SpeechUnavailable('speech_aborted');
      const { signal, cleanup } = withTimeoutSignal(this.controller.signal, 20000);
      let response: Response;
      try {
        response = await this.request(recording.url, { signal });
      } finally {
        cleanup();
      }
      if(this.disposed||this.controller.signal.aborted)throw new SpeechUnavailable('speech_aborted');
      if(!response.ok)throw new SpeechUnavailable('speech_download_failed');
      const ctx=this.context(); if(!ctx)throw new SpeechUnavailable('audio_unavailable');
      const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
      if(this.disposed||this.controller.signal.aborted)throw new SpeechUnavailable('speech_aborted');
      if(!(buffer.duration>0&&buffer.duration<120))throw new SpeechUnavailable('invalid_recording');
      const prepared={recording:{...recording,duration:buffer.duration},buffer};
      this.ready.set(key,prepared);
      return prepared;
    })();
    this.pending.set(key,job);
    try{return await job;}finally{this.pending.delete(key);}
  }
  async prepare(timeline: Timeline, lang: Lang, from=0, to=timeline.duration): Promise<Record<string,number>> {
    if(this.disposed||this.controller.signal.aborted)return {};
    const flat=flattenTimeline(timeline), lines=new Map<string,{text:string;lang:Lang}>();
    for(const cue of flat.dialogue)if(cue.actor==='masha'&&cue.t+cue.dur>from&&cue.t<to){
      const l=cue.lang??lang; lines.set(speechKey(cue.text,l),{text:cue.text,lang:l});
    }
    for(const cue of flat.emotes)if(cue.actor==='masha'&&cue.t>=from&&cue.t<to){
      const text=interjection('masha',cue.emote,lang);if(text)lines.set(speechKey(text,lang),{text,lang});
    }
    const queue=[...lines.values()], durations:Record<string,number>={};
    await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
      while(queue.length&&!this.disposed&&!this.controller.signal.aborted){
        const line=queue.shift()!;
        const r=await this.load(line.text,line.lang);
        durations[speechKey(line.text,line.lang)]=r.buffer.duration;
      }
    }));
    return durations;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    this.ready.clear();
    this.pending.clear();
  }
}
