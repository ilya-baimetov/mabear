import {test,expect} from '@playwright/test';
import {login} from './login';

test('selected voice and recorded score resume on the same clock; seek starts inside each recording',async({page})=>{
  test.setTimeout(180000);
  const loaded:string[]=[];page.on('response',r=>{if(r.url().includes('/assets/voices/masha/'))loaded.push(r.url());});
  await page.addInitScript(()=>{
    localStorage.setItem('mabear.lang','en');
    const Native=window.AudioContext;
    (window as any).__testContexts=[];
    (window as any).__musicSources=[];
    window.AudioContext=class extends Native {
      constructor(o?:AudioContextOptions){super(o);(window as any).__testContexts.push(this);}
      createBufferSource(){
        const source=super.createBufferSource(), start=source.start.bind(source);
        source.start=(...args:Parameters<AudioBufferSourceNode['start']>)=>{
          if(source.loop && (source.buffer?.duration??0)>35 && (source.buffer?.duration??0)<46)
            (window as any).__musicSources.push({offset:args[1]??0,duration:source.buffer?.duration});
          return start(...args);
        };
        return source;
      }
    };
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:()=>{throw new Error('Rejected browser voice was invoked');},cancel:()=>{},resume:()=>{},getVoices:()=>[]}});
  });
  await login(page);
  await page.goto('/');await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await expect(page.locator('.stage-loading')).toHaveCount(0,{timeout:90000});
  await page.getByTestId('examples').click();await page.getByTestId('example-garden_party').click();
  const target=await page.evaluate(()=>{
    const tl=window.__mabear!.timeline() as any;const s=tl.segments.find((s:any)=>s.segment.dialogue.length);
    return s.offset+s.segment.dialogue[0].start+.25;
  });
  const timeline=page.getByTestId('timeline'),box=(await timeline.boundingBox())!;
  const duration=await page.evaluate(()=>(window.__mabear!.timeline() as any).duration);
  await timeline.click({position:{x:target/duration*box.width,y:box.height/2}});
  await page.getByTestId('play').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__mabearAudio?.recordedSpeech?.scheduled.length??0)).toBeGreaterThan(0);
  const music=await page.evaluate(()=>(window as any).__musicSources);
  expect(music.length).toBeGreaterThan(0);
  expect(music[0].duration).toBeGreaterThan(35);
  expect(music[0].offset).toBeGreaterThan(.1);
  await page.getByTestId('pause').click();
  const pausedMusicCount=await page.evaluate(()=>(window as any).__musicSources.length);
  const paused=await page.evaluate(()=>({time:window.__mabear!.t(),ctx:(window as any).__testContexts[0].currentTime,state:(window as any).__testContexts[0].state,proof:(window as any).__mabearAudio.recordedSpeech}));
  expect(paused.state).toBe('suspended');expect(paused.proof.voice).toBe('Lively_Girl');
  expect(paused.proof.scheduled[0].offset).toBeGreaterThan(.15);
  await page.waitForTimeout(550);
  expect(await page.evaluate(()=>(window as any).__testContexts[0].currentTime)).toBeCloseTo(paused.ctx,2);
  expect(await page.evaluate(()=>window.__mabear!.t())).toBeCloseTo(paused.time,2);
  await page.getByTestId('play').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__testContexts[0].state)).toBe('running');
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>(window as any).__mabearAudio.recordedSpeech.scheduled.length)).toBe(paused.proof.scheduled.length);
  expect(await page.evaluate(()=>(window as any).__musicSources.length)).toBe(pausedMusicCount);
  await page.getByTestId('pause').click();
  expect(loaded.length).toBeGreaterThan(0);
  await expect(page.getByTestId('voice-error')).toHaveCount(0);
});
