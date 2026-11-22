import {ACTOR_IDS,type Timeline} from '../../shared/schema';

/** Cheap proofs that both root and prop simulation are unsupported. This is
 * deliberately conservative: ambiguous stories still go through Rapier's full
 * eligibility checks. In particular, a simple drop can remain physical even
 * when another action makes Masha's root animation-owned. */
export function immediateAuthoredReason(timeline:Timeline):string|null{
  if(!timeline.segments.length)return 'empty timeline';
  const clips=timeline.segments.flatMap(({segment})=>ACTOR_IDS.flatMap(actor=>segment.actorClips[actor]));
  if(clips.some(c=>c.verb==='hug'||c.verb==='carry'))return 'paired choreography';
  const masha=timeline.segments.flatMap(({segment})=>segment.actorClips.masha);
  if(masha.some(c=>c.params.item==='ball'&&(c.verb==='drop'||c.verb==='put_down'&&c.params.putDown==='bench')))return null;
  if(timeline.segments.every(({segment})=>segment.cast&&!segment.cast.includes('masha')))return 'Masha is not in this story';
  if(timeline.segments.some(({segment})=>{
    const a=segment.startState.actors.masha,[x,z]=a.pos;
    return a.posture!=='stand'||x< -3||x>5||z< -1||z>6;
  }))return 'outside supported standing yard motion';
  const ballStory=masha.some(c=>c.params.item==='ball'&&['drop','put_down','nudge'].includes(c.verb));
  if(!ballStory){
    const interaction=masha.find(c=>ACTOR_IDS.includes(c.params.target as typeof ACTOR_IDS[number]));
    if(interaction)return `authored choreography: ${interaction.verb}`;
  }
  const authored=masha.find(c=>['open','close','enter','exit','cook'].includes(c.verb)||c.verb==='take'&&c.params.item!=='ball'||c.verb==='put_down'&&c.params.item!=='ball');
  return authored?`authored choreography: ${authored.verb}`:null;
}
