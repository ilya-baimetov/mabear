import { describe,it,expect } from 'vitest';
import { parseParagraph } from '../../src/director/offline/parser';
import { initialWorldState } from '../../src/compiler/worldState';
import { compileEpisode } from '../../src/compiler/episode';
import { evaluate } from '../../src/engine/player/evaluate';
import { getFixture } from '../../src/director/fixtures';
import { validateBeatScript } from '../../src/compiler/validate';
import { buildSystemPrompt } from '../../src/director/prompt';
import { WorldStateSchema, SegmentSchema, DEFAULT_REMIX, ACTOR_IDS, type ActorId, type Lang, type BeatScript } from '../../src/shared/schema';
const extra=['lady_bear','hare','rosie','squirrel','rival_bear'] as const;
const examples:[ActorId,string,string][]=[['lady_bear','Lady Bear waves.','Медведица машет.'],['hare','Hare jumps.','Заяц прыгает.'],['rosie','Rosie dances.','Свинка танцует.'],['squirrel','Squirrel jumps.','Белочка прыгает.'],['rival_bear','Rival Bear waves.','Медведь-спортсмен машет.']];

describe('expanded story cast',()=>{
  for(const [actor,en,ru] of examples)for(const [lang,text]of [['en',en],['ru',ru]] as const)it(`${actor} acts independently in ${lang}`,()=>{
    const bs=parseParagraph(text,lang,initialWorldState());
    expect(bs.beats[0].actor).toBe(actor);expect(bs.rule_hits.filter(h=>h.rule==='cast_only')).toEqual([]);
  });
  for(const [text,actor]of [['Lady Bear waves. She dances.','lady_bear'],['Hare jumps. He dances.','hare'],['Rosie waves. She jumps.','rosie'],['Squirrel jumps. She waves.','squirrel'],['Медведица машет. Она танцует.','lady_bear'],['Заяц прыгает. Он танцует.','hare'],['Masha waves. He dances.','bear']] as const)it(`pronouns: ${text}`,()=>{
    const bs=parseParagraph(text,/[а-я]/i.test(text)?'ru':'en',initialWorldState());expect(bs.beats.at(-1)?.actor).toBe(actor);
  });
  for(const text of ['Bear holds a toy bunny.','Masha wears bunny slippers.','Маша взбивает белки от яиц.','Маша дарит розочки Мишке.'])it(`objects do not become actors: ${text}`,()=>{
    const bs=parseParagraph(text,/[а-я]/i.test(text)?'ru':'en',initialWorldState());expect(bs.beats.some(b=>extra.includes(b.actor as typeof extra[number]))).toBe(false);
  });
  it('old saved episodes receive complete actor state and tracks',()=>{
    const raw=JSON.parse(JSON.stringify(initialWorldState()));for(const id of extra)delete raw.actors[id];
    const ws=WorldStateSchema.parse(raw);for(const id of extra)expect(ws.actors[id].posture).toBe('stand');
    const e=getFixture('garden_party','en')!;const {timeline}=compileEpisode(e.paragraphs.map((p,i)=>({...p,paragraphId:`p${i}`,version:1,remix:DEFAULT_REMIX})),'en',ws);
    const seg=JSON.parse(JSON.stringify(timeline.segments[0].segment));for(const id of extra)delete seg.actorClips[id];
    const parsed=SegmentSchema.parse(seg);for(const id of extra)expect(parsed.actorClips[id]).toEqual([]);
  });
  for(const lang of ['en','ru'] as Lang[])it(`garden story compiles and seeks all actors in ${lang}`,()=>{
    const e=getFixture('garden_party',lang)!;const {timeline,results}=compileEpisode(e.paragraphs.map((p,i)=>({...p,paragraphId:`p${i}`,version:1,remix:DEFAULT_REMIX})),lang);
    expect(results.flatMap(r=>r.beatScript.rule_hits).filter(h=>h.rule==='cast_only')).toEqual([]);
    for(const id of extra)expect(timeline.segments.some(s=>s.segment.actorClips[id].some(c=>c.verb!=='idle'))).toBe(true);
    for(let t=0;t<timeline.duration;t+=.37){const f=evaluate(timeline,t);for(const id of ACTOR_IDS){expect(f.actors[id].pos.every(Number.isFinite)).toBe(true);expect(Object.values(f.actors[id].bones).flat().every(Number.isFinite)).toBe(true);}expect(evaluate(timeline,t)).toEqual(f);}
  });
  it('AI prompt exposes every actor and validator keeps animals wordless',()=>{
    const prompt=buildSystemPrompt();for(const id of extra)expect(prompt).toContain(id);
    const base=getFixture('garden_party','en')!.paragraphs[0].beatScript;
    const bs={...base,beats:extra.map(actor=>({...base.beats[0],actor,verb:'wave',line:'Hello!' }))} as BeatScript;
    const validated=validateBeatScript(bs,initialWorldState(),'en');
    expect(validated.beatScript.beats.every(b=>b.line===null)).toBe(true);
    expect(validated.hits.filter(h=>h.rule==='animals_silent')).toHaveLength(5);
  });
});
