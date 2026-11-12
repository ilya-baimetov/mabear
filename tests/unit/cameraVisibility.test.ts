import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import recordings from '../../src/shared/recordedSpeech.json';
import {speechKey,type SpeechRecording} from '../../src/shared/speech';
import {planCamera,cameraAt,occlusionCost,actorOcclusionCost,HEAD_HEIGHT,CAMERA_BODY_RADIUS,type CameraActorVolume,type CameraTarget} from '../../src/compiler/camera';
import {compileEpisode} from '../../src/compiler/episode';
import {getFixture} from '../../src/director/fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {clearForeground} from '../../src/engine/cameraClearance';
import {forestCameraOccluders,forestNatureLayout} from '../../src/shared/forestLayout';
import {DEFAULT_REMIX,type ActorId,type CamKey,type Vec2} from '../../src/shared/schema';
import {cookingSupportHeightAt} from '../../src/shared/cookingStation';
import {sceneLocationAt} from '../../src/shared/bible/set';

function story(id:Parameters<typeof getFixture>[0],recorded=false){
  const fixture=getFixture(id,'en')!;
  return compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en',undefined,recorded?Object.fromEntries((recordings as SpeechRecording[]).map(r=>[speechKey(r.text,r.lang),r.duration])):undefined).timeline;
}
function visibility(frame:ReturnType<typeof evaluate>,subject:ActorId){
  const headY=(id:ActorId)=>frame.actors[id].pos[1]+HEAD_HEIGHT[id]*(frame.actors[id].posture==='sit'?.65:1);
  const targets:CameraTarget[]=[{actor:subject,head:[frame.actors[subject].pos[0],headY(subject),frame.actors[subject].pos[2]],w:1}];
  const volumes:CameraActorVolume[]=(frame.cast??[]).filter(id=>frame.actors[id].opacity>.1).map(actor=>({actor,
    pos:[frame.actors[actor].pos[0],frame.actors[actor].pos[2]],headY:headY(actor),radius:CAMERA_BODY_RADIUS[actor]}));
  const local=Object.fromEntries(Object.entries(frame.actors).filter(([id,a])=>frame.cast?.includes(id as ActorId)&&sceneLocationAt(a.pos[0],a.pos[2])===frame.camera.location)) as typeof frame.actors;
  return {targets,volumes,camera:clearForeground(frame.camera,local)};
}

describe('camera visibility follows the rendered scenic locations',()=>{
  it('preserves every pre-extraction tree and shrub placement',()=>{
    // Fingerprints captured by invoking the frozen, original renderer with a
    // recording NatureAssets adapter, before extracting the shared layout.
    const expected={pond:'cbc8382dc9fd9f7e07919d784d31c1222cd74228715e07052e4ed7dd57ab0398',wolves:'d2827b7550d7016ff54b139e3f21f1db57f839576ebf9c63fc6e137c1d52ccb1'};
    for(const kind of ['pond','wolves'] as const){
      expect(createHash('sha256').update(JSON.stringify(forestNatureLayout(kind))).digest('hex')).toBe(expected[kind]);
      expect(forestCameraOccluders(kind).some(o=>o.h<2)).toBe(true);
      expect(forestCameraOccluders(kind).some(o=>o.h>7)).toBe(true);
    }
  });

  it('clears the actual fishing location cut and later low-angle reaction throughout their shots',()=>{
    const timeline=story('fishing_trip');
    for(const [start,end,subject] of [[6.2,6.85,'masha'],[21.5,22.9,'bear']] as const){
      for(let t=start;t<end;t+=.1){
        const frame=evaluate(timeline,t),v=visibility(frame,subject);
        expect(v.camera.location).toBe('pond');
        expect(occlusionCost(v.camera,v.targets),`${subject} at ${t.toFixed(2)}`).toBeLessThan(1);
      }
    }
    const old:CamKey={pos:[-.192,2.4,5.184],look:[-5.278,.6,7.278],fov:45,location:'pond'};
    expect(occlusionCost(old,[{head:[-5.278,.85,7.278],w:1}])).toBeGreaterThanOrEqual(1);
  });

  it('removes the cropped foreground crowd from the garden dialogue shot',()=>{
    const timeline=story('garden_party');
    for(let t=23.75;t<24.95;t+=.1){
      const v=visibility(evaluate(timeline,t),'masha');
      expect(actorOcclusionCost(v.camera,v.targets,v.volumes),`garden at ${t.toFixed(2)}`).toBeLessThan(.35);
    }
    const v=visibility(evaluate(timeline,24.5),'masha');
    const old:CamKey={pos:[-2.306,1.5,3.576],look:[.25,.6,.5],fov:40,location:'yard'};
    expect(actorOcclusionCost(old,v.targets,v.volumes)).toBeGreaterThan(1);
  });

  it('checks a moving foreground actor between otherwise clear endpoints',()=>{
    const posAt=(actor:ActorId,t:number):Vec2=>actor==='masha'?[0,0]:[-3+1.5*t,2];
    const plan=planCamera({duration:4,isFirst:false,cameraSeed:0,dialogue:[],posAt,
      visibleAt:a=>a==='masha'||a==='rival_bear',facingAt:()=>0,
      beats:[{start:0,dur:4,actor:'masha',verb:'wave',shot:'medium',from:[0,0],to:[0,0],hasLine:false,lineStart:0,lineDur:0,punchline:false,emotion:'happy'}]});
    for(const t of [.05,1,2,3,3.95]){
      const camera=cameraAt(plan,t)!;
      const actors:CameraActorVolume[]=[{actor:'masha',pos:[0,0],headY:.85,radius:.23},{actor:'rival_bear',pos:posAt('rival_bear',t),headY:2.2,radius:.94}];
      expect(actorOcclusionCost(camera,[{actor:'masha',head:[0,.85,0],w:1}],actors),`crossing at ${t}`).toBeLessThan(.5);
    }
  });


  it('keeps actual cooking performance large enough to read after clearing the foreground Bear',()=>{
    const timeline=story('pancake_morning',true);
    const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='cook'))!;
    const clip=segment.segment.actorClips.masha.find(c=>c.verb==='cook')!;
    for(const offset of [.7,2.8]){
      const frame=evaluate(timeline,segment.offset+clip.start+offset),v=visibility(frame,'masha');
      const camera=new PerspectiveCamera(v.camera.fov,16/9,.1,100);
      camera.position.fromArray(v.camera.pos);camera.lookAt(new Vector3(...v.camera.look));camera.updateMatrixWorld();
      const [x,y,z]=frame.actors.masha.pos,ground=y+cookingSupportHeightAt(x,z),foot=new Vector3(x,ground,z).project(camera),top=new Vector3(x,ground+1,z).project(camera);
      expect((top.y-foot.y)/2).toBeGreaterThan(.32);
      expect(top.y).toBeLessThan(.85);expect(foot.y).toBeGreaterThan(-.95);
      expect(actorOcclusionCost(v.camera,v.targets,v.volumes)).toBeLessThan(.5);
    }
  });

  it('keeps the measured wake head trajectory in frame during the simultaneous Masha line',()=>{
    const timeline=story('bears_nap',true);
    const segment=timeline.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='wake_up'))!;
    const clip=segment.segment.actorClips.bear.find(c=>c.verb==='wake_up')!;
    // Native shipped-rig Head samples through sit-up, flight and touchdown.
    // A constant seated height misses the real descending head and tests empty
    // space inside the conservative branch boxes after the actor has landed.
    const samples=[
      [.3,-11.281,2.341,1.910],[.7,-10.901,2.357,2.094],
      [.9,-11.103,2.429,1.892],[1.2,-11.814,2.206,1.219],
      [1.3,-12.046,1.949,.995],[1.5,-12.025,2.009,1.014],
    ];
    for(const [offset,x,y,z] of samples){
      const frame=evaluate(timeline,segment.offset+clip.start+offset),v=visibility(frame,'bear');
      const camera=new PerspectiveCamera(v.camera.fov,16/9,.1,100);
      camera.position.fromArray(v.camera.pos);camera.lookAt(new Vector3(...v.camera.look));camera.updateMatrixWorld();
      const head=new Vector3(x,y,z).project(camera);
      expect(Math.abs(head.x),`wake head x at ${offset}`).toBeLessThan(.8);
      expect(Math.abs(head.y),`wake head y at ${offset}`).toBeLessThan(.8);
      const m=frame.actors.masha.pos,child=new Vector3(m[0],m[1]+.85,m[2]).project(camera);
      expect(Math.abs(child.x)).toBeLessThan(.9);expect(Math.abs(child.y)).toBeLessThan(.9);
    }
  });

  it('shows the hammock mount, landing and recline alongside the porch speaker',()=>{
    const timeline=story('bears_nap',true);
    const segment=timeline.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='sleep'&&c.params.to))!;
    const clip=segment.segment.actorClips.bear.find(c=>c.verb==='sleep'&&c.params.to)!;
    // Native head positions include the raised flight and the reclining head
    // displaced beyond the root; neither fits a standing-cylinder estimate.
    const samples=[
      [.2,-11.990,2.002,1.061],[.8,-11.526,2.636,1.497],
      [1.1,-11.081,2.356,1.929],[2,-11.972,1.686,2.450],[2.5,-11.826,1.183,2.810],
    ];
    for(const [offset,x,y,z] of samples){
      const frame=evaluate(timeline,segment.offset+clip.start+offset),v=visibility(frame,'bear');
      const camera=new PerspectiveCamera(v.camera.fov,16/9,.1,100);
      camera.position.fromArray(v.camera.pos);camera.lookAt(new Vector3(...v.camera.look));camera.updateMatrixWorld();
      const head=new Vector3(x,y,z).project(camera);
      expect(Math.abs(head.x)).toBeLessThan(.8);expect(Math.abs(head.y)).toBeLessThan(.8);
      const m=frame.actors.masha.pos,child=new Vector3(m[0],m[1]+.85,m[2]).project(camera);
      expect(Math.abs(child.x)).toBeLessThan(.85);expect(Math.abs(child.y)).toBeLessThan(.85);
      for(const side of [-1,1]){
        const end=new Vector3(-11+Math.cos(.8)*1.8*side,.85,2.2-Math.sin(.8)*1.8*side).project(camera);
        expect(Math.abs(end.x)).toBeLessThan(.92);expect(Math.abs(end.y)).toBeLessThan(.92);
      }
      const bear=frame.actors.bear,dx=v.camera.pos[0]-bear.pos[0],dz=v.camera.pos[2]-bear.pos[2];
      expect((dx*Math.sin(.8)+dz*Math.cos(.8))/Math.hypot(dx,dz)).toBeGreaterThan(0);
      const ground=new Vector3(x,0,z).project(camera);
      expect((head.y-ground.y)/2).toBeGreaterThan(.17);
    }
  });

  it('retains a requested shoulder composition while keeping the subject clear',()=>{
    const posAt=(a:ActorId):Vec2=>a==='masha'?[0,0]:[0,3];
    const plan=planCamera({duration:3,isFirst:false,cameraSeed:2,dialogue:[],posAt,
      visibleAt:a=>a==='masha'||a==='bear',facingAt:a=>a==='masha'?0:Math.PI,
      beats:[{start:0,dur:3,actor:'masha',verb:'wave',shot:'over_shoulder',from:[0,0],to:[0,0],hasLine:false,lineStart:0,lineDur:0,punchline:false,emotion:'happy'}]});
    expect(plan[0].shot).toBe('over_shoulder');expect(plan[0].overridden).toBe(true);
    const camera=cameraAt(plan,1.5)!;
    expect(camera.pos[2]).toBeGreaterThan(3);
    const targets:CameraTarget[]=[{actor:'masha',head:[0,.85,0],w:1}];
    const actors:CameraActorVolume[]=[{actor:'masha',pos:[0,0],headY:.85,radius:.23},{actor:'bear',pos:[0,3],headY:2.05,radius:.76}];
    expect(actorOcclusionCost(camera,targets,actors,true)).toBeLessThan(.5);
  });

  it('frames the real pickup arc and both riders through the subsequent walk and dialogue',()=>{
    const timeline=story('bears_nap',true);
    const segment=timeline.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='carry'))!;
    const clip=segment.segment.actorClips.bear.find(c=>c.verb==='carry')!;
    // Actual shipped-rig Head samples: ground pickup, arc peak, settled seat,
    // clap, moving ride and later dialogue. The child does not remain at the
    // standing root height, nor at her final seated height throughout the lift.
    const samples=[
      {offset:0,bear:[-11.973,1.961,1.050],masha:[-11.450,.672,1.354]},
      {offset:1,bear:[-11.681,1.384,1.252],masha:[-11.413,.741,1.371]},
      {offset:1.5,bear:[-11.993,1.916,1.041],masha:[-11.971,2.581,1.032]},
      {offset:2.5,bear:[-12.040,1.957,.990],masha:[-12.198,2.228,.889]},
      {offset:3.5,bear:[-12.150,1.972,.933],masha:[-12.311,2.235,.827]},
      {offset:4.796,bear:[-11.966,1.97,1.033],masha:[-12.124,2.257,0.91]},
      {offset:5.25,bear:[-11.973,1.944,1.003],masha:[-11.908,2.219,1.203]},
      {offset:5.5,bear:[-12.271,1.671,0.8],masha:[-12.118,1.935,0.957]},
      {offset:6,bear:[-11.662,1.657,-0.649],masha:[-11.812,1.931,-0.505]},
      {offset:6.25,bear:[-10.814,1.693,-1.52],masha:[-10.958,1.969,-1.373]},
      {offset:6.5,bear:[-9.988,1.727,-2.41],masha:[-10.139,1.999,-2.278]},
      {offset:6.75,bear:[-9.092,1.854,-1.93],masha:[-9.232,2.128,-2.092]},
      {offset:7,bear:[-8.197,1.851,-1.08],masha:[-8.352,2.112,-1.227]},
      {offset:7.5,bear:[-6.45,1.714,0.619],masha:[-6.604,1.975,0.478]},
      {offset:8,bear:[-4.188,1.746,1.523],masha:[-4.379,2.029,1.448]},
      {offset:12,bear:[7.304,1.917,1.668],masha:[7.498,2.180,1.743]},
      {offset:22,bear:[-4.604,1.929,-1.939],masha:[-4.419,2.208,-1.853]},
    ];
    for(const sample of samples){
      const frame=evaluate(timeline,segment.offset+clip.start+sample.offset),v=visibility(frame,'bear');
      if(sample.offset>=4.796&&sample.offset<=12){
        expect(frame.camera.followActor).toBe('bear');
        expect([v.camera.look[0],v.camera.look[2]]).toEqual([frame.actors.bear.pos[0],frame.actors.bear.pos[2]]);
      }
      const camera=new PerspectiveCamera(v.camera.fov,16/9,.1,100);
      camera.position.fromArray(v.camera.pos);camera.lookAt(new Vector3(...v.camera.look));camera.updateMatrixWorld();
      for(const actor of ['bear','masha'] as const){
        const head=new Vector3().fromArray(sample[actor]).project(camera);
        expect(Math.abs(head.x),`${actor} head x at carry +${sample.offset}`).toBeLessThan(.85);
        expect(Math.abs(head.y),`${actor} head y at carry +${sample.offset}`).toBeLessThan(.82);
        expect(head.z).toBeGreaterThan(-1);expect(head.z).toBeLessThan(1);
      }
    }
  });
});
