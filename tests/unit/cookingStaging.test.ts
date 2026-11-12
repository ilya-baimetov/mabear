import {describe,expect,it} from 'vitest';
import {compileEpisode} from '../../src/compiler/episode';
import {FIXTURES} from '../../src/director/fixtures';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import {COOKING_STATION,cookingSupportHeightAt} from '../../src/shared/cookingStation';
import {evaluate} from '../../src/engine/player/evaluate';
import recordings from '../../src/shared/recordedSpeech.json';
import {speechKey} from '../../src/shared/speech';

describe('cooking at the adult table',()=>{
  for(const lang of ['en','ru'] as const)it(`${lang} pancake story stages Masha on supported ground through cooking and the following reaction`,()=>{
    const fixture=FIXTURES.find(f=>f.id==='pancake_morning'&&f.lang===lang)!;
    const durations=Object.fromEntries(recordings.map(r=>[speechKey(r.text,r.lang as 'en'|'ru'),r.duration]));
    const {timeline,results}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`cook-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang,undefined,durations);
    expect(results.flatMap(r=>r.errors)).toEqual([]);
    const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='cook'))!;
    const clip=segment.segment.actorClips.masha.find(c=>c.verb==='cook')!;
    for(const dt of [.01,clip.dur/2,clip.dur-.01,clip.dur+.1]){
      const frame=evaluate(timeline,segment.offset+clip.start+dt),a=frame.actors.masha;
      // The feet stay on the helper; subsequent dialogue must not drop her to
      // ground level or hide her behind the adult-height surface again.
      expect(cookingSupportHeightAt(a.pos[0],a.pos[2])).toBeCloseTo(COOKING_STATION.top,6);
      expect(Math.hypot(a.pos[0]-2,a.pos[2]-1.5)).toBeGreaterThan(.75+.2);
      expect(a.holding).toBe('frying_pan');
    }
    const approach=segment.segment.actorClips.masha.find(c=>c.params.to&&Math.abs(c.start+c.dur-clip.start)<.001);
    expect(approach).toBeDefined();
    expect(approach!.params.to).toEqual(COOKING_STATION.position);
    const mounting=[];
    for(let dt=0;dt<approach!.dur;dt+=.02){
      const p=evaluate(timeline,segment.offset+approach!.start+dt).actors.masha.pos;
      if(cookingSupportHeightAt(p[0],p[2])>.02)mounting.push(p);
    }
    expect(mounting.length).toBeGreaterThan(0);
    expect(mounting[0][2]).toBeLessThan(COOKING_STATION.topBack);
    expect(mounting[0][0]).toBeCloseTo(COOKING_STATION.position[0],3);
    const departure=timeline.segments.flatMap(s=>s.segment.actorClips.masha.map(c=>({clip:c,start:s.offset+c.start}))).find(({clip:c,start})=>start>segment.offset+clip.start&&c.params.from&&c.params.to&&cookingSupportHeightAt(...c.params.from)>.3&&cookingSupportHeightAt(...c.params.to)===0);
    expect(departure).toBeDefined();
    const dismounting=[];
    for(let dt=0;dt<departure!.clip.dur;dt+=.02){
      const p=evaluate(timeline,departure!.start+dt).actors.masha.pos;
      if(cookingSupportHeightAt(p[0],p[2])>.02)dismounting.push(p);
    }
    const lastSupported=dismounting.at(-1)!;
    expect(lastSupported[2]).toBeLessThan(COOKING_STATION.topBack);
    expect(lastSupported[0]).toBeCloseTo(COOKING_STATION.position[0],3);
  });

  it('support has a flat landing and continuous entry/exit, without lifting the adult bench',()=>{
    const s=COOKING_STATION;
    expect(cookingSupportHeightAt(2,3)).toBe(0);
    expect(cookingSupportHeightAt(2,.25)).toBe(0); // Adult table approach stays on ground.
    for(const dx of [-.1,0,.1])for(const dz of [-.1,0,.1])expect(cookingSupportHeightAt(s.position[0]+dx,s.position[1]+dz)).toBeCloseTo(s.top,6);
    let previous=0;
    for(let z=s.stepBack-.02;z<s.topFront+.02;z+=.002){
      const height=cookingSupportHeightAt(s.position[0],z);
      expect(Math.abs(height-previous)).toBeLessThan(.013);
      expect(height).toBeGreaterThanOrEqual(0);expect(height).toBeLessThanOrEqual(s.top);
      previous=height;
    }
  });
});
