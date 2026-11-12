import type {Vec3} from './schema';
type Q=[number,number,number,number];
export const CARRY_LIFT_ARC=1.15;
export const carryLiftProgress=(time:number,duration:number)=>{const v=Math.max(0,Math.min(1,(time/duration-.3)/.3));return v<.5?2*v*v:1-(-2*v+2)**2/2;};
export function carryLiftRootHeight(k:number,seat:number){return seat*k+Math.sin(k*Math.PI)*CARRY_LIFT_ARC;}
/** Framing estimate from the same lift path; includes the shipped head mesh. */
export function carryLiftHeadHeight(time:number,duration:number){
 const u=time/duration,k=carryLiftProgress(time,duration),smooth=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
 const nape=1.30+.70*smooth((u-.4)/.15),raw=carryLiftRootHeight(k,nape)+.75*(1-k)+.32*k,fit=smooth((k-.8)/.2);
 return raw*(1-fit)+2.32*fit;
}
const mul=(a:Q,b:Q):Q=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate=(q:Q,p:Vec3):Vec3=>{const r=mul(mul(q,[...p,0]),[-q[0],-q[1],-q[2],q[3]]);return[r[0],r[1],r[2]];};
/** Measured normalized Bear spine lengths. Used by pure playback to follow the
 * moving shoulders; the renderer fits the final seat to the visible surface. */
export function carrySeatRoot(bear:{pos:Vec3;yaw:number;hipsOffset:Vec3;bones:Record<string,Q>}):Vec3{
 let q:Q=bear.bones.Hips??[0,0,0,1],p:Vec3=[bear.hipsOffset[0],.817895+bear.hipsOffset[1],bear.hipsOffset[2]];
 for(const [name,length]of [['Spine',.269],['Spine1',.269],['Spine2',.278],['Neck',.253]] as const){const v=rotate(q,[0,length,0]);p=[p[0]+v[0],p[1]+v[1],p[2]+v[2]];if(name!=='Neck')q=mul(q,bear.bones[name]??[0,0,0,1]);}
 const back=rotate(q,[0,.12,-.16]);p=[p[0]+back[0],p[1]+back[1],p[2]+back[2]];
 const c=Math.cos(bear.yaw),s=Math.sin(bear.yaw);return[bear.pos[0]+p[0]*c+p[2]*s,bear.pos[1]+p[1],bear.pos[2]-p[0]*s+p[2]*c];
}
