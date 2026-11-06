import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {captureComparison} from '../../performance/capture';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Masha comparison recording cleanup',()=>{
 function fixture(failAt:'construct'|'start'|null=null){
  const stopTrack=vi.fn();
  const stream={getTracks:()=>[{stop:stopTrack}]};
  const queued=new Map<number,FrameRequestCallback>();let nextId=0;
  const cancelFrame=vi.fn((id:number)=>queued.delete(id));
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{const id=++nextId;queued.set(id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',cancelFrame);
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){},drawImage(){}}),captureStream:()=>stream})});
  let recorder:Recorder;
  class Recorder {
   static isTypeSupported(){return true;}
   state='inactive';
   ondataavailable:((event:{data:Blob})=>void)|null=null;
   onstop:(()=>void)|null=null;
   onerror:(()=>void)|null=null;
   constructor(){if(failAt==='construct')throw new Error('Encoder unavailable');recorder=this;}
   start(){if(failAt==='start')throw new Error('Encoder cannot start');this.state='recording';}
   stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recorded video'])});this.onstop?.();}
  }
  vi.stubGlobal('MediaRecorder',Recorder);
  const camera=new THREE.PerspectiveCamera(30,4/3,.01,100);
  let ratio=2,width=640,height=480;
  const renderer={
   domElement:{clientWidth:640,clientHeight:480},
   getPixelRatio:()=>ratio,
   setPixelRatio(value:number){ratio=value;},
   setSize(w:number,h:number){width=w;height=h;},
  } as unknown as THREE.WebGLRenderer;
  const api={renderers:[renderer],cameras:[camera],setScene:vi.fn(),renderAt:vi.fn()};
  return {api,stopTrack,cancelFrame,queued,failEncoder:()=>recorder.onerror?.(),
   advance(){const [id,callback]=queued.entries().next().value!;queued.delete(id);callback(0);},
   state:()=>({ratio,width,height,aspect:camera.aspect})};
 }

 it('stops the acquired canvas stream if encoder construction fails',async()=>{
  const {api,stopTrack}=fixture('construct');
  await expect(captureComparison(api)).rejects.toThrow('Encoder unavailable');
  expect(stopTrack).toHaveBeenCalledOnce();
 });

 it('restores both renderer dimensions and camera aspect if encoder start fails',async()=>{
  const {api,stopTrack,state}=fixture('start');
  await expect(captureComparison(api)).rejects.toThrow('Encoder cannot start');
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(state()).toEqual({ratio:2,width:640,height:480,aspect:4/3});
 });

 it('rejects and releases recording resources when a later animation frame fails',async()=>{
  const {api,stopTrack,state,advance,queued}=fixture();
  api.renderAt.mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{throw new Error('Frame unavailable');});
  const recording=captureComparison(api);
  const failed=expect(recording).rejects.toThrow('Frame unavailable');
  expect(()=>advance()).not.toThrow();
  await failed;
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(queued.size).toBe(0);
  expect(state()).toEqual({ratio:2,width:640,height:480,aspect:4/3});
 });

 it('cancels an outstanding animation frame when the encoder reports failure',async()=>{
  const {api,stopTrack,cancelFrame,queued,failEncoder}=fixture();
  const recording=captureComparison(api);
  const failed=expect(recording).rejects.toThrow('Video recording failed');
  failEncoder();await failed;
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(cancelFrame).toHaveBeenCalledOnce();
  expect(queued.size).toBe(0);
 });

 it('returns the recording and restores the viewer after the final frame',async()=>{
  const {api,stopTrack,state,advance}=fixture();
  const now=vi.spyOn(performance,'now').mockReturnValue(0);
  const recording=captureComparison(api);
  now.mockReturnValue(12_000);advance();
  now.mockReturnValue(18_000);advance();
  now.mockReturnValue(24_001);advance();
  const blob=await recording;
  expect(await blob.text()).toBe('recorded video');
  expect(api.setScene.mock.calls).toEqual([['face','front'],['hold','three'],['clap','front']]);
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(state()).toEqual({ratio:2,width:640,height:480,aspect:4/3});
 });
});
