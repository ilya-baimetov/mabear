import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from '../../playwright.config';

test('paused browser speech can restart and switch language without remaining silently paused', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('mabear.volume','0');
    let paused=false;
    const voices=[{name:'Milena',lang:'ru-RU',localService:true},{name:'Samantha',lang:'en-US',localService:true}];
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>voices,addEventListener:()=>{},cancel:()=>{},
      pause:()=>{paused=true;},resume:()=>{paused=false;},
      speak:(u:SpeechSynthesisUtterance)=>{document.documentElement.dataset.mockSpeechState=paused?'queued-paused':'speaking';document.documentElement.dataset.mockSpeechVolume=String(u.volume);},
    }});
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class { constructor(public text:string){} }});
  });
  await page.request.post('/login',{form:{password:E2E_PASSWORD},maxRedirects:0});
  await page.goto('/voice/');
  await page.getByRole('button',{name:'▶ Play current voice',exact:true}).click();
  expect(Number(await page.locator('html').getAttribute('data-mock-speech-volume'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Ⅱ Pause current voice',exact:true}).click();
  await page.getByRole('button',{name:'Restart',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mock-speech-state','speaking');
  await page.getByRole('button',{name:'Ⅱ Pause current voice',exact:true}).click();
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.getByRole('button',{name:'▶ Play current voice',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mock-speech-state','speaking');
});

test('Masha audition plays all recordings, pauses competing audio and remembers a separate language choice', async ({page}) => {
  const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.request.post('/login',{form:{password:E2E_PASSWORD},maxRedirects:0});
  await page.goto('/voice/');
  await expect(page.getByRole('heading',{name:'Which Masha sounds right?'})).toBeVisible();
  const clips=page.locator('audio');
  await expect(clips).toHaveCount(4);
  for (const language of ['Русский','English']) {
    await page.getByRole('button',{name:language,exact:true}).click();
    for(let i=0;i<4;i++){
      const clip=clips.nth(i);
      await expect.poll(()=>clip.evaluate(e=>(e as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
      expect(await clip.evaluate(e=>(e as HTMLAudioElement).duration)).toBeGreaterThan(10);
      await clip.press('Space');
      await expect.poll(()=>clip.evaluate(e=>(e as HTMLAudioElement).currentTime)).toBeGreaterThan(.1);
      expect(await clips.evaluateAll(es=>es.filter(e=>!(e as HTMLAudioElement).paused).length)).toBe(1);
    }
  }
  await page.getByRole('radio',{name:'My pick for English',exact:true}).nth(2).check();
  await page.getByRole('button',{name:'Русский',exact:true}).click();
  expect(await clips.evaluateAll(es=>es.every(e=>(e as HTMLAudioElement).paused))).toBe(true);
  await page.getByRole('radio',{name:'My pick for Russian',exact:true}).nth(0).check();
  await page.reload();
  await expect(page.getByRole('radio',{name:'My pick for Russian',exact:true}).nth(0)).toBeChecked();
  mkdirSync('docs/voice-audition/proof',{recursive:true});
  await page.screenshot({path:'docs/voice-audition/proof/audition-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'English',exact:true}).click();
  await expect(page.getByRole('radio',{name:'My pick for English',exact:true}).nth(2)).toBeChecked();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'docs/voice-audition/proof/audition-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>localStorage.getItem('mabear.voice.en'))).toBeNull();
  expect(errors).toEqual([]);
});
