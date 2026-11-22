import RAPIER from '@dimforge/rapier3d-compat';
import {Euler, Quaternion, Vector3} from 'three';
import type {ActorFrame, FrameState, Quat} from '../api';
import {ACTOR_IDS, type ActorClip, type Timeline, type Vec2, type Vec3} from '../../shared/schema';
import {sceneLocationAt} from '../../shared/bible/set';
import {evaluate} from '../player/evaluate';
import {qslerp} from '../motion/blend';
import {BALL_GROUP, BALL_RADIUS, MASHA_CENTER, MASHA_GROUP, MASHA_HALF_HEIGHT, MASHA_RADIUS, SKIN, createYardColliders} from './yardColliders';
import {ballApproach,planYardRoute,yardPointClear,yardRouteLength} from './yardNavigation';

export const PHYSICS_DT = 1 / 60;
const MAX_SECONDS = 180;
const MAX_CONTINUITY_SECONDS = 60;
const ROOT_VERBS = new Set(['idle','walk_to','run_to','tiptoe_to','wave','look_at','point_at','nod','shake_head','shrug','laugh','surprised','sigh','drop','take','put_down','nudge']);
const MOVE_VERBS = new Set(['walk_to','run_to','tiptoe_to']);
const NONCONTACT_VERBS = new Set(['idle','look_at','point_at','wave','nod','shake_head','shrug','laugh','surprised','sigh','facepalm']);
const BENCH_TOP=.47;
const DEFAULT_BENCH_IMPULSE:Vec3=[-.82,0,0];
export interface BallTransform { pos: Vec3; rotation: Quat }
export interface ReplayOptions {
  /** Simple drops warm in short tasks. A continuity chain is validated atomically. */
  background?:boolean;
  /** Sample the actual held prop origin from the loaded rig, without rendering. */
  sampleBall: (frame: FrameState) => BallTransform;
}
export interface PlaybackEvaluator {
  setTimeline(timeline: Timeline): void;
  evaluate(view: Timeline, t: number): FrameState;
  dispose(): void;
}
export interface ReplaySample {
  t: number;
  root: Vec3 | null;
  grounded: boolean;
  stride: number;
  ball: BallTransform | null;
  ballBefore?: BallTransform | null;
  sleeping: boolean;
}
type Sample=ReplaySample;
export interface BallImpulse {time:number;position:Vec3;impulse:Vec3}
/** Serializable canonical result shared by synchronous captures and the worker
 * reader. No world, loaded rig or wall-clock state crosses this boundary. */
export interface PreparedReplayData {
  source:Timeline;view:Timeline;samples:ReplaySample[];reason:string|null;failure:boolean;
  continuity:boolean;dropsCount:number;routes:{start:number;path:Vec2[];target:string|null}[];
  pickups:{start:number;attach:number;position:Vec3}[];impulses:BallImpulse[];
  steps:number;computeMs:number;revision:number;
}
interface Drop {t:number;bench:boolean;position?:Vec3;rotation?:Vec3}
let init: Promise<void> | undefined;
export async function createRapierReplay(options: ReplayOptions): Promise<RapierReplay> {
  await (init ??= RAPIER.init());
  return new RapierReplay(options);
}
const vec = (v: Vec3) => ({x:v[0],y:v[1],z:v[2]});
const tuple = (v: RAPIER.Vector): Vec3 => [v.x,v.y,v.z];
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => a.map((v,i)=>v+(b[i]-v)*k) as Vec3;
/** The mesh origin rotates around the centre. Navigation/support use the
 * sphere's physical bottom, while rendering retains the original quaternion. */
const ballSupport=(b:BallTransform):Vec3=>new Vector3(...b.pos).add(new Vector3(0,BALL_RADIUS,0).applyQuaternion(new Quaternion(...b.rotation))).sub(new Vector3(0,BALL_RADIUS,0)).toArray() as Vec3;
const yard = (p: number[]) => sceneLocationAt(p[0],p.at(-1)!) === 'yard' && p[0] >= -3 && p[0] <= 5 && p.at(-1)! >= -1 && p.at(-1)! <= 6;

/** Conservative ownership: paired/support choreography keeps its entire timeline.
 * This avoids snapping a blocked actor back to authored hug/carry contacts later. */
function rootReason(timeline: Timeline): string | null {
  if (!timeline.segments.length) return 'empty timeline';
  if(timeline.segments.every(({segment})=>segment.cast&&!segment.cast.includes('masha')))return 'Masha is not in this story';
  // Permit the director's spectator acting within the supported ball story;
  // do not opt unrelated indoor/object choreography into yard root control.
  const ballStory=timeline.segments.some(({segment})=>segment.actorClips.masha.some(c=>['drop','put_down','nudge'].includes(c.verb)&&c.params.item==='ball'));
  for (const {segment} of timeline.segments) {
    if (!yard(segment.startState.actors.masha.pos) || segment.startState.actors.masha.posture !== 'stand') return 'outside supported standing yard motion';
    if (ACTOR_IDS.some(id=>segment.actorClips[id].some(c=>c.verb==='carry'||c.verb==='hug'||id!=='masha'&&c.params.target==='masha'&&!(ballStory&&NONCONTACT_VERBS.has(c.verb))))) return 'paired choreography';
    for (const c of segment.actorClips.masha) {
      if(c.verb==='take'&&(c.params.item!=='ball'||c.params.putDown))return 'authored non-ball pickup';
      if(c.verb==='put_down'&&(c.params.item!=='ball'||c.params.putDown!=='bench'))return 'authored non-bench placement';
      if(c.verb==='nudge'&&(c.params.item!=='ball'||c.params.nudgeAt!=='bench'))return 'authored non-bench nudge';
      if (!ROOT_VERBS.has(c.verb) || c.params.sceneCut || c.params.posture && c.params.posture !== 'stand' || ACTOR_IDS.includes(c.params.target as typeof ACTOR_IDS[number])&&!(ballStory&&NONCONTACT_VERBS.has(c.verb))) return `authored choreography: ${c.verb}`;
      if ([c.params.from,c.params.to,...(c.params.path??[])].some(p=>p&&!yard(p))) return 'travel outside the trial yard';
    }
  }
  return null;
}

/** Only Masha's drop/retrieval chain is retargeted. Other transfers keep their
 * complete authored timeline, including its loose props. */
function canSimulateDrops(timeline:Timeline):boolean {
  let released=false;
  const clips=timeline.segments.flatMap(({offset,segment})=>ACTOR_IDS.flatMap(actor=>segment.actorClips[actor].map(clip=>({actor,clip,t:offset+clip.start})))).sort((a,b)=>a.t-b.t);
  for(const {actor,clip} of clips){
    if(clip.verb==='carry'||clip.verb==='hug')return false;
    if(released&&(clip.params.item==='ball'||clip.params.target==='ball')&&!NONCONTACT_VERBS.has(clip.verb)&&!(actor==='masha'&&(['take','drop','put_down','nudge',...MOVE_VERBS].includes(clip.verb))))return false;
    if(actor==='masha'&&clip.verb==='take'&&clip.params.item==='ball')released=false;
    if(actor==='masha'&&(clip.verb==='drop'||clip.verb==='put_down')&&clip.params.item==='ball')released=true;
  }
  return true;
}

class Trajectory {
  readonly view:Timeline;
  readonly world = new RAPIER.World({x:0,y:-9.81,z:0});
  private readonly ground:RAPIER.Collider;
  readonly samples: Sample[] = [];
  readonly drops: Drop[];
  private controller: RAPIER.KinematicCharacterController | null = null;
  private masha: RAPIER.RigidBody | null = null;
  private capsule: RAPIER.Collider | null = null;
  private ball: RAPIER.RigidBody | null = null;
  private ballFromBench=false;
  private groundResistance=false;
  private previous: FrameState;
  private tick = 0;
  private dropIndex = 0;
  private boundaryIndex = 1;
  private verticalSpeed = 0;
  private stride = 1;
  readonly continuity:boolean;
  readonly routes:{start:number;path:Vec2[];target:string|null}[]=[];
  readonly pickups:{start:number;attach:number;position:Vec3}[]=[];
  readonly impulses:BallImpulse[]=[];
  private nudges:{t:number;impulse:Vec3}[]=[];
  private nudgeIndex=0;
  private actions:{t:number;clip:ActorClip;segmentIndex:number}[]=[];
  private actionIndex=0;
  private prepared=false;
  private preparing=false;
  private failure:string|null=null;
  private preparedSegment=-1;
  reason: string | null;
  steps = 0;
  computeMs = 0;

  constructor(source: Timeline, private options: ReplayOptions, canonicalReason: string | null) {
    const view=this.view=structuredClone(source);
    this.ground=createYardColliders(this.world);
    this.world.integrationParameters.numSolverIterations=8;
    this.world.integrationParameters.maxCcdSubsteps=4;
    this.reason = canonicalReason;
    let released=false;
    const requested=view.segments.flatMap(({offset,segment})=>segment.actorClips.masha.map(clip=>({clip,t:offset+clip.start}))).sort((a,b)=>a.t-b.t).some(({clip:c})=>{if(c.params.item==='ball'&&(c.verb==='put_down'||c.verb==='nudge'))return true;if(c.verb==='drop'&&c.params.item==='ball')released=true;return released&&c.verb==='take'&&c.params.item==='ball';});
    const compatible=canSimulateDrops(view);
    if(requested&&!compatible&&!this.reason)this.reason='unsupported ball choreography';
    if(requested&&view.duration>MAX_CONTINUITY_SECONDS&&!this.reason)this.reason=`continuity preparation limit: ${MAX_CONTINUITY_SECONDS}s`;
    this.continuity=!this.reason&&requested;
    this.actions=this.continuity?view.segments.flatMap(({offset,segment},segmentIndex)=>segment.actorClips.masha.map(clip=>({t:offset+clip.start,clip,segmentIndex}))).sort((a,b)=>a.t-b.t):[];
    this.drops = view.duration > MAX_SECONDS || !compatible || requested&&!this.continuity ? [] : view.segments.flatMap(({offset,segment})=>segment.actorClips.masha
      .filter(c=>(c.verb==='drop'||c.verb==='put_down'&&c.params.putDown==='bench')&&c.params.item==='ball')
      .map(c=>({t:offset+c.start+c.dur*.5,bench:c.verb==='put_down',position:c.params.putDownPosition,rotation:c.params.putDownRotation}))).filter(d=>d.t<=view.duration).sort((a,b)=>a.t-b.t);
    this.previous = evaluate(view,0);
    if (!this.reason) {
      const p=this.previous.actors.masha.pos;
      this.masha=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p[0],p[1]+MASHA_CENTER,p[2]));
      this.capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(MASHA_HALF_HEIGHT,MASHA_RADIUS).setCollisionGroups(MASHA_GROUP),this.masha);
      this.controller=this.world.createCharacterController(SKIN);
      this.controller.setSlideEnabled(true);
      // Furniture is an obstacle; don't let Masha auto-step onto the bench/table.
      this.controller.disableAutostep();
      this.controller.enableSnapToGround(.15);
    }
    this.world.timestep=PHYSICS_DT;
    this.world.step(); // Populate the broad phase before the first shape cast.
    if (this.capsule && this.masha) {
      let overlap=false;
      this.world.intersectionsWithShape(this.masha.translation(),this.masha.rotation(),this.capsule.shape,()=>{overlap=true;return false;},undefined,MASHA_GROUP,this.capsule);
      if(overlap){this.reason='initial capsule overlaps furniture';this.world.removeRigidBody(this.masha);this.masha=null;this.capsule=null;if(this.continuity)this.failure=this.reason;}
    }
    this.samples.push(this.snapshot(0));
  }

  /** Reconcile future actions with the canonical simulation result. Scene and
   * attachment times stay authored; movement may borrow a preceding idle.
   * An unreachable/too-short route rejects the whole chain. */
  private prepareActions(t:number):void {
    if(!this.continuity||this.failure||!this.masha)return;
    while(this.actionIndex<this.actions.length&&this.actions[this.actionIndex].t<=t+1e-8){
      const {clip,segmentIndex,t:start}=this.actions[this.actionIndex++],p=this.masha.translation(),from:Vec2=[p.x,p.z];
      const segment=this.view.segments[segmentIndex].segment;
      if(segmentIndex!==this.preparedSegment){
        segment.startState.actors.masha.pos=[...from];
        if(this.preparedSegment>=0)segment.startState.actors.masha.facing=evaluate(this.view,Math.max(0,start-1e-6)).actors.masha.yaw;
        this.preparedSegment=segmentIndex;
      }
      const next=this.actions[this.actionIndex];
      if(clip.verb==='idle'&&this.ball&&next&&next.segmentIndex===segmentIndex&&MOVE_VERBS.has(next.clip.verb)&&next.clip.params.target==='ball'&&Math.abs(next.t-(start+clip.dur))<.002){
        const approach=ballApproach(from,ballSupport(this.snapshot(start).ball!));
        if(approach){
          const speed=next.clip.verb==='run_to'?3.2:next.clip.verb==='tiptoe_to'?.8:1.5;
          const extra=Math.max(0,yardRouteLength(approach.path)/speed+.3-next.clip.dur),borrow=Math.min(extra,Math.max(0,clip.dur-.25));
          if(borrow>0){clip.dur-=borrow;next.clip.start-=borrow;next.clip.dur+=borrow;next.t-=borrow;}
        }
      }
      if(MOVE_VERBS.has(clip.verb)){
        let route:Vec2[]|null=null,arrival:number|undefined;
        if(clip.params.target==='ball'&&this.ball){
          if(!this.ball.isSleeping()){this.failure='ball is not settled at the retrieval approach';return;}
          const b=this.snapshot(start).ball!,approach=ballApproach(from,ballSupport(b));route=approach?.path??null;arrival=approach?.yaw;
        }else{
          const destination=clip.params.to??clip.params.path?.at(-1)??from;
          route=planYardRoute(from,destination);
          // The semantic bench mark is in the seat. Approach its open front;
          // a shorter rear corner would release a carried ball under the table.
          if(!route&&clip.params.target==='bench'&&!yardPointClear(destination))route=planYardRoute(from,[Math.max(1.35,Math.min(2.65,destination[0])),3.52]);
          // A semantic furniture mark may be inside its collider. Reach its
          // nearest free edge instead of trying to stand inside the bench.
          if(!route&&!yardPointClear(destination)){
            let best=Infinity;
            for(const r of [.3,.5,.7,.9,1.1,1.3])for(let i=0;i<24;i++){
              const a=i*Math.PI*2/24,candidate:Vec2=[destination[0]+Math.sin(a)*r,destination[1]+Math.cos(a)*r],path=planYardRoute(from,candidate);
              if(!path)continue;const cost=r*6+yardRouteLength(path);if(cost<best){best=cost;route=path;}
            }
          }
        }
        if(!route){this.failure='no clear yard route to the next action';return;}
        const maxSpeed=clip.verb==='run_to'?3.8:clip.verb==='tiptoe_to'?1.0:1.9;
        if(yardRouteLength(route)>Math.max(.1,clip.dur-.2)*maxSpeed){this.failure='authored movement is too short for the safe route';return;}
        clip.params={...clip.params,from:[...from],to:[...route.at(-1)!],path:route,...(arrival!==undefined?{arrivalYaw:arrival}:{})};
        this.routes.push({start,path:route.map(p=>[...p]),target:clip.params.target??null});
      }else if(clip.verb==='look_at'&&next?.clip.verb==='take'&&next.clip.params.item==='ball'&&this.ball){
        const support=ballSupport(this.snapshot(start).ball!);
        clip.params={...clip.params,facing:Math.atan2(support[0]-from[0],support[2]-from[1]),lookAt:support};
      }else if(clip.verb==='take'&&clip.params.item==='ball'&&this.ball){
        const b=this.snapshot(start).ball!,support=ballSupport(b),distance=Math.hypot(from[0]-support[0],from[1]-support[2]);
        if(support[1]<-.02||support[1]>.16||distance>.39||!this.ball.isSleeping()){this.failure='ball pickup has no reachable settled contact';return;}
        const e=new Euler().setFromQuaternion(new Quaternion(...b.rotation),'YXZ');
        clip.params={...clip.params,from:[...from],facing:Math.atan2(support[0]-from[0],support[2]-from[1]),lookAt:support,pickUpAt:'clearing',pickUpPosition:[...b.pos],pickUpRotation:[e.x,e.y,e.z]};
        this.pickups.push({start,attach:start+clip.dur*.5,position:[...b.pos]});
      }else if(clip.verb==='put_down'&&clip.params.item==='ball'){
        const at=clip.params.putDownPosition;
        if(!at||Math.abs(at[1]-BENCH_TOP)>.005||at[0]<1.31||at[0]>2.69||Math.abs(at[2]-3)>.14||Math.hypot(at[0]-from[0],at[2]-from[1])>.7){this.failure='bench placement has no reachable support';return;}
      }else if(clip.verb==='nudge'&&clip.params.item==='ball'){
        if(!this.ball){this.failure='bench nudge has no physical ball';return;}
        const b=this.snapshot(start).ball!,support=ballSupport(b),v=this.ball.linvel(),w=this.ball.angvel();
        if(Math.abs(support[1]-BENCH_TOP)>.015||support[0]<1.30||support[0]>2.70||Math.abs(support[2]-3)>.14||Math.hypot(v.x,v.y,v.z)>.04||Math.hypot(w.x,w.y,w.z)>.1||Math.hypot(from[0]-support[0],from[1]-support[2])>.7){this.failure='bench nudge has no reachable resting contact';return;}
        const impulse=clip.params.nudgeImpulse??DEFAULT_BENCH_IMPULSE;
        // This bounded action rolls left along the seat. An arbitrary impulse
        // would need its own contact pose and a new supported retrieval region.
        if(impulse.some(v=>!Number.isFinite(v))||impulse[0]>-.4||impulse[0]<-1.2||impulse[1]!==0||impulse[2]!==0){this.failure='unsupported bench nudge direction';return;}
        const e=new Euler().setFromQuaternion(new Quaternion(...b.rotation),'YXZ');
        clip.params={...clip.params,from:[...from],lookAt:[support[0],support[1]+BALL_RADIUS,support[2]],nudgePosition:[...b.pos],nudgeRotation:[e.x,e.y,e.z]};
        this.nudges.push({t:start+clip.dur*.5,impulse:[...impulse]});
      }
    }
  }

  frame(view:Timeline,t:number):FrameState {
    const corrected={segments:this.view.segments.slice(0,view.segments.length),duration:view.duration};
    return evaluate(corrected,t);
  }

  /** A failed atomic chain is terminal even though its original release list
   * is nonempty and its partial trajectory never reached the story endpoint. */
  get warmingComplete():boolean {
    return this.failure!==null||this.reason!==null&&this.drops.length===0||this.samples.at(-1)!.t>=this.view.duration;
  }
  get failed():boolean {return this.failure!==null;}

  private snapshot(t:number): Sample {
    let ball:BallTransform|null=null;
    if(this.ball){
      const q=this.ball.rotation(),rotation:Quat=[q.x,q.y,q.z,q.w];
      // Render origin is the base, while the rigid body rotates about the sphere centre.
      const origin=new Vector3(...tuple(this.ball.translation())).sub(new Vector3(0,BALL_RADIUS,0).applyQuaternion(new Quaternion(...rotation)));
      ball={pos:origin.toArray() as Vec3,rotation};
    }
    const p=this.masha?.translation();
    return {t,root:p?[p.x,p.y-MASHA_CENTER,p.z]:null,grounded:this.controller?.computedGrounded()??false,stride:this.stride,ball,sleeping:this.ball?.isSleeping()??false};
  }

  private step(t:number):void {
    const prior=this.samples.at(-1)!,dt=t-prior.t;
    this.prepareActions(t);
    const frame=evaluate(this.view,t);
    if(this.masha&&this.capsule&&this.controller){
      const p=this.masha.translation(),a=frame.actors.masha.pos,b=this.previous.actors.masha.pos;
      this.verticalSpeed=Math.max(-20,this.verticalSpeed-9.81*dt);
      const wanted={x:a[0]-(this.continuity?p.x:b[0]),y:this.verticalSpeed*dt,z:a[2]-(this.continuity?p.z:b[2])};
      this.controller.computeColliderMovement(this.capsule,wanted,undefined,MASHA_GROUP);
      const move=this.controller.computedMovement();
      if(this.controller.computedGrounded())this.verticalSpeed=0;
      // The bounded yard has a known y=0 ground collider. Clamp numerical
      // KCC penetration at its broad, flat centre (a zero-motion GJK edge case).
      const y=Math.max(MASHA_CENTER,p.y+move.y);
      if(y<=MASHA_CENTER+SKIN)this.verticalSpeed=0;
      this.masha.setNextKinematicTranslation({x:p.x+move.x,y,z:p.z+move.z});
      const distance=Math.hypot(wanted.x,wanted.z);
      const ratio=distance>1e-6?Math.min(1,Math.hypot(move.x,move.z)/distance):1;
      this.stride += (ratio-this.stride)*Math.min(1,dt*18);
    }
    this.world.timestep=dt;
    this.world.step();this.steps++;
    // A rubber ball rolls freely on the wooden seat, then loses energy much
    // faster on grass. Rapier's contact friction alone does not supply rolling
    // resistance. Change damping only after the first actual ground contact;
    // the solver still owns every position, rebound and final resting point.
    if(this.ball&&this.ballFromBench&&!this.groundResistance&&this.ball.translation().y<=BALL_RADIUS+.02){
      let touching=false;
      this.world.contactPair(this.ball.collider(0),this.ground,m=>{for(let i=0;i<m.numContacts();i++)if(m.contactImpulse(i)>0)touching=true;});
      if(touching){this.ball.setLinearDamping(2);this.ball.setAngularDamping(3);this.groundResistance=true;}
    }
    // Keep the left side of a boundary for a moment preview that ends before
    // the next scene takes ownership. Full-story playback uses its right side.
    const handoff=!!this.ball&&(!!frame.props.ball.attachedTo||!frame.props.ball.visible);
    const ballBefore=handoff?this.snapshot(t).ball:undefined;
    if(handoff&&this.ball){this.world.removeRigidBody(this.ball);this.ball=null;}
    if(this.dropIndex<this.drops.length&&Math.abs(t-this.drops[this.dropIndex].t)<1e-7){
      const release=this.drops[this.dropIndex++];
      const held=evaluate(this.view,Math.max(0,t-1e-7));
      if(held.props.ball.attachedTo==='masha'&&yard(held.actors.masha.pos)){
        const p=this.masha?.translation();
        if(p)held.actors.masha={...held.actors.masha,pos:[p.x,p.y-MASHA_CENTER,p.z],physicsRoot:true};
        const transform=this.options.sampleBall(held),q=new Quaternion(...transform.rotation);
        const centre=new Vector3(...transform.pos).add(new Vector3(0,BALL_RADIUS,0).applyQuaternion(q));
        if(release.bench){
          const expectedQ=new Quaternion().setFromEuler(new Euler(...(release.rotation??[0,0,0] as Vec3),'YXZ'));
          const expected=release.position?new Vector3(...release.position).add(new Vector3(0,BALL_RADIUS,0).applyQuaternion(expectedQ)):null;
          // A sphere may overhang the seat: its bottom contact must stay on the
          // flat top, rather than requiring the whole diameter to fit. The
          // loaded hand must nevertheless reach the intended centre within12mm.
          if(!expected||centre.distanceTo(expected)>.012||Math.abs(centre.y-BALL_RADIUS-BENCH_TOP)>.012||centre.x<1.30||centre.x>2.70||Math.abs(centre.z-3)>.14){this.failure='held ball does not reach the bench surface';return;}
        }
        if(this.ball)this.world.removeRigidBody(this.ball);
        this.ballFromBench=release.bench;this.groundResistance=false;
        this.ball=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(centre.x,centre.y,centre.z).setRotation(q).setCcdEnabled(true).setLinearDamping(.35).setAngularDamping(.6));
        this.world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS).setContactSkin(release.bench?.003:0).setCollisionGroups(BALL_GROUP).setRestitution(release.bench?.3:.5).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFriction(.8).setDensity(100),this.ball);
      }
    }
    const nudge=this.nudges[this.nudgeIndex];
    if(nudge&&Math.abs(t-nudge.t)<1e-7){
      this.nudgeIndex++;
      if(!this.ball){this.failure='bench ball disappeared before the nudge';return;}
      const p=this.ball.translation();
      // Match the visible near/right palm contact at the push midpoint.
      this.ball.applyImpulseAtPoint(vec(nudge.impulse),{x:p.x+.075,y:p.y+.025,z:p.z+.127},true);
      this.impulses.push({time:t,position:tuple(p),impulse:[...nudge.impulse]});
    }
    this.previous=frame;
    this.samples.push({...this.snapshot(t),...(ballBefore!==undefined?{ballBefore}:{})});
  }

  sample(time:number, side: 'left'|'right' = 'right'):Sample {
    // Validate a continuity chain atomically before exposing frames: a failed
    // late pickup must not change earlier ownership depending on seek order.
    if(this.continuity&&!this.prepared&&!this.preparing){this.preparing=true;this.sample(this.view.duration);this.preparing=false;this.prepared=true;if(this.failure)this.reason=`continuity fallback: ${this.failure}`;}
    const t=Math.max(0,Math.min(time,this.view.duration));
    if(this.failure)return {...this.samples[0],t,root:null,ball:null};
    if(this.reason&&this.drops.length===0)return {...this.samples[0],t};
    const start=performance.now();
    while(this.samples.at(-1)!.t<t-1e-9){
      const last=this.samples.at(-1)!.t;
      while((this.tick+1)*PHYSICS_DT<=last+1e-9)this.tick++;
      const drop=this.drops[this.dropIndex]?.t??Infinity;
      while(this.boundaryIndex<this.view.segments.length&&this.view.segments[this.boundaryIndex].offset<=last+1e-9)this.boundaryIndex++;
      const boundary=this.view.segments[this.boundaryIndex]?.offset??Infinity;
      while(!this.failure&&this.actionIndex<this.actions.length&&this.actions[this.actionIndex].t<=last+1e-9)this.prepareActions(last);
      if(this.failure)break;
      const action=this.actions[this.actionIndex]?.t??Infinity;
      const nudge=this.nudges[this.nudgeIndex]?.t??Infinity;
      const attachments=this.pickups.map(p=>p.attach).filter(t=>t>last+1e-9);
      const next=Math.min((this.tick+1)*PHYSICS_DT,drop,boundary,action,nudge,...attachments,this.view.duration);
      if(next<=last+1e-9){this.dropIndex++;continue;}
      this.step(next);
    }
    this.computeMs+=performance.now()-start;
    let lo=0,hi=this.samples.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(this.samples[mid].t<=t+1e-9)lo=mid;else hi=mid-1;}
    const a=this.samples[lo],b=this.samples[Math.min(lo+1,this.samples.length-1)],k=b.t>a.t&&Math.abs(t-a.t)>1e-9?Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))):0;
    const rightBall=b.ballBefore===undefined?b.ball:b.ballBefore;
    const ball=side==='left'&&Math.abs(t-a.t)<1e-8&&a.ballBefore!==undefined?a.ballBefore:
      a.ball&&rightBall?{pos:mix(a.ball.pos,rightBall.pos,k),rotation:qslerp(a.ball.rotation,rightBall.rotation,k)}:a.ball;
    return {...a,t,root:a.root&&b.root?mix(a.root,b.root,k):a.root,stride:a.stride+(b.stride-a.stride)*k,ball};
  }
  dispose():void {this.world.free();}
}

/** Cache the simulated trajectory, never the render clock. Old samples are read
 * directly; the frontier world only ever advances. Previews share this canonical trajectory. */
export class RapierReplay implements PlaybackEvaluator {
  private warmTimer:ReturnType<typeof setTimeout>|undefined;
  private fingerprint='';
  private timeline:Timeline={segments:[],duration:0};
  private cache:Trajectory|undefined;
  revision=0;
  constructor(private options:ReplayOptions){}
  setTimeline(timeline:Timeline):void {
    const key=JSON.stringify(timeline);
    if(key===this.fingerprint)return;
    this.dispose();this.fingerprint=key;this.timeline=JSON.parse(key);this.revision++;
    if(this.options.background)this.warmTimer=setTimeout(()=>this.warm(),0);
  }
  private warm():void {
    this.warmTimer=undefined;
    const c=this.trajectory();if(c.warmingComplete)return;
    const until=performance.now()+4;
    while(!c.warmingComplete&&performance.now()<until){
      const before=c.samples.at(-1)!.t;
      c.sample(Math.min(this.timeline.duration,before+PHYSICS_DT*2));
      // Do not spin or reschedule if a terminal fallback (or any other
      // no-progress condition) left the frontier behind the requested time.
      if(c.warmingComplete||c.samples.at(-1)!.t<=before+1e-9)return;
    }
    if(!c.warmingComplete)this.warmTimer=setTimeout(()=>this.warm(),16);
  }
  private trajectory():Trajectory {
    return this.cache??=new Trajectory(this.timeline,this.options,this.timeline.duration>MAX_SECONDS?`trial limit: ${MAX_SECONDS}s`:rootReason(this.timeline));
  }
  private sample(view:Timeline,t:number):Sample {
    const at=Math.max(0,Math.min(t,view.duration));
    const last=view.segments.at(-1);
    const left=view.segments.length<this.timeline.segments.length&&at===view.duration&&last&&Math.abs(last.offset+last.segment.duration-at)<1e-7;
    return this.trajectory().sample(at,left?'left':'right');
  }
  evaluate(view:Timeline,t:number):FrameState {
    const s=this.sample(view,t),trajectory=this.trajectory();
    const frame=trajectory.continuity&&!trajectory.reason?trajectory.frame(view,t):evaluate(view,t);
    if(s.root){
      const actor:ActorFrame={...frame.actors.masha,pos:s.root,physicsRoot:true};
      // Damp the existing gait as actual motion stops. Do not invent a new pose system.
      if(MOVE_VERBS.has(actor.verb)&&s.stride<.999){
        actor.bones={...actor.bones};
        for(const name of ['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'])
          if(actor.bones[name])actor.bones[name]=qslerp([0,0,0,1],actor.bones[name],s.stride);
        actor.hipsOffset=actor.hipsOffset.map(v=>v*s.stride) as Vec3;
      }
      frame.actors={...frame.actors,masha:actor};
    }
    if(s.ball&&!frame.props.ball.attachedTo&&frame.props.ball.visible)frame.props={...frame.props,ball:{visible:true,attachedTo:null,...s.ball}};
    return frame;
  }
  inspect(view:Timeline,t:number){const c=this.trajectory(),s=this.sample(view,t);return {...s,reason:c.reason,steps:c.steps,computeMs:c.computeMs,samples:c.samples.length,caches:1,revision:this.revision,continuity:c.continuity,routes:c.routes,pickups:c.pickups,impulses:c.impulses};}
  /** Finish the one canonical trajectory before publishing it to the reader.
   * sampleBall may throw a worker pose request; the caller then starts a fresh
   * cache with that pose supplied, never resumes a half-applied world step. */
  preparedData():PreparedReplayData {
    const c=this.trajectory();c.sample(this.timeline.duration);
    return {source:this.timeline,view:c.view,samples:c.samples,reason:c.reason,failure:c.failed,continuity:c.continuity,dropsCount:c.drops.length,routes:c.routes,pickups:c.pickups,impulses:c.impulses,steps:c.steps,computeMs:c.computeMs,revision:this.revision};
  }
  dispose():void {if(this.warmTimer!==undefined)clearTimeout(this.warmTimer);this.warmTimer=undefined;this.cache?.dispose();this.cache=undefined;}
}
