import type {Vec2,Vec3} from '../../shared/schema';
import {COOKING_STATION} from '../../shared/cookingStation';
import {MASHA_RADIUS,SKIN} from './yardColliders';

// Same conservative furniture silhouettes as createYardColliders. Inflate by
// the character capsule, then leave a small route-following clearance.
const margin=MASHA_RADIUS+SKIN+.08;
// Bench interactions need a reachable near edge. Keep 3cm beyond the capsule
// and skin here; the taller table/helper retain the broader walking clearance.
const benchMargin=MASHA_RADIUS+SKIN+.03;
type Box={min:Vec2;max:Vec2};
const s=COOKING_STATION;
const boxes:Box[]=[
 {min:[2-.85-benchMargin,3-.19-benchMargin],max:[2+.85+benchMargin,3+.19+benchMargin]},
 {min:[s.position[0]-s.width/2-margin,s.stepBack-margin],max:[s.position[0]+s.width/2+margin,s.topFront+margin]},
];
const circle={center:[2,1.5] as Vec2,radius:.75+margin};
// Float32 translations and the KCC's small contact corrections can put a
// stopped actor a fraction of a millimetre inside the inflated route boundary.
// This tolerance is well below the additional 8cm planning clearance.
const epsilon=.001;
const dist=(a:Vec2,b:Vec2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function pointSegment(p:Vec2,a:Vec2,b:Vec2){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,k=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-dx*k,p[1]-a[1]-dz*k);}
export function yardPointClear(p:Vec2){return p[0]>=-3&&p[0]<=5&&p[1]>=-1&&p[1]<=6&&dist(p,circle.center)>=circle.radius-epsilon&&boxes.every(b=>p[0]<=b.min[0]+epsilon||p[0]>=b.max[0]-epsilon||p[1]<=b.min[1]+epsilon||p[1]>=b.max[1]-epsilon);}
export function yardSegmentClear(a:Vec2,b:Vec2){
 if(!yardPointClear(a)||!yardPointClear(b)||pointSegment(circle.center,a,b)<circle.radius-epsilon)return false;
 for(const box of boxes){
  let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){
   const d=b[axis]-a[axis];
   if(Math.abs(d)<1e-10){if(a[axis]<=box.min[axis]+epsilon||a[axis]>=box.max[axis]-epsilon){hi=-1;break;}continue;}
   let x=(box.min[axis]+epsilon-a[axis])/d,y=(box.max[axis]-epsilon-a[axis])/d;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);
  }
  if(lo<hi-1e-8&&hi>0&&lo<1)return false;
 }
 return true;
}
export function yardRouteLength(path:Vec2[]){return path.slice(1).reduce((sum,p,i)=>sum+dist(path[i],p),0);}

/** A small deterministic visibility graph, not general navigation or mesh physics. */
export function planYardRoute(from:Vec2,to:Vec2):Vec2[]|null {
 if(!yardPointClear(from)||!yardPointClear(to))return null;
 if(yardSegmentClear(from,to))return [[...from],[...to]];
 const nodes:Vec2[]=[[...from],[...to]];
 for(const box of boxes)for(const x of [box.min[0]-.025,box.max[0]+.025])for(const z of [box.min[1]-.025,box.max[1]+.025])if(yardPointClear([x,z]))nodes.push([x,z]);
 const n=16,r=circle.radius/Math.cos(Math.PI/n)+.025;
 for(let i=0;i<n;i++){const p:Vec2=[circle.center[0]+Math.sin(i*Math.PI*2/n)*r,circle.center[1]+Math.cos(i*Math.PI*2/n)*r];if(yardPointClear(p))nodes.push(p);}
 const costs=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=nodes.map(()=>false);costs[0]=0;
 for(;;){let u=-1;for(let i=0;i<nodes.length;i++)if(!visited[i]&&costs[i]<Infinity&&(u<0||costs[i]<costs[u]))u=i;
  if(u<0||u===1)break;visited[u]=true;
  for(let v=0;v<nodes.length;v++)if(!visited[v]&&yardSegmentClear(nodes[u],nodes[v])){const d=costs[u]+dist(nodes[u],nodes[v]);if(d<costs[v]-1e-9){costs[v]=d;prev[v]=u;}}
 }
 if(prev[1]<0)return null;
 const path:Vec2[]=[];for(let i=1;i>=0;i=prev[i])path.unshift(nodes[i]);return path;
}

/** Reach the actual ball from a free side; don't walk onto its support. */
export function ballApproach(from:Vec2,ball:Vec3):{path:Vec2[];yaw:number}|null {
 if(ball[1]<-.02||ball[1]>.16)return null; // ground retrieval only in this bounded step
 const angle=Math.atan2(from[0]-ball[0],from[1]-ball[2]);
 let best:{path:Vec2[];yaw:number;cost:number}|null=null;
 for(let i=0;i<24;i++){
  const a=angle+i*Math.PI*2/24,goal:Vec2=[ball[0]+Math.sin(a)*.23,ball[2]+Math.cos(a)*.23],path=planYardRoute(from,goal);
  if(!path)continue;const cost=yardRouteLength(path)+i*.00001;
  if(!best||cost<best.cost)best={path,yaw:Math.atan2(ball[0]-goal[0],ball[2]-goal[1]),cost};
 }
 return best;
}
