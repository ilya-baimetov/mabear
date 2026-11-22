// Deterministic BeatScript → Segment compiler (spec §6.3–§6.5, §7.5, §7.6). Pure: same input → identical output.
//
// Timing: a beat anchors to the previous beat's START (with_previous) or END, plus delay_s; each character has its own
// track and its beats never overlap (they queue). Durations come from the grammar (baseDuration) or path length /
// speed; a beat with a line lasts at least as long as the line. Object verbs walk to where they happen first
// (VERB_HOME_MARK, the prop, the other character). Trivial repairs (insert `take`/`enter`) are written into the
// compiled BeatScript and listed in `repairs`. Characters without a beat are filled with ambient life (idle clips that
// look at the action, small reactions to loud beats) so every track covers [0, duration] contiguously.
import { CHARACTERS } from "../shared/bible/characters";
import { PROPS } from "../shared/bible/props";
import { FISHING_WATER_TARGET, isInsideHouse, isInteriorMark, MARKS, OBSTACLES, sceneLocationAt, SEAT_HEIGHT } from "../shared/bible/set";
import { GRAMMAR, LOCOMOTION_VERBS, SPEEDS, VERB_HOME_MARK, VERB_IMPLIED_PROP, isWolf } from "../shared/grammar";
import { ACTOR_IDS, CARROT_IDS, isCarrot } from "../shared/schema";
import {propPlacementAtMark,propPlacementInState,propGripWorld,BENCH_BALL_FALLBACK} from '../shared/propPlacement';
import {PROP_CONTACTS} from '../shared/propContacts';
import {KITCHEN_CONTAINERS,isKitchenContainer,kitchenContainerApproach} from '../shared/kitchenContainers';
import {CHARACTER_REACH} from '../shared/characterReach';
import {armchairMountMotion,avoidHammock,hammockExitPoint,hammockTiming,hammockTravelProgress,hugSpacing,interactionRadius} from '../shared/physicalInteractions';
import {carryLiftHeadHeight} from '../shared/carrySupport';
import {COOKING_STATION,cookingSupportHeightAt} from '../shared/cookingStation';
import {HOUSE_COOKING_HELPER,HOUSE_CHILD_COOK_POSITION,HOUSE_STOVE,HOUSE_PREP_TABLE,HOUSE_KITCHEN_WORK_SHIFT,houseWorkPropZ,housePickupPosition,houseLocal,houseWorld} from '../shared/houseLayout';
import {HOUSE_DOOR,INTERIOR_THRESHOLD,INTERIOR_APPROACH,KITCHEN_CUPBOARD,CUPBOARD_JAR_POSITION} from '../shared/interactiveObjects';
import type {
  ActorClip, ActorId, Beat, BeatScript, Emotion, FxCue, FxId, LightingCue, MarkId, Posture, PropId, SfxId,
  Vec2, Vec3, Verb, WorldState, Segment, CameraCue, CamKey,
} from "../shared/schema";
import { buildAudioCues, type AudioBeatEvent } from "./audioCues";
import { HEAD_HEIGHT, planCamera, splitCameraCue, type CameraBeatInfo } from "./camera";
import { dialogueDuration, isShouted, makeDialogueCue } from "./dialogue";
import { clampWalkable, pathEndYaw, pathLength, planPath, pointAlong, yawTo } from "./path";
import type { CompileFn, CompileOptions, CompileResult } from "./types";
import { isActor, isMark, isProp, otherActor, validateBeatScript } from "./validate";
import { cloneWorldState, withAllActors } from "./worldState";

export const SEGMENT_TAIL = 0.6;
/** Cartoon time: one locomotion clip never lasts longer than this (long trips speed up instead). */
export const MAX_LOCO_S = 6;
const ACTORS: ActorId[] = [...ACTOR_IDS];
/** Sideways nudge per actor so characters arriving at the same spot don't overlap. */
const SPREAD_OFFSET: Record<ActorId, Vec2> = { masha: [1.0, 0.2], bear: [-1.0, 0.2], wolf_a: [0.7, 0.8], wolf_b: [-0.7, -0.8], lady_bear: [-2.2, 0], hare: [1.5, -1.2], rosie: [2, 1], squirrel: [2, -2], rival_bear: [-2.2, 2] };
/** Where each actor stands after entering from the forest path (offset from the clearing). */
const ENTER_OFFSET: Record<ActorId, Vec2> = { masha: [0.8, 1.5], bear: [-0.8, 1.5], wolf_a: [1.8, 2.4], wolf_b: [2.6, 1.6], lady_bear: [-2.5, 1], hare: [1.5, -.6], rosie: [3.4, 2.2], squirrel: [2.5, -.8], rival_bear: [-3, 3.4] };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const v2 = (p: readonly number[]): Vec2 => [p[0], p[1]];

/** Verbs a character can do while sitting / carried / asleep without changing posture first. */
const SIT_OK = new Set<Verb>(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "facepalm", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "sit", "sleep", "fish", "give"]);
const CARRIED_OK = new Set<Verb>(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "scared"]);
const SLEEP_OK = new Set<Verb>(["sleep", "wake_up", "idle", "surprised", "scared", "fall_down", "yawn_stretch"]);
/** Bear verbs that end a shoulder ride. */
const ENDS_CARRY = new Set<Verb>(["sit", "sleep", "exit", "fall_down", "hide", "jump", "spin", "dance", "hug", "cook", "fish", "water_plants", "angry_stomp", "chase", "run_to"]);
const CONSUMABLE = new Set<PropId>(["pancakes", "fish", ...CARROT_IDS, "cake", "lollipop"]);
const LOUD_VERBS = new Set<Verb>(["fall_down", "sneeze", "laugh", "angry_stomp", "jump"]);
/** Bear sounds that send the (cowardly) Wolves cowering. */
const BEAR_SCARY_EMOTES = new Set<string>(["roar_soft", "growl_soft", "huff", "grunt"]);
const LOUD_SFX = new Set<SfxId>(["crash", "door_slam", "thunder_clap", "pot_clang", "boing", "van_horn"]);

interface ActorTrack {
  clips: ActorClip[];
  free: number;
  /** snapshots after each clip: posture/holding/facing timeline for ambient fill */
  states: { t: number; pos: Vec2; facing: number; posture: Posture; holding: PropId | null; mark:MarkId|null }[];
}

interface BeatTiming {
  start: number;
  end: number;
  mainStart: number;
  mainDur: number;
  actor: ActorId;
  verb: Verb;
  from: Vec2;
  to: Vec2;
  hasLine: boolean;
  lineStart: number;
  lineDur: number;
  loud: boolean;
  /** a Bear beat that makes the Wolves cower (loud, angry, a roar/growl/huff) */
  scary: boolean;
  /** auto-walk inside the beat (camera treats it as its own locomotion) */
  walk: { start: number; dur: number; verb: Verb; from: Vec2; to: Vec2 } | null;
}

/** Standing position at a mark: marks inside an obstacle footprint stand just outside it, opposite the facing hint
 *  (behind the table facing the camera, behind the tree/bush when hiding, on the shore side of the pond). */
export function standPos(mark: MarkId): Vec2 {
  const m = MARKS[mark];
  if(isKitchenContainer(mark))return [...KITCHEN_CONTAINERS[mark].approaches.bear.position];
  if (mark === "door" || mark === "pier" || isInteriorMark(mark)) return v2(m.pos);
  if (mark === "pond_shore") {
    const c = OBSTACLES.circles.find((o) => o.id === "pond")!;
    const d = [m.pos[0] - c.c[0], m.pos[1] - c.c[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    return [r3(c.c[0] + (d[0] / l) * (c.r + 0.35)), r3(c.c[1] + (d[1] / l) * (c.r + 0.35))];
  }
  const f: Vec2 = [Math.sin(m.facing), Math.cos(m.facing)];
  for (const c of OBSTACLES.circles) {
    if (c.id === "pond") continue;
    if (Math.hypot(m.pos[0] - c.c[0], m.pos[1] - c.c[1]) < c.r + 0.2) return [r3(c.c[0] - f[0] * (c.r + 0.35)), r3(c.c[1] - f[1] * (c.r + 0.35))];
  }
  for (const b of OBSTACLES.boxes) {
    const inside = (p: Vec2) => p[0] > b.min[0] - 0.3 && p[0] < b.max[0] + 0.3 && p[1] > b.min[1] - 0.3 && p[1] < b.max[1] + 0.3;
    let p: Vec2 = v2(m.pos);
    for (let k = 0; k < 60 && inside(p); k++) p = [p[0] - f[0] * 0.2, p[1] - f[1] * 0.2];
    if (dist(p, m.pos) > 0) return [r3(p[0]), r3(p[1])];
  }
  return v2(m.pos);
}

export const compile: CompileFn = (inputBs, startState, opts) => compileImpl(inputBs, startState, opts);
export const compileParagraph = compile;

function compileImpl(inputBs: BeatScript, startState0: WorldState, opts: CompileOptions): CompileResult {
  // world states saved before the Wolves joined get them back at their start spot by the van
  const startState = withAllActors(cloneWorldState(startState0));
  const v = validateBeatScript(inputBs, startState, opts.lang);
  const bs0 = v.beatScript;
  const cast=opts.cast??ACTORS.filter(a=>bs0.beats.some(b=>b.actor===a||b.target===a));
  const repairs: string[] = v.errors.map((e) => `validator: ${e}`);
  const errors: string[] = [];
  const ws = cloneWorldState(startState);
  const tracks = Object.fromEntries(ACTORS.map((a) => [a, { clips: [], free: 0, states: [snap(ws, a, 0)] }])) as unknown as Record<ActorId, ActorTrack>;
  const compiledBeats: Beat[] = [];
  const timings: BeatTiming[] = [];
  const preparationCameras:CameraBeatInfo[]=[];
  const objectCues:NonNullable<Segment['objectCues']>=[];
  let cupboardFree=0;
  let kitchenContainerFree=0;
  let lastCupboardShot:CameraCue|undefined;
  let lastCarrotShot:{cue:CameraCue;actor:ActorId;end:number}|undefined;
  const doorShots:CameraCue[]=[];
  const objectInteractionShots:CameraCue[]=[];
  let doorFree=0;
  const events: AudioBeatEvent[] = [];
  const dialogue: ReturnType<typeof makeDialogueCue>[] = [];
  const fx: FxCue[] = [];
  const extraSfx: { t: number; id: SfxId; pos: Vec2 }[] = [];
  let flourUsed = false;

  // ---------- helpers ----------
  function snap(w: WorldState, a: ActorId, t: number) {
    const s = w.actors[a];
    return { t, pos: v2(s.pos), facing: s.facing, posture: s.posture, holding: s.holding,mark:s.mark };
  }
  function record(a: ActorId, t: number) {
    tracks[a].states.push(snap(ws, a, t));
  }
  /** Ground position of an actor at time t, from its clips so far (carried → Bear's position). */
  function posAt(a: ActorId, t: number): Vec2 {
    if (a === "masha" && postureAt("masha", t) === "carried") return posAt("bear", t);
    const clips = tracks[a].clips;
    let p: Vec2 = v2(startState.actors[a].pos);
    for (const c of clips) {
      if (c.start > t) break;
      if (t < c.start + c.dur && c.params.path && c.params.path.length > 1) {
        const progress=(t-c.start)/Math.max(1e-6,c.dur),k=c.verb==='sit'&&c.params.target==='house_living'&&c.params.to?armchairMountMotion(a==='masha',progress).travel:c.params.target==='hammock'&&c.params.to&&!LOCOMOTION_VERBS.includes(c.verb)?hammockTravelProgress(c.verb==='sleep',progress,c.dur):progress;
        return c.params.sceneCut ? v2(k<.5?c.params.path[0]:c.params.path[c.params.path.length-1]) : pointAlong(c.params.path, k * pathLength(c.params.path));
      }
      p = c.params.to ?? c.params.from ?? p;
    }
    return p;
  }
  function stateAt(a: ActorId, t: number) {
    const st = tracks[a].states;
    let s = st[0];
    for (const x of st) if (x.t <= t + 1e-9) s = x;
    return s;
  }
  function postureAt(a: ActorId, t: number): Posture {
    return stateAt(a, t).posture;
  }
  /** Getting up from furniture includes leaving its footprint. Keeping the
   * floor root at the seat centre makes a short actor descend through it. */
  function seatExit(a:ActorId):{from:Vec2;to:Vec2;path:Vec2[];target:MarkId;facing:number}|null {
    const st=ws.actors[a],mark=st.mark;
    if(mark==='hammock'&&(st.posture==='sleep'||st.posture==='sit')&&dist(st.pos,MARKS.hammock.pos)<1.05){
      const from=v2(st.pos),candidates=([1,-1] as const).map(side=>clampWalkable(hammockExitPoint(from,a,side)));
      const clearance=(p:Vec2)=>Math.min(...ACTORS.filter(o=>o!==a&&ws.actors[o].posture!=='offstage'&&ws.actors[o].posture!=='carried').flatMap(o=>[.2,.4,.6,.8,1].map(k=>dist([from[0]+(p[0]-from[0])*k,from[1]+(p[1]-from[1])*k],ws.actors[o].pos)-interactionRadius(o)-interactionRadius(a))));
      const to=candidates.find(p=>clearance(p)>.12)??candidates.sort((p,q)=>clearance(q)-clearance(p))[0];
      return{from,to:[r3(to[0]),r3(to[1])],path:[from,[r3(to[0]),r3(to[1])]],target:mark,facing:yawTo(from,to,st.facing)};
    }
    if(st.posture!=='sit'||!mark||(SEAT_HEIGHT[mark]??0)<=.15||dist(st.pos,MARKS[mark].pos)>1.05)return null;
    if(mark==='house_living'){
      const from=v2(st.pos),p=houseLocal(from),corner=houseWorld([p[0]+.30,p[1]+.63]),to=houseWorld([p[0]+.65,p[1]+1.05]);
      return{from,to,path:[from,corner,to],target:mark,facing:yawTo(from,corner,st.facing)};
    }
    const facing=st.facing,distance=.65,from=v2(st.pos);
    const to=clampWalkable([r3(from[0]+Math.sin(facing)*distance),r3(from[1]+Math.cos(facing)*distance)]);
    return{from,to,path:[from,to],target:mark,facing};
  }
  function addClip(a: ActorId, start: number, dur: number, verb: Verb, emotion: Emotion, params: ActorClip["params"]): ActorClip {
    const c: ActorClip = { start, dur: Math.max(0.05, dur), verb, emotion, params };
    tracks[a].clips.push(c);
    tracks[a].free = Math.max(tracks[a].free, start + c.dur);
    return c;
  }
  function headAt(a: ActorId, t: number): Vec3 {
    const p = posAt(a, t);
    const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const lerp=(x:number,y:number,k:number)=>x+(y-x)*k;
    const st=stateAt(a,t),seat=st.mark&&dist(p,MARKS[st.mark].pos)<1?(SEAT_HEIGHT[st.mark]??0):0;
    let h = postureAt(a, t) === "carried" ? 2.32 : postureAt(a, t) === "sleep" ? 0.6+seat : postureAt(a, t) === "sit" ? HEAD_HEIGHT[a] * 0.65+seat : HEAD_HEIGHT[a];
    if(a==='bear'&&st.posture==='sleep'&&st.mark==='hammock')h=1.15;
    const active=tracks[a].clips.find(c=>t>=c.start&&t<c.start+c.dur);
    if(active?.verb==='sit'&&active.params.target==='house_living'&&active.params.to){
      const motion=armchairMountMotion(a==='masha',(t-active.start)/active.dur);
      h=lerp(HEAD_HEIGHT[a],HEAD_HEIGHT[a]*.65+SEAT_HEIGHT.house_living,motion.pose)+motion.lift-.045*motion.crouch;
    }
    if(active?.params.target==='hammock'&&active.params.to&&(active.verb==='sleep'||['sleep','sit'].includes(postureAt(a,active.start)))){
      const time=t-active.start,mount=active.verb==='sleep',{launch,land,settled}=hammockTiming(mount,active.dur),flight=Math.max(0,Math.min(1,(time-launch)/(land-launch))),standing=HEAD_HEIGHT[a],seated=a==='bear'?2.35:standing*.65+SEAT_HEIGHT.hammock,lying=a==='bear'?1.15:.6+SEAT_HEIGHT.hammock,crouched=standing-.20;
      if(mount){
        if(time<launch)h=lerp(standing,crouched,smooth(time/launch));
        else if(time<land)h=lerp(crouched,seated,flight)+4*.47*flight*(1-flight);
        else h=lerp(seated,lying,smooth((time-settled)/Math.min(1.05,Math.max(.2,active.dur-settled))));
      }else{
        if(time<launch)h=lerp(postureAt(a,active.start)==='sleep'?lying:seated,seated,smooth(time/Math.min(.38,launch*.46)));
        else if(time<land)h=lerp(seated,crouched,flight)+4*.25*flight*(1-flight);
        else h=lerp(crouched,standing,smooth((time-land)/Math.max(.001,settled-land)));
      }
    }
    if(a==='masha'){const lift=tracks.bear.clips.find(c=>c.verb==='carry'&&c.start<=t&&t<c.start+c.dur);if(lift)h=carryLiftHeadHeight(t-lift.start,lift.dur);}
    const hug=active?.verb==='hug'?active:null;
    if(hug&&postureAt(a,t)==='stand'&&isActor(hug.params.target)&&HEAD_HEIGHT[a]>HEAD_HEIGHT[hug.params.target]*1.4){
      // Calibrated against the shipped rig's crouched hug (Bear Head Y≈1.41).
      // Keep the camera with the embrace instead of aiming at the empty space
      // above a kneeling adult. Match the pose's approach/release envelope.
      const u=(t-hug.start)/hug.dur,k=Math.min(smooth(u/.22),smooth((1-u)/.22));
      h-=.60*(HEAD_HEIGHT[a]/HEAD_HEIGHT.bear)*k;
    }
    return [r3(p[0]), r3(h+cookingSupportHeightAt(p[0],p[1])), r3(p[1])];
  }
  /** World point for a target id (mark / actor / prop). */
  function targetPoint(id: string | null, t: number): Vec3 | null {
    if (id == null) return null;
    if (isActor(id)) return headAt(id, t);
    if (isMark(id)) { const p = MARKS[id].pos; return [p[0], 0.5, p[1]]; }
    if (isProp(id)) {
      const at = ws.props[id]?.at;
      if (at && isActor(at)) { const p = posAt(at, t); return [r3(p[0]), 0.8, r3(p[1])]; }
      if (at && isMark(at)) return propPlacementInState(id,{...ws.props[id],at}).pos;
    }
    return null;
  }
  /** Where to stand to reach a target. */
  function approachPoint(a: ActorId, id: string, t: number, gap = 0.9): Vec2 | null {
    if(isKitchenContainer(id)){const contact=kitchenContainerApproach(id,a);return contact?[...contact.position]:null;}
    if(id==='cupboard'||isProp(id)&&ws.props[id]?.at==='cupboard')return [...KITCHEN_CUPBOARD.approach];
    if(id==='house_living'&&(a==='masha'||a==='bear')&&ws.actors[a].posture!=='sit')return armchairApproach(a);
    if (isMark(id)) return spread(a, standPos(id), t);
    if (isActor(id)) {
      const o = posAt(id, t);
      const me = posAt(a, t);
      let d: Vec2 = [me[0] - o[0], me[1] - o[1]];
      const l = Math.hypot(d[0], d[1]);
      d = l < 1e-3 ? [1, 0] : [d[0] / l, d[1] / l];
      if(isInsideHouse(...o)){
        const seated=ws.actors[id].posture==='sit'&&ws.actors[id].mark==='house_living';
        // The chair pose advances the child's hips over the cushion edge.
        // Root-to-root spacing alone put the server's belly into her face.
        const reachGap=seated?Math.max(gap,1.35):gap;
        const angle=seated?.35:Math.atan2(d[0],d[1]);
        for(const turn of [0,.35,-.35,.7,-.7,1.2,-1.2,Math.PI]){
          const candidate=clampWalkable([o[0]+Math.sin(angle+turn)*reachGap,o[1]+Math.cos(angle+turn)*reachGap]);
          const path=planPath(me,candidate);
          if(dist(path[path.length-1],candidate)<.03&&dist(candidate,o)<reachGap+.25&&dist(candidate,o)>.65)return candidate;
        }
      }
      return clampWalkable([o[0] + d[0] * gap, o[1] + d[1] * gap]);
    }
    if (isProp(id)) {
      const at = ws.props[id]?.at;
      if (at && isMark(at)) {
        if(isCarrot(id)||id==='ball')return carrotApproach(a,id,at,!!ws.props[id].planted);
        if(isInteriorMark(at)){
          const surface=propPlacementAtMark(id,at).pos,target:Vec2=[surface[0],surface[2]],me=posAt(a,t);
          if(a==='masha'&&at==='house_kitchen')return housePickupPosition(id);
          if(at==='house_kitchen'){
            const candidate=houseWorld([-2.65,houseWorkPropZ(id)-.73]),path=planPath(me,candidate);
            if(dist(path[path.length-1],candidate)<.03)return candidate;
          }
          const angle=Math.atan2(me[0]-target[0],me[1]-target[1]);
          for(const turn of [0,.5,-.5,1,-1,1.6,-1.6,Math.PI]){
            const candidate=clampWalkable([target[0]+Math.sin(angle+turn)*.75,target[1]+Math.cos(angle+turn)*.75]);
            const path=planPath(me,candidate);
            if(dist(path[path.length-1],candidate)<.03&&dist(candidate,target)<1.15)return candidate;
          }
        }
        return spread(a, standPos(at), t);
      }
      if (at && isActor(at) && at !== a) return approachPoint(a, at, t, gap);
    }
    return null;
  }
  function carrotApproach(a:ActorId,item:PropId,mark:MarkId,planted=false):Vec2{
    if(isKitchenContainer(mark)){const contact=kitchenContainerApproach(mark,a);if(contact)return [...contact.position];}
    const placement=propPlacementInState(item,{...(ws.props[item]?.at===mark?ws.props[item]:{}),at:mark,planted}),grip=propGripWorld(placement.pos,placement.rot,item==='ball'?[0,.15,0]:PROP_CONTACTS[item].point),reach=CHARACTER_REACH[a];
    if(item==='ball')grip[1]-=.15;
    const me=ws.actors[a].pos;
    const yaw=isCarrot(item)||item==='ball'?Math.PI:yawTo(me,[grip[0],grip[2]],ws.actors[a].facing);
    const lead=reach.shoulder[1]<.9?.15:reach.length*.35,c=Math.cos(yaw),s=Math.sin(yaw);
    let dest:Vec2=[grip[0]-c*reach.shoulder[0]-s*(reach.shoulder[2]+lead),grip[2]+s*reach.shoulder[0]-c*(reach.shoulder[2]+lead)];
    if(mark==='bench')dest[1]=yaw===0?Math.min(dest[1],2.73):Math.max(dest[1],item==='ball'?3.46:3.24);
    if(mark==='garden'&&planted)dest[1]=Math.max(dest[1],reach.shoulder[1]<.45?-5.35:-5.29); // feet stay outside the raised bed's front board
    return dest;
  }
  function armchairApproach(a:ActorId):Vec2{
    const seat=MARKS.house_living;return[seat.pos[0],seat.pos[1]+(a==='masha'?1.02:1.45)];
  }
  /** A static-obstacle clamp can otherwise push an approach point back into
   * the partner's belly. Search around the partner while retaining body room. */
  function hugApproach(a:ActorId,partner:ActorId,t:number):Vec2 {
    const centre=posAt(partner,t),me=v2(ws.actors[a].pos),gap=hugSpacing(a,partner,ws.actors[partner].posture==='sit'),angle=Math.atan2(me[0]-centre[0],me[1]-centre[1]);
    for(const extra of [0,.15,.3])for(const turn of [0,.35,-.35,.7,-.7,1.05,-1.05,1.4,-1.4,1.9,-1.9,Math.PI]){
      const p=clampWalkable([centre[0]+Math.sin(angle+turn)*(gap+extra),centre[1]+Math.cos(angle+turn)*(gap+extra)]);
      if(dist(p,centre)>=gap-.005&&dist(p,centre)<=gap+extra+.025&&ACTORS.every(o=>o===a||o===partner||ws.actors[o].posture==='offstage'||ws.actors[o].posture==='carried'||dist(p,posAt(o,t))>=interactionRadius(a)+interactionRadius(o)+.08))return p;
    }
    const p=approachPoint(a,partner,t,gap+.5)!;
    if(dist(p,centre)>=gap-.005)return p;
    return [centre[0]+Math.sin(angle+Math.PI)*(gap+.5),centre[1]+Math.cos(angle+Math.PI)*(gap+.5)];
  }
  /** Avoid standing on top of another character (partner first, then everyone else). */
  function spread(a: ActorId, p: Vec2, t: number): Vec2 {
    const o0 = otherActor(a);
    const others = [o0, ...ACTORS.filter((x) => x !== a && x !== o0)];
    let q = p;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const o of others) {
        if (ws.actors[o].posture === "offstage" || ws.actors[o].posture === "carried") continue;
        const op = posAt(o, Math.max(t, tracks[o].free));
        if (dist(op, q) < 0.8) {
          const off = SPREAD_OFFSET[a];
          q = clampWalkable([q[0] + off[0], q[1] + off[1]]);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return q;
  }
  function speed(a: ActorId, verb: Verb): number {
    const s = SPEEDS[a] as Record<string, number>;
    return s[verb] ?? s.walk_to;
  }
  /** Add a locomotion clip along a planned path; returns its end time. Updates world state. */
  function locomote(a: ActorId, t: number, verb: Verb, dest: Vec2, emotion: Emotion, target: string | null, finalFacing?: number, path0?: Vec2[], direct=false): number {
    const st = ws.actors[a];
    const from = v2(st.pos);
    if(!direct&&isInsideHouse(...from)!==isInsideHouse(...dest))return throughDoor(a,t,dest,emotion,target,finalFacing);
    const carrotBenchContext=isCarrot(st.holding)||isCarrot(target)||st.mark==='bench'&&Object.entries(ws.props).some(([id,p])=>isCarrot(id)&&p.at==='bench');
    // A carried carrot approaches the bench's front, never its occupied seat centre.
    if(carrotBenchContext&&target==='bench'&&Math.abs(dest[1]-3)<.12)dest=[dest[0],3.55];
    let path = path0 ?? planPath(from, dest);
    if(!direct&&a==='bear'&&isCarrot(st.holding)&&st.mark==='kitchen_bowl'&&target==='kitchen_pot'){
      // The adult carries close to his chest through the middle of the aisle.
      // Generic corner nodes clear a root point but clip Bear's broad paws.
      const aisleZ=(HOUSE_PREP_TABLE.position[1]-HOUSE_PREP_TABLE.depth/2+houseWorld([0,.17])[1])/2-.05;
      path=[from,[-10.65,aisleZ],[-13.25,aisleZ],[-13.25,-13.15],dest];
    }
    if(carrotBenchContext&&!direct&&!isInsideHouse(...from)&&!isInsideHouse(...dest)){
      const front=(p:Vec2)=>p[0]>.9&&p[0]<3.1&&p[1]>=3.19&&p[1]<=3.65;
      const corner:Vec2=[.75,3.55],fromFront=front(from),toFront=front(dest);
      if(fromFront&&toFront)path=[from,[from[0],3.55],[dest[0],3.55],dest];
      else if(toFront)path=[...planPath(from,corner),[dest[0],3.55],dest];
      else if(fromFront)path=[from,[from[0],3.55],corner,...planPath(corner,dest).slice(1)];
      path=path.filter((p,i)=>i===0||dist(path[i-1],p)>.0001);
    }
    if(a==='masha'){
      const supportedFrom=cookingSupportHeightAt(...from)>.3,supportedTo=cookingSupportHeightAt(...dest)>.3;
      const supportAt=supportedFrom?from:dest;
      const entry:Vec2=isInsideHouse(...supportAt)?[...HOUSE_COOKING_HELPER.entry]:[COOKING_STATION.position[0],COOKING_STATION.stepBack-.25];
      // Mount and leave by the two actual treads, not by popping up/down the
      // tall side of the helper. This also covers leaving to put down the pan.
      if(supportedTo&&!supportedFrom)path=[...planPath(from,entry),dest];
      else if(supportedFrom&&!supportedTo)path=[from,entry,...planPath(entry,dest).slice(1)];
    }
    // The hammock remains an obstacle after the interaction ends. Ordinary
    // departure previously bypassed the route used for hugs and approached
    // the yard through its cloth and end branches, especially with a rider.
    path=avoidHammock(path,a,a==='bear'&&ws.actors.masha.posture==='carried'?1.2:0);
    const len = pathLength(path);
    const kitchenTravel=isInsideHouse(...from)&&isInsideHouse(...dest)&&(isKitchenContainer(target)||isProp(target)&&isKitchenContainer(ws.props[target]?.at));
    const fromScene=sceneLocationAt(...from),toScene=sceneLocationAt(...dest);
    const sceneCut=fromScene!==toScene;
    const dur = sceneCut ? .9 : len < 0.3 ? 0.6 : Math.min(MAX_LOCO_S, Math.max(len / speed(a, verb), 0.8));
    const yaw = pathEndYaw(path, st.facing);
    if(kitchenTravel){
      const xs=path.map(p=>p[0]),zs=path.map(p=>p[1]),midX=(Math.min(...xs)+Math.max(...xs))/2,midZ=(Math.min(...zs)+Math.max(...zs))/2;
      const key:CamKey={pos:[-8.7,3.5,-8.9],look:[midX,a==='masha'?1.15:1.35,midZ],fov:midX>-10.5?70:60,location:'house'};
      doorShots.push({start:t,dur,shot:'wide',from:key,to:key,overridden:true});
    }
    addClip(a, t, dur, verb, emotion, {
      from, to: v2(path[path.length - 1]), path: path.map((p) => [r3(p[0]), r3(p[1])] as Vec2),
      facing: r3(yawTo(from, path[1] ?? dest, st.facing)), posture: "stand", item: st.holding ?? undefined, target: target ?? undefined,
      ...(sceneCut?{sceneCut:true}:{}),
    });
    st.pos = v2(path[path.length - 1]);
    st.facing = r3(finalFacing ?? yaw);
    st.mark = isMark(target) && dist(st.pos, dest) < 0.01 ? target : nearestMarkWithin(st.pos, 1.5);
    record(a, t + dur);
    // a carried Masha rides along
    if (a === "bear" && ws.actors.masha.posture === "carried") {
      ws.actors.masha.pos = v2(st.pos);
      ws.actors.masha.facing = st.facing;
      ws.actors.masha.mark = st.mark;
      record("masha", t + dur);
    }
    return t + dur;
  }
  function doorShot(start:number,end:number,inside:boolean):void {
    if(end<=start)return;
    const key:CamKey=inside?{pos:[-9.6,2.7,-8.9],look:[-5.6,1.65,-11],fov:47,location:'house'}:{pos:[-1,3.5,3.7],look:[-6,1.7,-3.7],fov:40,location:'yard'};
    doorShots.push({start,dur:end-start,shot:'medium',from:key,to:key,overridden:true});
  }
  function doorAction(a:ActorId,t:number,to:number,emotion:Emotion):number {
    t=Math.max(t,doorFree);
    const st=ws.actors[a],inside=isInsideHouse(...st.pos),approach=inside?INTERIOR_APPROACH:HOUSE_DOOR.exterior.approach;
    const start=t;
    if(dist(st.pos,approach)>.05)t=locomote(a,t,'walk_to',approach,emotion,null,undefined,undefined,true);
    const centre=inside?HOUSE_DOOR.interior.center:HOUSE_DOOR.exterior.center;
    t=facePartner(a,t,centre,emotion);
    const from=ws.objects?.house_door??0,dur=Math.abs(to-from)>.001?HOUSE_DOOR.duration:.45;
    addClip(a,t,dur,to?'open':'close',emotion,{from:v2(st.pos),facing:st.facing,posture:'stand',item:st.holding??undefined,target:'door',lookAt:[centre[0],1.5,centre[1]]});
    if(Math.abs(to-from)>.001){
      objectCues.push({object:'house_door',start:t+.2,dur:dur-.2,from,to});
      extraSfx.push({t:t+.25,id:'door_creak',pos:centre});
    }
    ws.objects={...ws.objects,house_door:to};if(!inside)st.mark='door';record(a,t+dur);doorFree=t+dur;doorShot(start,t+dur,inside);
    return t+dur;
  }
  function objectInteractionShot(a:ActorId,item:PropId,start:number,end:number,mark:MarkId,pickup=false):void{
    if(isKitchenContainer(mark)){
      // The settled turn belongs to the contact shot. Leaving it to the generic
      // planner inserted a brief exterior-wall view between two clear shots.
      const turn=tracks[a].clips.filter(c=>c.verb==='look_at'&&!c.params.ambient&&Math.abs(c.start+c.dur-start)<.002).at(-1);
      if(turn)start=turn.start;
      // Actor clips are millisecond-rounded; authored camera intervals retain
      // full precision. Join the preceding safe shot instead of leaving a seam.
      const preceding=doorShots.map(c=>c.start+c.dur).filter(t=>Math.abs(t-start)<.002);
      if(preceding.length)start=Math.min(start,...preceding);
    }
    const p=ws.actors[a].pos,large=CHARACTER_REACH[a].shoulder[1]>1;
    const key:CamKey=isKitchenContainer(mark)
      ?mark==='kitchen_bowl'?{pos:a==='masha'?[-13.6,2.65,-12.2]:[-13.5,2.8,-9.5],look:a==='masha'?[-11.35,1.4,-11.42]:[-11.35,1.5,-11.2],fov:a==='masha'?48:46,location:'house'}:{pos:[-13,2.85,-14.78],look:[-13.6,1.6,-13.70],fov:58,location:'house'}
      :mark==='garden'
      ?{pos:[p[0]+3.0,large?2.6:1.65,p[1]+.6],look:[p[0]+.12,large?1:.48,p[1]-.1],fov:38,location:'yard'}
      :{pos:[p[0]+3.0,large?2.6:1.65,p[1]+.65],look:[p[0],large?1.05:.65,p[1]-.12],fov:38,location:'yard'};
    // The first ground ball lies west of the picnic table. View its pickup
    // from that open side so the samovar cannot hide the hand and ball.
    if(item==='ball'&&pickup&&mark==='clearing')key.pos=[p[0]-2.8,1.65,p[1]-.4];
    if(item==='ball'&&mark==='bench'){key.pos=[p[0]+2.65,1.5,p[1]-1.1];key.look=[p[0],.58,3.13];}
    if(item==='ball')key.followActor=a;
    const cue:CameraCue={start,dur:end-start,shot:'medium',from:key,to:key,overridden:true};
    doorShots.push(cue);objectInteractionShots.push(cue);lastCarrotShot={cue,actor:a,end};
  }
  function cupboardShot(start:number,end:number):void {
    if(end<=start)return;
    const key:CamKey={pos:[-13.2,3.7,-14.1],look:[-14.6,1.9,-11.4],fov:46,location:'house'};
    lastCupboardShot={start,dur:end-start,shot:'medium',from:key,to:key,overridden:true};
    doorShots.push(lastCupboardShot);
  }
  function cupboardAction(a:ActorId,t:number,to:number,emotion:Emotion):number {
    t=Math.max(t,cupboardFree);
    const st=ws.actors[a];
    if(dist(st.pos,KITCHEN_CUPBOARD.approach)>.04)t=locomote(a,t,'walk_to',[...KITCHEN_CUPBOARD.approach],emotion,'cupboard');
    const start=t;
    t=facePartner(a,t,[st.pos[0]-1,st.pos[1]],emotion);
    const from=ws.objects?.kitchen_cupboard??0,changed=Math.abs(to-from)>.001,dur=changed?KITCHEN_CUPBOARD.duration:.5;
    addClip(a,t,dur,changed?(to?'open':'close'):'idle',emotion,{from:v2(st.pos),facing:st.facing,posture:'stand',item:st.holding??undefined,target:'cupboard',lookAt:CUPBOARD_JAR_POSITION,objectFrom:from,objectTo:to});
    if(changed){objectCues.push({object:'kitchen_cupboard',start:t+.35,dur:dur-.7,from,to});extraSfx.push({t:t+.35,id:'door_creak',pos:KITCHEN_CUPBOARD.center});}
    ws.objects={house_door:0,...ws.objects,kitchen_cupboard:to};st.mark='cupboard';record(a,t+dur);cupboardFree=t+dur;cupboardShot(start,t+dur);
    return t+dur;
  }
  function throughDoor(a:ActorId,t:number,dest:Vec2,emotion:Emotion,target:string|null,finalFacing?:number):number {
    const st=ws.actors[a],entering=isInsideHouse(...dest),start=Math.max(t,doorFree);
    t=start;
    const approach=entering?HOUSE_DOOR.exterior.approach:INTERIOR_APPROACH;
    const threshold=entering?HOUSE_DOOR.exterior.threshold:INTERIOR_THRESHOLD;
    const arrival=entering?INTERIOR_THRESHOLD:HOUSE_DOOR.exterior.threshold;
    const exit=entering?INTERIOR_APPROACH:HOUSE_DOOR.exterior.approach;
    const followCarrot=entering&&isCarrot(st.holding),walkFrom=v2(st.pos),walkStart=t;
    if(dist(st.pos,approach)>.05)t=locomote(a,t,'walk_to',approach,emotion,null,undefined,undefined,true);
    let passageStart=start;
    if(followCarrot&&t>walkStart){
      const key=(p:Vec2):CamKey=>({pos:[p[0]+2.8,3,p[1]+3.8],look:[p[0],a==='masha'?.65:1.25,p[1]],fov:60,location:'yard'});
      doorShots.push({start:walkStart,dur:t-walkStart,shot:'tracking',from:key(walkFrom),to:key(v2(st.pos)),overridden:true});passageStart=t;
    }
    if((ws.objects?.house_door??0)<.999)t=doorAction(a,t,1,emotion);
    t=locomote(a,t,'walk_to',threshold,emotion,null,undefined,[v2(st.pos),threshold],true);
    const cut=t+.05,yaw=entering?HOUSE_DOOR.interior.yaw:0;
    addClip(a,t,.1,'walk_to',emotion,{from:threshold,to:arrival,path:[threshold,arrival],facing:st.facing,arrivalYaw:yaw,posture:'stand',item:st.holding??undefined,sceneCut:true,portal:true});
    st.pos=v2(arrival);st.facing=yaw;st.mark=null;record(a,t+.1);t+=.1;
    doorShot(passageStart,cut,!entering);
    t=locomote(a,t,'walk_to',exit,emotion,null,yaw,[arrival,exit],true);
    doorFree=t;
    doorShot(cut,t,entering);
    return locomote(a,t,'walk_to',dest,emotion,target,finalFacing,undefined,true);
  }
  /** Finish a planted turn before any paired contact pose begins. */
  function facePartner(a:ActorId,t:number,point:Vec2,emotion:Emotion):number {
    const st=ws.actors[a],previous=tracks[a].clips.filter(c=>c.start+c.dur<=t+.001).at(-1);
    // A semantic mark facing may differ from a walk's actual final tangent.
    const fromYaw=previous&&LOCOMOTION_VERBS.includes(previous.verb)&&previous.params.path?pathEndYaw(previous.params.path,st.facing):st.facing;
    const facing=yawTo(st.pos,point,fromYaw),delta=Math.abs(Math.atan2(Math.sin(facing-fromYaw),Math.cos(facing-fromYaw)));
    if(delta<.02)return t;
    // Match the evaluator's in-place turning speed, with a short settled beat.
    const dur=Math.max(.25,delta/Math.PI*.7*(a==='bear'||a==='rival_bear'?1.8:1)+.10);
    addClip(a,t,dur,'look_at',emotion,{from:v2(st.pos),facing,posture:st.posture,item:st.holding??undefined,lookAt:[point[0],HEAD_HEIGHT[a]*.7,point[1]]});
    events.push({actor:a,verb:'look_at',start:t,dur,emote:null,hasLine:false,sfx:null,sfxAt:t,pos:v2(st.pos),main:false});
    st.facing=facing;record(a,t+dur);return t+dur;
  }
  /** Keep a seated participant on its support while visibly freeing the paw.
   * This uses the same reverse pickup/contact path as putting a cooking prop away. */
  function putAsideForHug(a:ActorId,t:number,emotion:Emotion):number {
    const st=ws.actors[a],item=st.holding;if(!item)return t;
    if(isCarrot(item)){
      const preferred=st.mark??nearestMark(st.pos),occupied=Object.entries(ws.props).some(([id,p])=>id!==item&&isCarrot(id)&&p.at==='bench');
      const mark:MarkId=preferred==='bench'&&occupied?'clearing':['garden','bench','table','clearing'].includes(preferred)?preferred:'clearing';
      const placement=propPlacementAtMark(item,mark),grip=propGripWorld(placement.pos,placement.rot,PROP_CONTACTS[item].point),destination=carrotApproach(a,item,mark);
      if(dist(st.pos,destination)>.04)t=locomote(a,t,'walk_to',destination,emotion,mark);
      t=facePartner(a,t,[st.pos[0],st.pos[1]-1],emotion);
      const dur=2;addClip(a,t,dur,'take',emotion,{from:v2(st.pos),facing:st.facing,posture:st.posture,item,putDown:mark,putDownPosition:placement.pos,putDownRotation:placement.rot,lookAt:grip});
      events.push({actor:a,verb:'take',start:t,dur,emote:null,hasLine:false,sfx:null,sfxAt:t+dur*.5,pos:v2(st.pos),main:false});
      ws.props[item]={at:mark,planted:false};st.holding=null;record(a,t+dur);objectInteractionShot(a,item,t,t+dur,mark);return t+dur;
    }
    const mark=st.mark??nearestMark(st.pos),placement=propPlacementAtMark(item,mark),grip=propGripWorld(placement.pos,placement.rot,PROP_CONTACTS[item].point);
    if(st.posture==='stand'&&dist(st.pos,[grip[0],grip[2]])>CHARACTER_REACH[a].length+.35){
      const destination=approachPoint(a,mark,t);
      if(destination)t=locomote(a,t,'walk_to',destination,emotion,mark);
    }
    t=facePartner(a,t,[grip[0],grip[2]],emotion);
    const dur=1;
    addClip(a,t,dur,'take',emotion,{from:v2(st.pos),facing:st.facing,posture:st.posture,item,putDown:mark,lookAt:grip});
    events.push({actor:a,verb:'take',start:t,dur,emote:null,hasLine:false,sfx:null,sfxAt:t+.5,pos:v2(st.pos),main:false});
    ws.props[item]={at:mark,...(isCarrot(item)?{planted:false}:{})};st.holding=null;record(a,t+dur);return t+dur;
  }
  /** A hand cannot reach a second prop while its socket still carries the
   * first. Finish a visible, supported placement before planning the pickup. */
  function putAsideBeforeInteriorPickup(a:ActorId,t:number,mark:MarkId,emotion:Emotion):number{
    const st=ws.actors[a],item=st.holding;if(!item)return t;
    const start=t,from=v2(st.pos);let contactStart=start;
    const finish=(end:number)=>{
      if(contactStart>start)preparationCameras.push({start,dur:contactStart-start,actor:a,verb:'walk_to',shot:'tracking',from,to:v2(st.pos),hasLine:false,lineStart:0,lineDur:0,punchline:false,emotion});
      preparationCameras.push({start:contactStart,dur:end-contactStart,actor:a,verb:'take',shot:'medium',from:v2(st.pos),to:v2(st.pos),hasLine:false,lineStart:0,lineDur:0,punchline:false,emotion});return end;
    };
    if(mark!=='house_kitchen')return finish(putAsideForHug(a,t,emotion));
    const placement=propPlacementAtMark(item,mark),grip=propGripWorld(placement.pos,placement.rot,PROP_CONTACTS[item].point);
    const destination=a==='masha'?housePickupPosition(item):houseWorld(item==='frying_pan'?[-3,3.00+HOUSE_KITCHEN_WORK_SHIFT]:[-2.90,.75]);
    if(dist(st.pos,destination)>.04){
      const start=t;t=locomote(a,t,'walk_to',destination,emotion,mark);
      events.push({actor:a,verb:'walk_to',start,dur:t-start,emote:null,hasLine:false,sfx:null,sfxAt:start,pos:v2(st.pos),main:false});
    }
    t=facePartner(a,t,[grip[0],grip[2]],emotion);
    contactStart=t;
    const dur=1;
    addClip(a,t,dur,'take',emotion,{from:v2(st.pos),facing:st.facing,posture:st.posture,item,putDown:mark,lookAt:grip});
    events.push({actor:a,verb:'take',start:t,dur,emote:null,hasLine:false,sfx:null,sfxAt:t+.5,pos:v2(st.pos),main:false});
    ws.props[item]={at:mark,...(isCarrot(item)?{planted:false}:{})};st.holding=null;record(a,t+dur);
    return finish(t+dur);
  }
  function dismount(t: number): number {
    const m = ws.actors.masha;
    const b = ws.actors.bear;
    const start = Math.max(t, tracks.masha.free);
    const side: Vec2 = [Math.cos(b.facing), -Math.sin(b.facing)];
    const to = clampWalkable([b.pos[0] + side[0] * 0.9, b.pos[1] + side[1] * 0.9]);
    addClip("masha", start, 0.8, "jump", "happy", { from: v2(b.pos), to, path: [v2(b.pos), to], facing: b.facing, posture: "stand", item: m.holding ?? undefined, target: "bear" });
    m.posture = "stand";
    m.pos = to;
    m.facing = b.facing;
    m.mark = nearestMarkWithin(to, 1.5);
    record("masha", start + 0.8);
    repairs.push("Masha hops down from Bear's shoulders");
    return start + 0.8;
  }
  function dropHeld(a: ActorId) {
    const st = ws.actors[a];
    if (!st.holding) return;
    ws.props[st.holding] = { at: st.mark ?? nearestMark(st.pos),...(isCarrot(st.holding)?{planted:false}:{}) };
    st.holding = null;
  }
  function giveTo(a: ActorId, item: PropId) {
    if (ws.actors[a].holding && ws.actors[a].holding !== item) dropHeld(a);
    // Implied tools (for example Masha taking over Bear's frying pan) must
    // transfer the holder as well as the prop. Otherwise the former holder
    // resurrects it when a following paragraph rebuilds ownership.
    for(const other of ACTORS)if(other!==a&&ws.actors[other].holding===item)ws.actors[other].holding=null;
    ws.actors[a].holding = item;
    ws.props[item] = { at: a,...(isCarrot(item)?{planted:false}:{}) };
  }
  function addFx(id: FxId, start: number, dur: number, at: Vec3) {
    fx.push({ start: r3(start), dur: r3(dur), id, at: [r3(at[0]), r3(at[1]), r3(at[2])] });
  }

  /** Let a serving adult clear the chair before its occupant gets up. */
  function clearChairExit(a:ActorId,t:number,emotion:Emotion):number {
    const st=ws.actors[a];if(st.posture!=='sit'||st.mark!=='house_living')return t;
    const exit=seatExit(a);if(!exit)return t;
    for(const other of ACTORS){
      const partner=ws.actors[other];if(other===a||partner.posture!=='stand'||!isInsideHouse(...partner.pos))continue;
      const radius=interactionRadius(a)+interactionRadius(other)+.12;
      const near=Array.from({length:15},(_,i)=>pointAlong(exit.path,pathLength(exit.path)*i/14)).some(p=>dist(p,partner.pos)<radius);
      if(!near)continue;
      const candidates=[[2.25,1.65],[2.65,.65],[1.9,2.5]].map(houseWorld).filter(p=>
        ACTORS.every(o=>o===other||o===a||ws.actors[o].posture==='offstage'||dist(p,ws.actors[o].pos)>interactionRadius(other)+interactionRadius(o)+.15));
      candidates.sort((p,q)=>pathLength(planPath(partner.pos,p))-pathLength(planPath(partner.pos,q)));
      const destination=candidates.find(p=>dist(planPath(partner.pos,p).at(-1)!,p)<.03);
      if(!destination)continue;
      const start=Math.max(t,tracks[other].free);
      t=locomote(other,start,'walk_to',destination,emotion,null,yawTo(destination,st.pos));
      events.push({actor:other,verb:'walk_to',start,dur:t-start,emote:null,hasLine:false,sfx:null,sfxAt:start,pos:v2(destination),main:false});
    }
    return t;
  }

  /** A former occupant may still be beside the chair when the next actor
   * backs into it. Move only a free standing participant out of that corridor. */
  function clearChairEntry(a:ActorId,t:number,emotion:Emotion):number{
    const corridor=[armchairApproach(a),v2(MARKS.house_living.pos)],length=pathLength(corridor);
    for(const other of ACTORS){
      const partner=ws.actors[other];
      if(other===a||partner.posture!=='stand'||tracks[other].free>t+.001||!isInsideHouse(...partner.pos))continue;
      const clearance=interactionRadius(a)+interactionRadius(other)+.18;
      if(!Array.from({length:17},(_,i)=>pointAlong(corridor,length*i/16)).some(p=>dist(p,partner.pos)<clearance))continue;
      const candidates=[[2.25,1.65],[2.65,.65],[1.9,2.5]].map(houseWorld).filter(p=>
        ACTORS.every(o=>o===other||ws.actors[o].posture==='offstage'||dist(p,ws.actors[o].pos)>interactionRadius(other)+interactionRadius(o)+.15));
      candidates.sort((p,q)=>pathLength(planPath(partner.pos,p))-pathLength(planPath(partner.pos,q)));
      const destination=candidates.find(p=>{
        const path=planPath(partner.pos,p),distance=pathLength(path);if(dist(path.at(-1)!,p)>.03)return false;
        return Array.from({length:19},(_,i)=>pointAlong(path,distance*i/18)).every(at=>ACTORS.every(o=>o===other||ws.actors[o].posture==='offstage'||dist(at,ws.actors[o].pos)>interactionRadius(other)+interactionRadius(o)+.08));
      });
      if(!destination)continue;
      const start=t,from=v2(partner.pos);t=locomote(other,t,'walk_to',destination,emotion,null,yawTo(destination,MARKS.house_living.pos));
      events.push({actor:other,verb:'walk_to',start,dur:t-start,emote:null,hasLine:false,sfx:null,sfxAt:start,pos:v2(destination),main:false});
      preparationCameras.push({start,dur:t-start,actor:other,verb:'walk_to',shot:'tracking',from,to:v2(destination),hasLine:false,lineStart:0,lineDur:0,punchline:false,emotion});
    }
    return t;
  }

  // ---------- beats ----------
  const queue: { beat: Beat; orig: number }[] = bs0.beats.map((b, i) => ({ beat: { ...b }, orig: i }));
  // A refused prerequisite must not be inserted forever for the same unchanged input state.
  const attemptedPickups=new Set<string>();
  let idx = 0;
  let prevTiming: BeatTiming | null = null;
  while (idx < queue.length) {
    const { beat: b, orig } = queue[idx];
    const a = b.actor;
    const o = otherActor(a);
    const st = ws.actors[a];
    const origIndex = idx;
    idx++;

    // --- trivial repairs that insert beats ---
    if(b.verb==='give'&&isActor(b.target)&&isCarrot(ws.actors[b.target].holding)&&ws.actors[b.target].holding!==b.item){repairs.push('The receiver must put down their carrot before accepting another item.');b.verb='point_at';b.item=null;}
    if (st.posture === "offstage" && b.verb !== "enter") {
      if (b.verb === "exit") { repairs.push(`${a} is already offstage: exit skipped`); continue; }
      const enter: Beat = { ...b, verb: "enter", target: null, item: null, line: null, emote: null, sfx: null, shot: "auto" };
      queue.splice(origIndex, 0, { beat: enter, orig: -1 });
      b.with_previous = false; b.delay_s = 0;
      idx = origIndex;
      repairs.push(`inserted enter: ${a} comes back before "${b.verb}"`);
      continue;
    }
    if(b.item&&isCarrot(b.item)&&ws.props[b.item]?.at==='hidden'&&['take','eat','give','throw','put_down'].includes(b.verb)){
      repairs.push(`The ${b.item} has already been eaten; it does not regrow.`);b.verb='look_at';b.target='garden';b.item=null;
    }
    if(b.verb==='drop'&&b.item&&isCarrot(b.item)){b.verb='put_down';b.target=st.mark??nearestMark(st.pos);repairs.push('Carrot drop uses a gentle authored placement at the current place; carrots are not simulated rigid bodies.');}
    if(b.verb==='put_down'&&isCarrot(b.item)&&b.target==='bench'&&Object.entries(ws.props).some(([id,p])=>id!==b.item&&isCarrot(id)&&p.at==='bench')){
      repairs.push('The bench carrot slot is occupied. The new carrot stays held; pick up the resting carrot or choose the garden path.');b.verb='shrug';b.target=null;b.item=null;
    }
    if(b.verb==='put_down'&&(!b.item||!(isCarrot(b.item)||b.item==='ball'&&a==='masha'&&b.target==='bench')||st.holding!==b.item)){
      repairs.push('Put down needs the specific carrot (or Masha’s bench ball) in this actor’s hand.');b.verb='shrug';b.target=null;b.item=null;
    }
    if(b.verb==='put_down'&&!['garden','bench','clearing','table','kitchen_bowl','kitchen_pot'].includes(b.target??'')){
      repairs.push('This carrot can be placed on the garden path, bench, table, clearing, kitchen bowl or pot.');b.verb='shrug';b.target=null;b.item=null;
    }
    const container=b.verb==='put_down'&&isKitchenContainer(b.target)?b.target:b.verb==='take'&&b.item&&isKitchenContainer(ws.props[b.item]?.at)?ws.props[b.item].at:null;
    if(b.item&&isCarrot(b.item)&&ws.props[b.item]?.at==='kitchen_pot'&&['take','eat','give','throw','drop'].includes(b.verb)){
      repairs.push('Bear can put a carrot into the pot, but cannot take it out yet. The carrot stays in the pot.');b.verb='point_at';b.target='kitchen_pot';b.item=null;
    }
    if(isKitchenContainer(container)&&!kitchenContainerApproach(container,a)){
      repairs.push(`${a} cannot safely reach ${container}; the object stays where it is.`);b.verb='point_at';b.target=container;b.item=null;
    }
    if(b.verb==='put_down'&&isKitchenContainer(b.target)&&Object.entries(ws.props).some(([id,p])=>id!==b.item&&p.at===b.target)){
      repairs.push('This kitchen container already holds a carrot. The new carrot stays held.');b.verb='shrug';b.target=null;b.item=null;
    }
    if(b.verb==='nudge'&&(a!=='masha'||b.item!=='ball'||b.target!=='bench'||ws.props.ball?.at!=='bench'||st.holding)){
      repairs.push('Nudge needs Masha’s free hand and the ball resting on the bench.');b.verb='look_at';b.target='bench';b.item=null;
    }
    if(b.item&&isCarrot(b.item)&&st.holding&&st.holding!==b.item&&['eat','give','throw','drop'].includes(b.verb)){
      repairs.push('The actor needs a free hand before acquiring this carrot. The held item stays in the hand.');b.verb='shrug';b.target=null;b.item=null;
    }
    if(b.item&&['eat','give','throw','drop'].includes(b.verb)&&st.holding!==b.item){
      const at=ws.props[b.item]?.at;
      if(at==='cupboard'&&a!=='bear'||b.item==='pantry_honey'&&at==='hidden'){
        repairs.push('This item is unavailable to the actor; do not repeatedly insert an impossible pickup.');
        b.verb='point_at';b.target='cupboard';b.item=null;
      }
    }
    if ((b.verb === "eat" || b.verb === "give" || b.verb === "throw" || b.verb === "drop") && b.item && st.holding !== b.item) {
      const at = ws.props[b.item]?.at;
      if (isActor(at) && at !== a) {
        errors.push(`${a} can't ${b.verb} the ${b.item}: ${at} is holding it`);
        b.verb = "point_at"; b.target = at; b.item = null;
      } else {
        const key=JSON.stringify([orig,a,b.verb,b.item,st.holding,ws.props[b.item],st.posture,st.mark]);
        if(attemptedPickups.has(key)){
          repairs.push(`Unable to acquire ${b.item} for ${b.verb}; the prerequisite made no progress and will not repeat.`);
          b.verb='shrug';b.target=null;b.item=null;
        }else{
          attemptedPickups.add(key);
          const take: Beat = { ...b, verb: "take", target: b.item, item: b.item, line: null, emote: null, sfx: null, shot: "auto" };
          queue.splice(origIndex, 0, { beat: take, orig: -1 });
          b.with_previous = false; b.delay_s = 0;
          idx = origIndex;
          repairs.push(`inserted take: ${a} picks up the ${b.item} before "${b.verb}"`);
          continue;
        }
      }
    }
    const heldBy = b.verb === "take" && b.item ? ws.props[b.item]?.at : undefined;
    if(b.verb==='take'&&b.item&&isCarrot(b.item)&&st.holding&&st.holding!==b.item){repairs.push('The actor needs a free hand: put down or give the held item before picking another carrot.');b.verb='shrug';b.target=null;b.item=null;}
    if(b.verb==='take'&&b.item&&isCarrot(b.item)&&heldBy===a){repairs.push('This carrot is already held.');b.verb='look_at';b.target='garden';b.item=null;}
    if(b.verb==='take'&&b.item==='pantry_honey'&&heldBy===a){
      repairs.push('The single cupboard jar is already held; no second jar appears.');b.verb='look_at';b.target='cupboard';b.item=null;
    }
    if(b.verb==='take'&&b.item==='pantry_honey'&&heldBy==='hidden'){
      repairs.push('The cupboard jar is no longer available; the cupboard does not refill.');b.verb='look_at';b.target='cupboard';b.item=null;
    }
    if(a!=='bear'&&b.verb==='take'&&heldBy==='cupboard'){
      errors.push('Only Bear can reach the upper cupboard in this release.');b.verb='point_at';b.target='cupboard';b.item=null;
    }
    if (b.verb === "take" && b.item && isActor(heldBy) && heldBy !== a) {
      errors.push(`${a} can't take the ${b.item}: ${heldBy} is holding it`);
      b.verb = "point_at"; b.target = heldBy; b.item = null;
    }

    compiledBeats.push(b);
    const def = GRAMMAR[b.verb];
    const anchor = prevTiming ? (b.with_previous ? prevTiming.start : prevTiming.end) : 0;
    // The doorway shot has exclusive staging until its traveller clears the
    // steps; do not perform another actor's cooking/hug unseen behind that cut.
    let t = Math.max(anchor + b.delay_s, tracks[a].free, doorFree, cupboardFree, isKitchenContainer(container)?kitchenContainerFree:0);
    const interacts = (b.verb === "hug" || b.verb === "carry" || b.verb === "give") && isActor(b.target);
    if (interacts && isActor(b.target)) t = Math.max(t, tracks[b.target].free);
    const beatStart = t;
    const fromPos = posAt(a, t);
    if(st.posture==='sit'&&(b.verb==='stand_up'||!SIT_OK.has(b.verb)))t=clearChairExit(a,t,b.emotion);

    // --- posture transitions (pre-clips) ---
    if (a === "masha" && st.posture === "carried" && !CARRIED_OK.has(b.verb)) t = dismount(t);
    if (a === "bear" && ws.actors.masha.posture === "carried" && ENDS_CARRY.has(b.verb)) t = Math.max(t, dismount(t));
    if (st.posture === "sleep" && !SLEEP_OK.has(b.verb)) {
      const exit=seatExit(a);
      addClip(a, t, GRAMMAR.wake_up.baseDuration, "wake_up", "sleepy", { from: v2(st.pos), facing: st.facing, posture: "stand", item: st.holding ?? undefined,...exit });
      events.push({ actor: a, verb: "wake_up", start: t, dur: GRAMMAR.wake_up.baseDuration, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
      t += GRAMMAR.wake_up.baseDuration;
      st.posture = "stand";
      if(exit){st.pos=v2(exit.to);st.facing=exit.facing;st.mark=null;}
      record(a, t);
    }
    if (st.posture === "sit" && b.verb!=='stand_up' && !SIT_OK.has(b.verb)) {
      const exit=seatExit(a);
      addClip(a, t, GRAMMAR.stand_up.baseDuration, "stand_up", b.emotion, { from: v2(st.pos), facing: st.facing, posture: "stand", item: st.holding ?? undefined,...exit });
      events.push({ actor: a, verb: "stand_up", start: t, dur: GRAMMAR.stand_up.baseDuration, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
      t += GRAMMAR.stand_up.baseDuration;
      st.posture = "stand";
      if(exit){st.pos=v2(exit.to);st.facing=exit.facing;st.mark=null;}
      record(a, t);
    }

    if(b.verb==='hug'&&isActor(b.target)){
      t=putAsideForHug(a,t,b.emotion);t=putAsideForHug(b.target,t,b.emotion);
    }
    if(b.target==='house_living'&&(a==='masha'||a==='bear')&&st.posture!=='sit'&&(b.verb==='sit'||LOCOMOTION_VERBS.includes(b.verb)))t=clearChairEntry(a,t,b.emotion);
    if(st.holding&&isCarrot(st.holding)&&(b.verb==='take'&&b.item&&b.item!==st.holding||VERB_IMPLIED_PROP[b.verb]&&VERB_IMPLIED_PROP[b.verb]!==st.holding))t=putAsideForHug(a,t,b.emotion);
    if(b.verb==='take'&&b.item&&st.holding&&st.holding!==b.item&&isInteriorMark(ws.props[b.item]?.at)){
      t=putAsideBeforeInteriorPickup(a,t,ws.props[b.item].at==='cupboard'?'house_kitchen':ws.props[b.item].at as MarkId,b.emotion);
    }

    // --- auto-walk to where the verb happens ---
    let walkDest: Vec2 | null = null;
    let walkTarget: string | null = null;
    const seatedAtHammock=st.posture==='sit'&&st.mark==='hammock'&&dist(st.pos,MARKS.hammock.pos)<1.05;
    const home = b.verb === "cook" && (isInteriorMark(b.target) || b.target !== "table" && isInsideHouse(st.pos[0],st.pos[1]))
      ? "house_kitchen" : VERB_HOME_MARK[b.verb] as MarkId | undefined;
    const cookingStation=b.verb==='cook'&&a==='masha'&&(home==='table'||home==='house_kitchen');
    const cookingSupport=home==='house_kitchen'?HOUSE_COOKING_HELPER:COOKING_STATION;
    if((b.verb==='put_down'||b.verb==='nudge')&&b.item&&isMark(b.target)){walkDest=carrotApproach(a,b.item,b.target);if(b.verb==='nudge')walkDest[0]+=.075;walkTarget=b.target;}
    else if (home) { walkDest = cookingStation?(home==='house_kitchen'?[...HOUSE_CHILD_COOK_POSITION]:[...cookingSupport.position]):spread(a, standPos(home), t); walkTarget = home; }
    else if (b.verb === "take" && b.item && ws.props[b.item]?.at !== "hidden" && ws.props[b.item]?.at !== a) { walkDest = approachPoint(a, b.item, t); walkTarget = b.item; }
    else if (interacts && b.target) {
      if(b.verb==='hug'&&isActor(b.target)&&tracks[b.target].free<=t+1e-6&&ws.actors[b.target].posture==='stand'){
        const partner=b.target,p=ws.actors[partner].pos,table=MARKS.table.pos;
        // Clear the tabletop and both benches before making a small child the
        // focus of a paired action. Move the partner's actual track/root first.
        if(dist(p,table)<2.5&&!isInsideHouse(...p)){
          const d=Math.max(.001,dist(p,table)),destination=clampWalkable([table[0]+(p[0]-table[0])/d*2.6,table[1]+(p[1]-table[1])/d*2.6]),start=t;
          t=locomote(partner,t,'walk_to',destination,b.emotion,null);
          events.push({actor:partner,verb:'walk_to',start,dur:t-start,emote:null,hasLine:false,sfx:null,sfxAt:start,pos:v2(destination),main:false});
        }
      }
      walkDest=b.verb==='hug'&&isActor(b.target)?hugApproach(a,b.target,t):approachPoint(a,b.target,t,b.verb==='give'?1:.7);walkTarget=b.target;
      // The receiver faces the arrival point while the child is still at a safe
      // distance, rather than rotating through a closed embrace.
      if(b.verb==='hug'&&isActor(b.target)&&walkDest&&['stand','sit'].includes(ws.actors[b.target].posture))t=facePartner(b.target,t,walkDest,b.emotion);
    }
    else if ((b.verb === "sit" || b.verb === "sleep" || b.verb === "hide") && isMark(b.target)) {
      walkDest=spread(a,standPos(b.target),t);walkTarget=b.target;
      if(b.verb==='sit'&&b.target==='house_living'&&st.posture!=='sit'&&(a==='masha'||a==='bear'))walkDest=armchairApproach(a);
      if(b.verb==='sleep'&&b.target==='hammock'&&seatedAtHammock)walkDest=null;
      else if(b.verb==='sleep'&&b.target==='hammock'&&st.posture!=='sleep'){
        const points=([1,-1] as const).map(side=>clampWalkable(hammockExitPoint(MARKS.hammock.pos,a,side)));
        points.sort((p,q)=>pathLength(avoidHammock(planPath(st.pos,p),a))-pathLength(avoidHammock(planPath(st.pos,q),a)));
        walkDest=points[0];
      }
    }
    let walkInfo: BeatTiming["walk"] = null;
    if (walkDest && dist(walkDest, st.pos) > (b.verb==='hug'?.004:b.item&&(isCarrot(b.item)||b.item==='ball')&&['take','put_down','nudge'].includes(b.verb)?.04:cookingStation||b.verb==='take'&&isInsideHouse(...walkDest)||b.verb==='sit'&&b.target==='house_living' ? .04 : .8) && st.posture !== "carried") {
      const d = dist(walkDest, st.pos);
      const verb: Verb = a === "masha" ? (b.emotion === "mischievous" && d < 6 ? "tiptoe_to" : d > 3 ? "run_to" : "walk_to")
        : isWolf(a) ? (b.emotion === "mischievous" && d < 8 ? "tiptoe_to" : b.emotion === "scared" || d > 5 ? "run_to" : "walk_to")
        : d > 8 && b.emotion === "excited" ? "run_to" : "walk_to";
      const s0 = t;
      const faceAfter = isMark(walkTarget) ? MARKS[walkTarget].facing : undefined;
      const wFrom = v2(st.pos);
      t = locomote(a, t, verb, walkDest, b.emotion, walkTarget, faceAfter,b.verb==='hug'||b.target==='hammock'?avoidHammock(planPath(wFrom,walkDest),a):undefined);
      events.push({ actor: a, verb, start: s0, dur: t - s0, emote: null, hasLine: false, sfx: null, sfxAt: s0, pos: v2(st.pos), main: false });
      walkInfo = { start: s0, dur: t - s0, verb, from: wFrom, to: v2(st.pos) };
    }

    if((b.verb==='take'||b.verb==='put_down')&&isKitchenContainer(container)&&walkDest&&dist(st.pos,walkDest)>.06){
      repairs.push('The kitchen container approach is blocked. The prop stays in its previous owner or container.');b.verb='shrug';b.target=null;b.item=null;
    }
    if(b.verb==='sleep'&&b.target==='hammock'&&st.posture==='stand')t=facePartner(a,t,[st.pos[0]+Math.sin(MARKS.hammock.facing),st.pos[1]+Math.cos(MARKS.hammock.facing)],b.emotion);
    if(b.verb==='sit'&&b.target==='house_living'&&st.posture!=='sit'&&(a==='masha'||a==='bear'))t=facePartner(a,t,[st.pos[0],st.pos[1]+1],b.emotion);
    if(b.verb==='hug'&&isActor(b.target)&&['stand','sit'].includes(ws.actors[b.target].posture)){
      const start=t;t=Math.max(facePartner(a,start,ws.actors[b.target].pos,b.emotion),facePartner(b.target,start,st.pos,b.emotion));
    }

    if(b.item&&(isCarrot(b.item)||b.item==='ball')&&['take','put_down','nudge'].includes(b.verb)){
      const mark=b.verb==='put_down'||b.verb==='nudge'?b.target:ws.props[b.item]?.at;
      if(isMark(mark)){const placement=propPlacementInState(b.item,{at:mark,planted:b.verb==='take'&&ws.props[b.item].planted}),grip=propGripWorld(placement.pos,placement.rot,PROP_CONTACTS[b.item].point);const yaw=isKitchenContainer(mark)?kitchenContainerApproach(mark,a)!.yaw:isCarrot(b.item)||b.item==='ball'?Math.PI:yawTo(st.pos,[grip[0],grip[2]],st.facing);t=facePartner(a,t,[st.pos[0]+Math.sin(yaw),st.pos[1]+Math.cos(yaw)],b.emotion);}
    }
    if(b.verb==='take'&&b.item&&ws.props[b.item]?.at==='cupboard'){
      if((ws.objects?.kitchen_cupboard??0)<.999){repairs.push('Opened the cupboard before reaching inside.');t=cupboardAction(a,t,1,b.emotion);}
      t=facePartner(a,t,[st.pos[0]-1,st.pos[1]],b.emotion);
      st.mark='cupboard';
    }

    // Free both hands before applause. A visible reverse pickup preserves the
    // prop in world state, so it can be picked up again in a later paragraph.
    if(b.verb==='clap'&&st.holding&&isCarrot(st.holding)&&st.posture!=='carried')t=putAsideForHug(a,t,b.emotion);
    if(b.verb==='clap'&&st.holding&&st.posture!=='carried'){
      const item=st.holding,reach=CHARACTER_REACH[a],small=reach.shoulder[1]<.9,tiny=reach.shoulder[1]<.45,inside=isInsideHouse(...st.pos);
      const mark:MarkId=tiny?'clearing':inside?(small?'house_living':'house_kitchen'):(small?'bench':'table');
      const placement=propPlacementAtMark(item,mark),grip=propGripWorld(placement.pos,placement.rot,PROP_CONTACTS[item].point);
      if(st.posture==='sit'){
        const exit=seatExit(a);addClip(a,t,GRAMMAR.stand_up.baseDuration,'stand_up',b.emotion,{from:v2(st.pos),facing:st.facing,posture:'stand',item,...exit});
        if(exit)st.pos=v2(exit.to);st.posture='stand';st.mark=null;t+=GRAMMAR.stand_up.baseDuration;record(a,t);
      }
      // Approach the actual rotated grip, on furniture the rig can reach.
      // Short actors use the bench instead of the tall table; shoulder offset
      // keeps a broad Bear from aiming the right paw at his chest centre.
      let yaw=0;
      if(mark==='bench')yaw=grip[2]>=MARKS.bench.pos[1]?Math.PI:0;
      else if(mark==='table')yaw=yawTo([grip[0],grip[2]],MARKS.table.pos,Math.PI);
      else if(mark==='clearing')yaw=yawTo(st.pos,[grip[0],grip[2]],st.facing);
      const lead=small?.07+reach.length*.1:reach.length*.28,c=Math.cos(yaw),s=Math.sin(yaw);
      let dest:Vec2=[grip[0]-c*reach.shoulder[0]-s*(reach.shoulder[2]+lead),grip[2]+s*reach.shoulder[0]-c*(reach.shoulder[2]+lead)];
      if(mark==='bench')dest[1]=yaw===0?Math.min(dest[1],2.75):Math.max(dest[1],3.25);
      if(mark==='table'){
        const centre=MARKS.table.pos,dx=dest[0]-centre[0],dz=dest[1]-centre[1],length=Math.hypot(dx,dz),clearance=.82+Math.abs(reach.shoulder[0])*.75;
        if(length<clearance)dest=[centre[0]+dx/Math.max(length,.001)*clearance,centre[1]+dz/Math.max(length,.001)*clearance];
      }else if(!inside)dest=clampWalkable(dest);
      const s0=t;
      if(dist(st.pos,dest)>.04){t=locomote(a,t,'walk_to',dest,b.emotion,mark,yaw);events.push({actor:a,verb:'walk_to',start:s0,dur:t-s0,emote:null,hasLine:false,sfx:null,sfxAt:s0,pos:v2(st.pos),main:false});}
      st.facing=yaw;
      addClip(a,t,.8,'take',b.emotion,{from:v2(st.pos),facing:st.facing,posture:st.posture,item,putDown:mark,lookAt:grip});
      ws.props[item]={at:mark,...(isCarrot(item)?{planted:false}:{})};st.holding=null;t+=.8;record(a,t);
    }

    // --- main clip ---
    const mainStart = t;
    const lineText = b.line;
    const lineLang = lineText && /[\u0400-\u04FF]/.test(lineText) ? 'ru' : lineText && /[A-Za-z]/.test(lineText) ? 'en' : opts.lang;
    const lineDur = lineText ? dialogueDuration(lineText, lineLang, opts.speechDurations) : 0;
    let mainDur = def.baseDuration;
    let tail = 0;
    const isLoco = (LOCOMOTION_VERBS as Verb[]).includes(b.verb);
    const facingTo = (id: string | null): number => {
      const p = targetPoint(id, t);
      return p ? r3(yawTo(st.pos, [p[0], p[2]], st.facing)) : st.facing;
    };
    let sfxAt = mainStart + 0.15;
    const baseParams = (): ActorClip["params"] => ({ from: v2(st.pos), facing: st.facing, posture: st.posture, item: st.holding ?? undefined, target: b.target ?? undefined });

    if(b.verb==='open'||b.verb==='close'){
      t=b.target==='cupboard'?cupboardAction(a,t,b.verb==='open'?1:0,b.emotion):doorAction(a,t,b.verb==='open'?1:0,b.emotion);
      mainDur=t-mainStart;
    } else if (isLoco) {
      let dest: Vec2;
      let path: Vec2[] | undefined;
      let faceAfter: number | undefined;
      if (b.verb === "enter") {
        if (st.posture === "offstage") {
          const fromP: Vec2 = st.mark === "door" ? v2(MARKS.door.pos) : v2(MARKS.path_entry.pos);
          st.pos = fromP;
          st.posture = "stand";
          dest = st.mark === "door" ? spread(a, standPos("porch"), t) : spread(a, [MARKS.clearing.pos[0] + ENTER_OFFSET[a][0], MARKS.clearing.pos[1] + ENTER_OFFSET[a][1]], t);
        } else dest = spread(a, standPos("clearing"), t);
      } else if (b.verb === "exit") {
        dest = v2(MARKS.path_entry.pos);
      } else if (b.verb === "chase" && isActor(b.target)) {
        const tp = posAt(b.target, t);
        const R = 2.2;
        const th0 = Math.atan2(st.pos[0] - tp[0], st.pos[1] - tp[1]);
        path = [v2(st.pos)];
        for (let k = 0; k <= 8; k++) {
          const th = th0 + (k / 8) * Math.PI * 1.25;
          const rr = k === 8 ? 0.9 : R;
          path.push(clampWalkable([tp[0] + Math.sin(th) * rr, tp[1] + Math.cos(th) * rr]));
        }
        dest = path[path.length - 1];
        faceAfter = yawTo(dest, tp, st.facing);
        // the chased character runs ahead if free
        if (tracks[b.target].free <= t + 1e-6 && ws.actors[b.target].posture === "stand") {
          const ot = b.target;
          const opath: Vec2[] = [v2(ws.actors[ot].pos)];
          for (let k = 1; k <= 8; k++) {
            const th = th0 + Math.PI * 0.5 + (k / 8) * Math.PI * 1.1;
            opath.push(clampWalkable([tp[0] + Math.sin(th) * R, tp[1] + Math.cos(th) * R]));
          }
          const ostart = t;
          const oend = locomote(ot, t, "run_to", opath[opath.length - 1], "excited", null, undefined, opath);
          events.push({ actor: ot, verb: "run_to", start: ostart, dur: oend - ostart, emote: null, hasLine: false, sfx: null, sfxAt: ostart, pos: v2(ws.actors[ot].pos), main: false });
        }
      } else if (b.target) {
        const ap = approachPoint(a, b.target, t, 0.9);
        dest = ap ?? v2(st.pos);
        if (isMark(b.target)) faceAfter = MARKS[b.target].facing;
        else if (isActor(b.target)) faceAfter = yawTo(dest, posAt(b.target, t), st.facing);
        // Reaching a door is an approach, never an offstage disappearance.
      } else dest = v2(st.pos);
      t = locomote(a, t, b.verb, dest, b.emotion, b.verb === "exit" ? "path_entry" : b.target, faceAfter, path);
      mainDur = t - mainStart;
      if (b.verb === "exit") {
        st.posture = "offstage";
        st.mark = b.verb === "exit" ? "path_entry" : "door";
        record(a, t);
      }
      sfxAt = b.target === "door" || b.verb === "exit" ? t - 0.2 : mainStart + 0.15;
      if (lineText && lineDur > mainDur) tail = lineDur - mainDur;
    } else {
      // in-place verbs
      let facing = st.facing;
      let item: PropId | undefined = st.holding ?? undefined;
      let posture: Posture = st.posture;
      switch (b.verb) {
        case "point_at": case "look_at": case "wave": case "peek":
          facing = b.target ? facingTo(b.target) : isActor(o) && ws.actors[o].posture !== "offstage" && lineText ? facingTo(o) : st.facing;
          break;
        case "hug": case "give": case "carry":
          facing = facingTo(b.target);
          break;
        case "throw":
          facing = b.target ? facingTo(b.target) : st.facing;
          break;
        case "nudge":
          item=b.item??undefined;mainDur=1.8;facing=st.facing;break;
        case "put_down":
          item=b.item??undefined;mainDur=2.0;break;
        case "take":
          item = b.item ?? undefined;
          if(item&&(isCarrot(item)||item==='ball')){mainDur=2.2;facing=st.facing;}
          if(b.item&&ws.props[b.item]?.at==='cupboard'){facing=-Math.PI/2;mainDur=3.0;}
          else if(b.item&&isInteriorMark(ws.props[b.item]?.at)&&!isKitchenContainer(ws.props[b.item]?.at))facing=facingTo(b.item);
          break;
        case "cook": case "fish": case "water_plants":
          item = (VERB_IMPLIED_PROP[b.verb] as PropId | undefined) ?? item;
          facing = cookingStation ? cookingSupport.facing : MARKS[home!].facing;
          break;
        case "sit": posture = "sit"; if (isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2) facing = MARKS[b.target].facing; break;
        case "sleep": posture = "sleep"; if (isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2) facing = MARKS[b.target].facing; break;
        case "hide": if (isMark(b.target)) facing = MARKS[b.target].facing; break;
        case "wake_up": case "stand_up": posture = "stand"; break;
        case "surprised": case "scared": if (posture === "sleep") posture = "stand"; break;
        case "fall_down": posture = "stand"; break;
        default:
          if (lineText && ws.actors[o].posture !== "offstage" && st.posture === "stand" && !b.target) facing = facingTo(o);
      }
      if (lineText && lineDur > mainDur) {
        if (def.loopable) mainDur = lineDur;
        else tail = lineDur - mainDur;
      }
      const lookAt = b.verb==='cook'&&home==='house_kitchen'
        ? (a==='masha'?[HOUSE_CHILD_COOK_POSITION[0]-.42,1.25,HOUSE_CHILD_COOK_POSITION[1]-.10]:[HOUSE_STOVE[0],1.30,HOUSE_STOVE[1]]) as Vec3
        : b.target ? targetPoint(b.target, t) : lineText && ws.actors[o].posture !== "offstage" ? headAt(o, t) : null;
      if(VERB_IMPLIED_PROP[b.verb]&&item&&st.holding!==item)giveTo(a,item);
      const exit=b.verb==='stand_up'||st.mark==='hammock'&&posture==='stand'&&(st.posture==='sleep'||st.posture==='sit')?seatExit(a):null;
      const mount=b.verb==='sleep'&&b.target==='hammock'&&st.posture!=='sleep'&&!seatedAtHammock?{from:v2(st.pos),to:v2(MARKS.hammock.pos),path:[v2(st.pos),v2(MARKS.hammock.pos)],facing:MARKS.hammock.facing,target:'hammock' as const}:b.verb==='sit'&&b.target==='house_living'&&st.posture!=='sit'&&(a==='masha'||a==='bear')?{from:v2(st.pos),to:v2(MARKS.house_living.pos),path:[v2(st.pos),v2(MARKS.house_living.pos)],facing:MARKS.house_living.facing,target:'house_living' as const}:null;
      if(exit)facing=exit.facing;
      if(mount)facing=mount.facing;
      const pickUpAt=b.verb==='take'&&item&&(isInteriorMark(ws.props[item]?.at)||(isCarrot(item)||item==='ball')&&isMark(ws.props[item]?.at))?ws.props[item].at as MarkId:undefined;
      const exactPickup=pickUpAt&&item&&(isCarrot(item)||item==='ball')?propPlacementInState(item,{...ws.props[item],at:pickUpAt}):null;
      const putDown=b.verb==='put_down'&&item&&isMark(b.target)?b.target:undefined;
      const exactPlacement=putDown&&item?propPlacementAtMark(item,putDown):null;
      // Release into the pot from above its rim; a broad paw must not follow
      // the carrot to the bottom. The evaluator supplies the short free fall.
      if(exactPlacement&&putDown==='kitchen_pot')exactPlacement.pos[1]+=.32;
      const nudgePlacement=b.verb==='nudge'&&item?propPlacementAtMark(item,'bench'):null;
      const contactPlacement=exactPickup??exactPlacement??nudgePlacement;
      const contact=contactPlacement&&item?propGripWorld(contactPlacement.pos,contactPlacement.rot,item==='ball'?[0,.15,0]:PROP_CONTACTS[item].point):null;
      if(contact&&item==='ball'&&pickUpAt!=='bench'&&putDown!=='bench'&&!nudgePlacement)contact[1]-=.15;
      addClip(a, mainStart, mainDur, b.verb, b.emotion, { ...baseParams(), facing: r3(facing), posture, item, lookAt: contact??lookAt ?? undefined,...(pickUpAt?{pickUpAt}:{}),...(exactPickup?{pickUpPosition:exactPickup.pos,pickUpRotation:exactPickup.rot}:{}),...(exactPlacement?{putDown,putDownPosition:exactPlacement.pos,putDownRotation:exactPlacement.rot}:{}),...(nudgePlacement?{nudgeAt:'bench' as const,nudgePosition:nudgePlacement.pos,nudgeRotation:nudgePlacement.rot}:{}),...(b.verb==='drop'?{dropAt:st.mark??nearestMark(st.pos)}:{}),...(b.verb==='fish'?{catchesFish:ws.props.fish?.at==='hidden'}:{}),...exit,...mount });
      if(exit){st.pos=v2(exit.to);st.mark=null;}
      if(mount){st.pos=v2(mount.to);st.mark=mount.target;}
      st.facing = r3(facing);
      t = mainStart + mainDur;
      if(pickUpAt==='cupboard'){cupboardFree=t;cupboardShot(mainStart,t);}
      if(isKitchenContainer(pickUpAt)||isKitchenContainer(putDown))kitchenContainerFree=t;
      if(item&&isCarrot(item)&&(pickUpAt||putDown))objectInteractionShot(a,item,mainStart,t,(pickUpAt??putDown)!);
      if(item==='ball'&&(pickUpAt||putDown||nudgePlacement||b.verb==='drop'))objectInteractionShot(a,item,mainStart,t,pickUpAt??putDown??(nudgePlacement?'bench':st.mark)??'clearing',!!pickUpAt);

      // --- world-state effects ---
      switch (b.verb) {
        case "nudge":
          ws.props.ball={at:"clearing",position:[...BENCH_BALL_FALLBACK.position],rotation:[...BENCH_BALL_FALLBACK.rotation]};break;
        case "put_down":
          if(b.item&&putDown){ws.props[b.item]={at:putDown,planted:false};st.holding=null;}
          break;
        case "drop":
          if (b.item) { ws.props[b.item] = { at: st.mark ?? nearestMark(st.pos) }; st.holding = null; }
          break;
        case "take":
          if (b.item) {
            if (ws.props[b.item]?.at === "hidden") repairs.push(`the ${b.item} appeared for ${a}`);
            giveTo(a, b.item);
            if (b.item === "flour_bag") flourUsed = true;
          }
          break;
        case "give":
          if (b.item && isActor(b.target)) {
            st.holding = null;
            giveTo(b.target, b.item);
            if (tracks[b.target].free <= mainStart + 1e-6 && ws.actors[b.target].posture !== "offstage") {
              const tgt = b.target;
              addClip(tgt, mainStart, mainDur, "take", "happy", { from: v2(ws.actors[tgt].pos), facing: r3(yawTo(ws.actors[tgt].pos, st.pos, ws.actors[tgt].facing)), posture: ws.actors[tgt].posture, item: b.item, target: a });
              record(tgt, mainStart + mainDur);
            }
          }
          break;
        case "eat":
          if (b.item && CONSUMABLE.has(b.item)) { ws.props[b.item] = { at: "hidden" }; st.holding = null; }
          break;
        case "throw":
          if (b.item) {
            const item0 = b.item;
            st.holding = null;
            let land: Vec2;
            if (isActor(b.target) && ws.actors[b.target].posture !== "offstage") {
              land = posAt(b.target, t);
              if (!ws.actors[b.target].holding) giveTo(b.target, item0);
              else ws.props[item0] = { at: ws.actors[b.target].mark ?? nearestMark(land),...(isCarrot(item0)?{planted:false}:{}) };
            } else if (isMark(b.target)) {
              land = v2(MARKS[b.target].pos);
              ws.props[item0] = { at: b.target,...(isCarrot(item0)?{planted:false}:{}) };
            } else {
              const f: Vec2 = [Math.sin(st.facing), Math.cos(st.facing)];
              land = clampWalkable([st.pos[0] + f[0] * 3, st.pos[1] + f[1] * 3]);
              ws.props[item0] = { at: nearestMark(land),...(isCarrot(item0)?{planted:false}:{}) };
            }
            const wet = b.target === "pond_shore" || b.target === "pier" || b.target === "creek";
            if (wet) {
              const pond = OBSTACLES.circles.find((c) => c.id === "pond")!;
              const wp: Vec2 = b.target === "creek" ? v2(MARKS.creek.pos) : [(land[0] + pond.c[0]) / 2, (land[1] + pond.c[1]) / 2];
              addFx("splash", mainStart + 0.6 * mainDur, 1.2, [wp[0], 0, wp[1]]);
              extraSfx.push({ t: mainStart + 0.6 * mainDur, id: "splash", pos: wp });
            }
            if (item0 === "flour_bag") { flourUsed = true; addFx("flour_cloud", mainStart + 0.6 * mainDur, 2.5, [land[0], 0.8, land[1]]); }
          }
          break;
        case "cook":
          ws.props.pancakes = { at: home! };
          break;
        case "fish": {
          addFx("splash", mainStart + 0.3 * mainDur, 1.2, [...FISHING_WATER_TARGET]);
          if (ws.props.fish?.at === "hidden") { if (st.holding) dropHeld(a); ws.actors[a].holding = "fish"; ws.props.fish = { at: a }; }
          break;
        }
        case "carry":
          if (isActor(b.target) && b.target === "masha") {
            const m = ws.actors.masha;
            if (m.posture !== "offstage") {
              addClip("masha", mainStart, mainDur, "idle", "happy", { from: v2(m.pos), to: v2(st.pos), path: [v2(m.pos), v2(st.pos)], facing: st.facing, posture: "carried", item: m.holding ?? undefined, target: "bear" });
              m.posture = "carried";
              m.pos = v2(st.pos);
              m.facing = st.facing;
              m.mark = st.mark;
              record("masha", mainStart + mainDur);
            }
          }
          break;
        case "hug":
          if (isActor(b.target) && tracks[b.target].free <= mainStart + 1e-6 && ["stand","sit"].includes(ws.actors[b.target].posture)) {
            const tgt = b.target;
            const tf = r3(yawTo(ws.actors[tgt].pos, st.pos, ws.actors[tgt].facing));
            addClip(tgt, mainStart, mainDur, "hug", "happy", { from: v2(ws.actors[tgt].pos), facing: tf, posture: ws.actors[tgt].posture, item: ws.actors[tgt].holding ?? undefined, target: a });
            ws.actors[tgt].facing = tf;
            record(tgt, mainStart + mainDur);
          }
          {
            const tp = isActor(b.target) ? posAt(b.target, mainStart) : st.pos;
            addFx("hearts", mainStart + 0.3, 2.0, [(st.pos[0] + tp[0]) / 2, 1.6, (st.pos[1] + tp[1]) / 2]);
          }
          break;
      }
      st.posture = posture;
      if (b.verb === "sit" || b.verb === "sleep" || b.verb === "hide") st.mark = isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2 ? b.target : st.mark;
      record(a, t);
    }

    // idle tail so a non-loopable beat lasts as long as its line
    if (tail > 0.05) {
      addClip(a, t, tail, st.posture === "sleep" ? "sleep" : "idle", b.emotion, { from: v2(st.pos), facing: st.facing, posture: st.posture, item: st.holding ?? undefined, lookAt: ws.actors[o].posture !== "offstage" ? headAt(o, t) : undefined });
      t += tail;
      record(a, t);
    }

    // dialogue
    const lineStart = mainStart;
    // TTS voice follows the script of the words (a child may quote Russian with an English UI), else the UI language
    if (lineText) dialogue.push(makeDialogueCue(r3(lineStart), a, lineText, lineLang, opts.speechDurations));

    // fx tied to the beat
    const head = headAt(a, mainStart);
    if (b.verb === "sleep") {
      const mounting=tracks[a].clips.some(c=>c.start===mainStart&&c.verb==='sleep'&&c.params.target==='hammock'&&c.params.to);
      const settle=mounting?hammockTiming(true,mainDur).settled:0;
      const delay=mounting?Math.min(mainDur-.1,settle+Math.min(1.05,Math.max(.2,mainDur-settle))):.5;
      const sleepingHead=headAt(a,mainStart+delay);
      addFx("zzz",mainStart+delay,Math.max(mounting?.1:.5,mainDur-delay),[sleepingHead[0],sleepingHead[1]+.5,sleepingHead[2]]);
    }
    if (b.verb === "fall_down") addFx("dust", mainStart + 0.4 * mainDur, 1.0, [st.pos[0], 0.1, st.pos[1]]);
    if (b.verb === "cry") addFx("tears", mainStart, mainDur, head);
    if (b.verb === "angry_stomp") addFx("anger_puff", mainStart, mainDur, [head[0], head[1] + 0.3, head[2]]);
    if (b.sfx === "magic_chime") addFx("sparkles", mainStart, 1.5, [st.pos[0], 1.0, st.pos[1]]);
    const flourNear = flourUsed || ws.actors[a].holding === "flour_bag" || ws.actors[o].holding === "flour_bag" ||
      (isMark(ws.props.flour_bag?.at) && dist(st.pos, MARKS[ws.props.flour_bag.at as MarkId].pos) < 3);
    if ((b.verb === "sneeze" && flourNear) || (b.verb === "take" && b.item === "flour_bag")) addFx("flour_cloud", mainStart + 0.3 * mainDur, 2.5, [st.pos[0], 1.0, st.pos[1]]);

    events.push({ actor: a, verb: b.verb, start: mainStart, dur: mainDur, emote: b.emote, hasLine: !!lineText, sfx: b.sfx, sfxAt, pos: v2(st.pos), main: true });

    const timing: BeatTiming = {
      start: beatStart, end: t, mainStart, mainDur, actor: a, verb: b.verb, from: fromPos, to: v2(st.pos),
      hasLine: !!lineText, lineStart, lineDur, walk: walkInfo, loud: LOUD_VERBS.has(b.verb) || (!!lineText && isShouted(lineText)) || (b.sfx != null && LOUD_SFX.has(b.sfx)),
      scary: false,
    };
    timing.scary = a === "bear" && (timing.loud || b.emotion === "angry" || b.verb === "chase" || (b.emote != null && BEAR_SCARY_EMOTES.has(b.emote)));
    timings.push(timing);
    prevTiming = timing;
  }

  // ---------- duration ----------
  let end = 0;
  for (const a of ACTORS) for (const c of tracks[a].clips) end = Math.max(end, c.start + c.dur);
  for (const d of dialogue) end = Math.max(end, d.start + d.dur);
  const duration = r3(Math.max(1.5, end + SEGMENT_TAIL));
  // Let the audience see the closed door and retained jar during the final
  // pause; the generic tail camera can otherwise cut behind the refrigerator.
  if(lastCupboardShot&&Math.abs(cupboardFree-end)<.002)lastCupboardShot.dur=duration-lastCupboardShot.start;
  if(lastCarrotShot&&!timings.some(tm=>tm.mainStart>=lastCarrotShot!.end-.001&&(tm.actor!==lastCarrotShot!.actor||LOCOMOTION_VERBS.includes(tm.verb))))lastCarrotShot.cue.dur=duration-lastCarrotShot.cue.start;

  // ---------- ambient life ----------
  const actorClips = Object.fromEntries(ACTOR_IDS.map(id => [id, fillAmbient(id)])) as Record<ActorId, ActorClip[]>;

  /** Who an idle character watches at time t: whoever's beat covers t (latest start), else its partner. */
  function focusAt(a: ActorId, o: ActorId, t: number): ActorId {
    let best: BeatTiming | null = null;
    for (const tm of timings) if (tm.actor !== a && tm.start <= t && t < tm.end && (!best || tm.start >= best.start)) best = tm;
    if (best && postureAt(best.actor, t) !== "offstage") return best.actor;
    if (isWolf(a) && postureAt(o, t) === "offstage") return postureAt("bear", t) !== "offstage" ? "bear" : "masha";
    return o;
  }

  function fillAmbient(a: ActorId): ActorClip[] {
    const o = otherActor(a);
    const clips = [...tracks[a].clips].sort((x, y) => x.start - y.start).map((c) => (a === "masha" && c.params.posture === "carried" ? rideAlong(c) : c));
    const out: ActorClip[] = [];
    let t = 0;
    for (const c of clips) {
      if (c.start > t + 1e-6 && c.start - t < 0.25 && out.length) out[out.length - 1] = { ...out[out.length - 1], dur: c.start - out[out.length - 1].start };
      else if (c.start > t + 1e-6) out.push(...ambientSpan(a, o, t, c.start));
      const s = Math.max(c.start, t);
      out.push({ ...c, start: s, dur: c.start + c.dur - s });
      t = c.start + c.dur;
    }
    if (duration > t + 1e-6) out.push(...ambientSpan(a, o, t, duration));
    // round consistently so clips are exactly contiguous
    const rounded: ActorClip[] = [];
    for (const c of out) {
      const s = r3(c.start);
      const e = r3(c.start + c.dur);
      if (e - s <= 1e-9) continue;
      const prev = rounded[rounded.length - 1];
      const start = prev ? r3(prev.start + prev.dur) : 0;
      rounded.push({ ...c, start, dur: r3(e - start) });
    }
    if (rounded.length) {
      const last = rounded[rounded.length - 1];
      last.dur = r3(duration - last.start);
    }
    return rounded;
  }

  /** A clip Masha plays on Bear's shoulders follows Bear's path over the clip's interval. */
  function rideAlong(c: ActorClip): ActorClip {
    const t0 = c.start;
    const t1 = c.start + c.dur;
    const p0 = posAt("bear", t0);
    const p1 = posAt("bear", t1);
    const params = { ...c.params, from: [r3(p0[0]), r3(p0[1])] as Vec2 };
    if (dist(p0, p1) > 0.05) {
      const pts: Vec2[] = [];
      for (let k = 0; k <= 4; k++) { const q = posAt("bear", t0 + ((t1 - t0) * k) / 4); pts.push([r3(q[0]), r3(q[1])]); }
      params.to = pts[pts.length - 1];
      params.path = pts;
    } else {
      delete params.to;
      delete params.path;
    }
    return { ...c, params };
  }

  function ambientSpan(a: ActorId, o: ActorId, s: number, e: number): ActorClip[] {
    const out: ActorClip[] = [];
    const st = stateAt(a, s);
    const posture = st.posture;
    const verbFor = (): Verb => (posture === "sleep" ? "sleep" : "idle");
    // reactions to loud beats of the others (the Wolves only react to Bear — they cower)
    const wolf = isWolf(a);
    const reactions = timings.filter((tm) => tm.actor !== a && (wolf ? tm.scary : tm.loud) && tm.mainStart + 0.25 >= s && tm.mainStart + 0.25 < e);
    let t = s;
    const pushIdle = (from: number, to: number) => {
      // split at the other actor's beat boundaries (look-at follows the action), max 4 s each
      const cuts = new Set<number>([from, to]);
      for (const tm of timings) if (tm.actor !== a) for (const x of [tm.start, tm.end]) if (x > from + 0.5 && x < to - 0.5) cuts.add(x);
      const pts = [...cuts].sort((x, y) => x - y);
      const fine: number[] = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const span = pts[i] - fine[fine.length - 1];
        const n = Math.ceil(span / 4);
        for (let k = 1; k <= n; k++) fine.push(fine[fine.length - 1] + (pts[i] - fine[fine.length - 1]) / (n - k + 1));
      }
      for (let i = 1; i < fine.length; i++) {
        const c0 = fine[i - 1];
        const c1 = fine[i];
        if (c1 - c0 < 1e-6) continue;
        const mid = (c0 + c1) / 2;
        const f = focusAt(a, o, mid);
        const look = postureAt(f, mid) !== "offstage" && posture !== "sleep" ? headAt(f, mid) : undefined;
        const p0 = posAt(a, c0);
        const params: ActorClip["params"] = { from: p0, facing: st.facing, posture, item: st.holding ?? undefined, lookAt: look, ambient: true };
        if (posture === "carried") {
          const p1 = posAt(a, c1);
          params.to = p1;
          params.path = [p0, posAt(a, mid), p1];
        }
        out.push({ start: c0, dur: c1 - c0, verb: verbFor(), emotion: posture === "sleep" ? "sleepy" : "neutral", params });
      }
    };
    for (const r of reactions) {
      if (posture === "sleep" || posture === "offstage") break;
      const rt = r.mainStart + 0.25;
      const verb: Verb = wolf ? "scared"
        : a === "masha" ? (r.verb === "fall_down" || r.verb === "sneeze" || r.verb === "laugh" ? "laugh" : "surprised") : r.verb === "laugh" ? "nod" : "surprised";
      const rd = GRAMMAR[verb].baseDuration;
      if (rt < t || rt + rd > e) continue;
      if (rt > t + 1e-6) pushIdle(t, rt);
      const ro = r.actor;
      out.push({ start: rt, dur: rd, verb, emotion: verb === "laugh" || verb === "nod" ? "happy" : verb === "scared" ? "scared" : "surprised", params: { from: posAt(a, rt), facing: r3(yawTo(posAt(a, rt), posAt(ro, rt), st.facing)), posture, item: st.holding ?? undefined, lookAt: headAt(ro, rt), ambient: true, target: ro } });
      t = rt + rd;
    }
    if (e > t + 1e-6) pushIdle(t, e);
    // zzz while asleep
    if (posture === "sleep" && e - s > 1) { const h = headAt(a, s); addFx("zzz", s, e - s, [h[0], h[1] + 0.5, h[2]]); }
    return out;
  }

  // ---------- camera ----------
  const lastLineIdx = timings.map((tm) => tm.hasLine).lastIndexOf(true);
  const camBeats: CameraBeatInfo[] = [...preparationCameras];
  timings.forEach((tm, i) => {
    const em = compiledBeats[i].emotion;
    if (tm.walk && tm.walk.dur > 0.5) {
      camBeats.push({ start: tm.walk.start, dur: tm.walk.dur, actor: tm.actor, verb: tm.walk.verb, shot: "auto", from: tm.walk.from, to: tm.walk.to, hasLine: false, lineStart: 0, lineDur: 0, punchline: false, emotion: em });
    }
    const st0 = tm.walk ? tm.walk.start + tm.walk.dur : tm.start;
    camBeats.push({
      start: st0, dur: tm.end - st0, actor: tm.actor, verb: tm.verb, shot: compiledBeats[i].shot, from: tm.walk ? tm.walk.to : tm.from, to: tm.to,
      hasLine: tm.hasLine, lineStart: tm.lineStart, lineDur: tm.lineDur, punchline: tm.hasLine && i === lastLineIdx, emotion: em,
    });
  });
  let camera = planCamera({
    carriedByAt: (actor,t) => actor==='masha'&&(postureAt(actor,t)==='carried'||tracks.bear.clips.some(c=>c.verb==='carry'&&c.start<=t&&t<c.start+c.dur))?'bear':null,
    facingAt: (actor,t) => tracks[actor].clips.find(c=>c.start<=t&&t<c.start+c.dur)?.params.facing ?? stateAt(actor,t).facing,
    duration, beats: camBeats, posAt, visibleAt: (x, tt) => cast.includes(x)&&postureAt(x, tt) !== "offstage", headY: (x, tt) => headAt(x, tt)[1],
    dialogue: dialogue.map((d) => ({ start: d.start, dur: d.dur, actor: d.actor })), isFirst: opts.isFirst, cameraSeed: opts.remix.cameraSeed,
  });
  // Door choreography must be readable even when a long beat spans two sets.
  // Later inserts win; trim ordinary shots rather than overlapping cue ranges.
  for(const shot of doorShots){
    const lo=shot.start,hi=lo+shot.dur;
    camera=camera.flatMap(c=>{
      const end=c.start+c.dur;
      if(end<=lo||c.start>=hi)return[c];
      return [...(c.start<lo?[{...c,dur:lo-c.start}]:[]),...(end>hi?[{...c,start:hi,dur:end-hi}]:[])];
    });
    camera.push(shot);camera.sort((a,b)=>a.start-b.start);
  }

  // An inserted close view must not leave a flashing fraction-of-a-second
  // fragment of the ordinary shot at either edge. Preserve object action views.
  if(objectInteractionShots.length&&doorShots.every(c=>objectInteractionShots.includes(c))){
    for(let i=0;i<camera.length;i++){
      const c=camera[i];if(c.dur>=1.2-.000001||camera.length===1)continue;
      const previous=camera[i-1],next=camera[i+1];
      if(next&&(!previous||objectInteractionShots.includes(next))){next.dur+=c.dur;next.start=c.start;camera.splice(i,1);i--;}
      else if(previous){previous.dur+=c.dur;camera.splice(i,1);i--;}
    }
    camera=camera.flatMap(c=>splitCameraCue(c,6));
  }

  // ---------- lighting ----------
  const tod = opts.remix.timeOfDay ?? bs0.time_of_day ?? startState.timeOfDay;
  const lighting: LightingCue[] = [];
  if (opts.isFirst || tod !== startState.timeOfDay) lighting.push({ start: 0, timeOfDay: tod, transition: tod === startState.timeOfDay ? 0 : 2.5 });
  ws.timeOfDay = tod;

  // ---------- audio ----------
  const audio = buildAudioCues({
    bs: bs0, actorClips, events, extraSfx, dialogue, camera, timeOfDay: tod, prevTimeOfDay: startState.timeOfDay, carry: opts.carry,
    isFirst: opts.isFirst, duration, musicMoodOverride: opts.remix.musicMood,
  });

  fx.sort((x, y) => x.start - y.start);
  const beatScript: BeatScript = { ...bs0, beats: compiledBeats };
  for (const a of ACTORS) ws.actors[a].pos = [r3(ws.actors[a].pos[0]), r3(ws.actors[a].pos[1])];

  return {
    segment: {
      paragraphId: opts.paragraphId,
      version: opts.version,
      duration,
      cast,
      startState: cloneWorldState(startState),
      endState: ws,
      actorClips,
      ...(objectCues.length?{objectCues}:{}),
      dialogue,
      emotes: audio.emotes,
      foley: audio.foley,
      camera,
      sfx: audio.sfx,
      music: audio.music,
      ambience: audio.ambience,
      ducking: audio.ducking,
      lighting,
      fx: fx.filter((f) => f.start < duration),
    },
    beatScript,
    repairs,
    errors,
    carry: audio.carry,
  };
}

function nearestMark(p: Vec2): MarkId {
  let best: MarkId = "clearing";
  let bd = Infinity;
  for (const m of Object.values(MARKS)) {
    if (m.id === "door" || m.id === "path_entry") continue;
    const d = dist(p, m.pos);
    if (d < bd) { bd = d; best = m.id; }
  }
  return best;
}
function nearestMarkWithin(p: Vec2, r: number): MarkId | null {
  const m = nearestMark(p);
  return dist(p, standPos(m)) <= r || dist(p, MARKS[m].pos) <= r ? m : null;
}

/** Is a prop edible (for parser/validator helpers). */
export function isEdible(p: PropId): boolean {
  return PROPS[p].edible;
}
/** Whether a character can speak (bible flag). */
export function speaks(a: ActorId): boolean {
  return CHARACTERS[a].speaks;
}
