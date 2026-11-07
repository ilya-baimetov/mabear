// Run against Vite: node scripts/checkMusic.mjs [origin]. Captures the actual WebAudio score.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = new URL('../docs/music-upgrade/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
  const page = await browser.newPage();
  await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:5173'}/tools/audio.html`);
  const result = await page.evaluate(async()=>{
    const {RecordedMusicBank, RecordedMusicDirector} = await import('/src/engine/audio/recordedMusic.ts');
    const {MusicDirector} = await import('/src/engine/audio/music.ts');
    const moods=['playful','calm','sleepy','tense','spooky','chase','triumphant','sad','romantic_waltz'];
    const loader = new OfflineAudioContext(2,44100,44100);
    const bank = new RecordedMusicBank(()=>loader);
    const timeline = mood=>({duration:60,segments:[{offset:0,segment:{duration:60,music:[{start:0,mood,intensity:'medium',fade:.1}]}}]});
    await Promise.all(moods.map(mood=>bank.prepare(timeline(mood))));
    const stats = moods.map(mood=>{
      const buffer=bank.get(mood);if(!buffer)throw new Error(`Missing ${mood}`);
      let sum=0,peak=0,seam=0,finite=true;
      for(let c=0;c<buffer.numberOfChannels;c++){
        const data=buffer.getChannelData(c);seam=Math.max(seam,Math.abs(data[0]-data.at(-1)));
        for(const v of data){sum+=v*v;peak=Math.max(peak,Math.abs(v));finite&&=Number.isFinite(v);}
      }
      return {mood,duration:buffer.duration,peak,rms:Math.sqrt(sum/(buffer.length*buffer.numberOfChannels)),seam,finite};
    });
    function wav(buffer){
      // Auditions loudness-matched so volume alone cannot create the improvement.
      let sum=0,peak=0;for(let c=0;c<2;c++)for(const v of buffer.getChannelData(c)){sum+=v*v;peak=Math.max(peak,Math.abs(v));}
      const gain=Math.min(.07/Math.sqrt(sum/(buffer.length*2)),.93/peak);
      const bytes=new ArrayBuffer(44+buffer.length*4),v=new DataView(bytes);
      const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
      str(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,buffer.length*4,true);
      for(let i=0;i<buffer.length;i++)for(let c=0;c<2;c++)v.setInt16(44+i*4+c*2,Math.round(Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]*gain))*32767),true);
      let binary='';const u8=new Uint8Array(bytes);for(let i=0;i<u8.length;i+=8192)binary+=String.fromCharCode(...u8.subarray(i,i+8192));return btoa(binary);
    }
    const clips={};
    for(const mood of ['playful','calm'])for(const version of ['before','after']){
      const ctx=new OfflineAudioContext(2,44100*18,44100);
      const out={ctx,dest:ctx.destination,track:()=>{}};
      const sections=[{mood,start:0,end:17,fadeIn:.2,fadeOut:1,intensities:[{t:0,intensity:'medium'}],cues:[0]}];
      const director=version==='before'?new MusicDirector(out,sections,t=>t):new RecordedMusicDirector(out,sections,t=>t,bank);
      director.update(0,18,0);clips[`${mood}-${version}.wav`]=wav(await ctx.startRendering());
    }
    return {stats,clips};
  });
  for(const [name,data] of Object.entries(result.clips))await writeFile(new URL(name,dir),Buffer.from(data,'base64'));
  await writeFile(new URL('audio-checks.json',dir),JSON.stringify(result.stats,null,2)+'\n');
  console.log(JSON.stringify(result.stats,null,2));
  if(result.stats.some(s=>!s.finite||s.peak>.96||s.rms<.005||s.seam>.025))throw new Error('Audio signal check failed');
} finally {await browser.close();}
