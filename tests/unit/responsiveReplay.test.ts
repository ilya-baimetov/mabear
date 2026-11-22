import {afterEach,describe,expect,it,vi} from 'vitest';
import {ResponsiveReplay,PhysicsPreparationPending,type ReplayWorkerPort} from '../../src/engine/physics/responsiveReplay';
import {authoredPrepared,evaluatePrepared,inspectPrepared} from '../../src/engine/physics/preparedReplay';
import {createRapierReplay} from '../../src/engine/physics/rapierReplay';
import type {ReplayWorkerRequest,ReplayWorkerResponse} from '../../src/engine/physics/replayProtocol';
import {trialStories} from '../../scripts/rapier-trial-fixtures';
import {parallelStories} from '../../scripts/parallel-interactions-fixtures';
import {textStory} from '../../scripts/interactive-objects-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
const stories=trialStories();
class FakeWorker implements ReplayWorkerPort{
  sent:ReplayWorkerRequest[]=[];terminated=false;
  onmessage:ReplayWorkerPort['onmessage']=null;onerror:ReplayWorkerPort['onerror']=null;
  postMessage(message:ReplayWorkerRequest){this.sent.push(message);}
  terminate(){this.terminated=true;}
  reply(data:ReplayWorkerResponse){this.onmessage?.({data} as MessageEvent<ReplayWorkerResponse>);}
}
const active:ResponsiveReplay[]=[];
function facade(timeoutMs=15000){
  const workers:FakeWorker[]=[];
  const sampleBall=vi.fn(()=>({pos:[2,.9,3] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]}));
  const replay=new ResponsiveReplay({sampleBall,timeoutMs,createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
  active.push(replay);return{replay,workers,sampleBall};
}
afterEach(()=>{active.splice(0).forEach(r=>r.dispose());vi.useRealTimers();});

describe('responsive canonical preparation',()=>{
  it('holds all frames until a complete cache arrives, samples the loaded pose only on request, and reuses unchanged source',async()=>{
    const {replay,workers,sampleBall}=facade();replay.setTimeline(stories.drop);
    const w=workers[0],id=replay.revision;
    expect(()=>replay.evaluate(stories.drop,3)).toThrow(PhysicsPreparationPending);
    w.reply({kind:'pose',id,key:'release',frame:evaluate(stories.drop,2),round:1});
    expect(sampleBall).toHaveBeenCalledOnce();expect(w.sent.at(-1)).toMatchObject({kind:'pose',id,key:'release',transform:{pos:[2,.9,3]}});
    w.reply({kind:'ready',id,data:authoredPrepared(stories.drop,'test fallback',id),wallMs:10,rounds:2});
    await replay.whenReady();expect(replay.ready).toBe(true);expect(replay.evaluate(stories.drop,3)).toEqual(evaluate(stories.drop,3));
    replay.setTimeline(structuredClone(stories.drop));expect(replay.revision).toBe(id);expect(workers).toHaveLength(1);expect(w.sent).toHaveLength(2);
  });
  it('terminates edited work, follows the newest readiness promise and rejects stale result/error callbacks',async()=>{
    const {replay,workers}=facade();replay.setTimeline(stories.drop);
    const first=workers[0],staleReply=first.onmessage!,staleError=first.onerror!,oldId=replay.revision;
    let done=false;const waiting=replay.whenReady().then(()=>{done=true;});
    replay.setTimeline(stories.obstacle);expect(first.terminated).toBe(true);
    staleReply({data:{kind:'ready',id:oldId,data:authoredPrepared(stories.drop,'old',oldId),wallMs:1,rounds:1}} as MessageEvent<ReplayWorkerResponse>);
    staleError({preventDefault:vi.fn()} as never);
    await Promise.resolve();expect(done).toBe(false);expect(replay.ready).toBe(false);
    workers[1].reply({kind:'ready',id:replay.revision,data:authoredPrepared(stories.obstacle,'new',replay.revision),wallMs:1,rounds:1});
    await waiting;expect(done).toBe(true);expect(replay.evaluate(stories.obstacle,2)).toEqual(evaluate(stories.obstacle,2));
  });
  it('atomically falls back on timeout, including earlier seeks, and disposes active work',async()=>{
    vi.useFakeTimers();const {replay,workers}=facade(100);replay.setTimeline(stories.drop);
    await vi.advanceTimersByTimeAsync(101);await replay.whenReady();expect(workers[0].terminated).toBe(true);
    for(const t of [6,2.1,0,4])expect(replay.evaluate(stories.drop,t)).toEqual(evaluate(stories.drop,t));
    expect(replay.inspect(stories.drop,3).reason).toContain('timed out');
    replay.setTimeline(stories.obstacle);const waiting=replay.whenReady();replay.dispose();await waiting;
    expect(workers[1].terminated).toBe(true);expect(workers[1].onmessage).toBeNull();
  });
  it('uses authored playback when workers are unavailable instead of blocking with a main-thread simulation',async()=>{
    const replay=new ResponsiveReplay({sampleBall:()=>{throw Error('must not sample');},createWorker:()=>{throw Error('Worker unavailable');}});active.push(replay);
    replay.setTimeline(stories.drop);await replay.whenReady();expect(replay.evaluate(stories.drop,3)).toEqual(evaluate(stories.drop,3));
    expect(replay.inspect(stories.drop,3).reason).toContain('Worker unavailable');
  });
  it('keeps indoor objects and paired choreography immediate without loading a physics worker',()=>{
    const {replay,workers}=facade();
    for(const timeline of [stories.regression,parallelStories().cupboard,textStory(['Bear opens the cupboard, takes the honey jar and closes the cupboard.'],'en')]){
      replay.setTimeline(timeline);expect(replay.ready).toBe(true);
      for(const t of [0,2.337,timeline.duration])expect(replay.evaluate(timeline,t)).toEqual(evaluate(timeline,t));
    }
    expect(workers).toHaveLength(0);
  });
});

describe('serialized canonical reader parity with real Rapier',()=>{
  for(const name of ['obstacle','drop','regression'])it(`preserves ${name} in arbitrary seek order, previews and idle holds`,async()=>{
    const timeline=stories[name],replay=await createRapierReplay({sampleBall:()=>({pos:[2,.9,3],rotation:[0,0,0,1]})});
    try{
      replay.setTimeline(timeline);const data=structuredClone(replay.preparedData());
      const times=[timeline.duration+2,2.337,0,timeline.duration,1.99,4.123,2,2.007];
      for(const t of times){
        expect(evaluatePrepared(data,timeline,t)).toEqual(replay.evaluate(timeline,t));
        const {computeMs:readMs,...read}=inspectPrepared(data,timeline,t),{computeMs:syncMs,...sync}=replay.inspect(timeline,t);
        expect(read).toEqual(sync);expect(readMs).toBeGreaterThanOrEqual(0);expect(syncMs).toBeGreaterThanOrEqual(readMs);
      }
      for(let i=1;i<timeline.segments.length;i++){
        const view={segments:timeline.segments.slice(0,i),duration:timeline.segments[i].offset};
        for(const t of [view.duration-.001,view.duration,view.duration+10])expect(evaluatePrepared(data,view,t)).toEqual(replay.evaluate(view,t));
      }
    }finally{replay.dispose();}
  });
  it('retains corrected continuity routes and physical attachment boundaries after transport',async()=>{
    const timeline=parallelStories().continuity,replay=await createRapierReplay({sampleBall:f=>({pos:[f.actors.masha.pos[0]+.1,.4,f.actors.masha.pos[2]+.25],rotation:[0,0,0,1]})});
    try{
      replay.setTimeline(timeline);const data=structuredClone(replay.preparedData());expect(data.reason).toBeNull();expect(data.pickups).toHaveLength(1);
      const attach=data.pickups[0].attach;
      for(const t of [timeline.duration,attach-.001,0,attach+.001,2.337,attach])expect(evaluatePrepared(data,timeline,t)).toEqual(replay.evaluate(timeline,t));
      for(let i=1;i<timeline.segments.length;i++){
        const view={segments:timeline.segments.slice(0,i),duration:timeline.segments[i].offset};
        for(const t of [view.duration,view.duration+2])expect(evaluatePrepared(data,view,t)).toEqual(replay.evaluate(view,t));
      }
    }finally{replay.dispose();}
  });
});
