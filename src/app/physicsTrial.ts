// Read-only deployed demo. Reuses the reviewed compiler fixtures and actual Player.
// No store, audio engine or generation endpoints are loaded by this page.
import {createStage} from '../engine/stage';
import {Player} from '../engine/player/player';
import {createStageReplay} from '../engine/physics/stageReplay';
import {trialStories} from '../../scripts/rapier-trial-fixtures';

async function start():Promise<void>{
  const canvas=document.querySelector('canvas')!;
  const viewport=document.querySelector<HTMLElement>('#viewport')!;
  const select=document.querySelector<HTMLSelectElement>('#story')!;
  const enabled=document.querySelector<HTMLInputElement>('#physics')!;
  const seek=document.querySelector<HTMLInputElement>('#seek')!;
  const time=document.querySelector<HTMLOutputElement>('#time')!;
  const status=document.querySelector<HTMLElement>('#status')!;
  const stage=await createStage(canvas);
  const fit=()=>stage.resize(viewport.clientWidth,viewport.clientHeight);
  fit();const resize=new ResizeObserver(fit);resize.observe(viewport);
  await stage.assetsReady;
  const physics=await createStageReplay(stage),stories=trialStories();
  let player:Player;
  const current=()=>stories[select.value];
  const preferredStart=()=>select.value==='regression'?34.8:0;
  const showTime=(t:number)=>{seek.value=String(t);time.value=`${t.toFixed(2)} / ${current().duration.toFixed(2)} s`;};
  function mount(at:number):void{
    player?.dispose();
    player=new Player({stage,audio:null,evaluator:enabled.checked?physics:undefined,onTime:showTime});
    player.setTimeline(current(),'en');seek.max=String(current().duration);player.seek(at);
    status.textContent=enabled.checked?'Physics enabled for the bounded yard trial.':'Animation-only control.';
  }
  mount(preferredStart());
  select.onchange=()=>mount(preferredStart());
  enabled.onchange=()=>mount(player.time);
  document.querySelector('#play')!.addEventListener('click',()=>player.play(player.time>=current().duration?preferredStart():player.time));
  document.querySelector('#pause')!.addEventListener('click',()=>player.pause());
  document.querySelector('#replay')!.addEventListener('click',()=>player.play(preferredStart()));
  seek.oninput=()=>player.seek(Number(seek.value));
  document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button').forEach(el=>el.disabled=false);
  // Narrow read-only hook for deployment smoke checks.
  (window as unknown as {__rapierDemo:unknown}).__rapierDemo={state:()=>({story:select.value,enabled:enabled.checked,time:player.time,playing:player.isPlaying,frame:player.frame,physics:enabled.checked?physics.inspect(current(),player.time):null})};
  window.addEventListener('pagehide',()=>{resize.disconnect();player.dispose();physics.dispose();stage.dispose();},{once:true});
}
void start().catch(error=>{
  console.error('Physics trial failed to load',error);
  document.querySelector('#status')!.textContent='The yard could not load. Reload this page to try again.';
});
