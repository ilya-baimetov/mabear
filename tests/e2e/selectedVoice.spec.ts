import {test,expect} from '@playwright/test';
import {login} from './login';

test('selected MiniMax recording plays and resumes on the same audio clock; seek starts inside the line',async({page})=>{
  test.setTimeout(180000);
  const loaded:string[]=[];page.on('response',r=>{if(r.url().includes('/assets/voices/masha/'))loaded.push(r.url());});
  await page.addInitScript(()=>{
    localStorage.setItem('mabear.lang','en');
    const Native=window.AudioContext;
    (window as any).__testContexts=[];
    window.AudioContext=class extends Native {constructor(o?:AudioContextOptions){super(o);(window as any).__testContexts.push(this);}};
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
  await page.getByTestId('pause').click();
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
  await page.getByTestId('pause').click();
  expect(loaded.length).toBeGreaterThan(0);
  await expect(page.getByTestId('voice-error')).toHaveCount(0);
});
