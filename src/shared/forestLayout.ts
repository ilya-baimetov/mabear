import type {Vec2} from './schema';
import {pondRadius} from './pond';

export type ForestLocation = 'pond' | 'wolves';
export type ForestNatureId = 'Pine_2'|'Pine_3'|'Pine_5'|'CommonTree_4'|'BirchTree_1'|'BirchTree_3'|'Bush_Common'|'Fern_1';
export interface ForestSpot {x:number;y:number;z:number;height:number;yaw:number;tint?:number}
export interface SceneryOccluder {c:Vec2;r:number;h:number;y?:number}
export const FOREST_GROUND_SEGMENTS=70;

export function forestHeightAt(kind:ForestLocation,x:number,z:number):number {
  const cx=kind==='pond'?-8:14,cz=kind==='pond'?10:-1;
  return -.025+Math.max(0,Math.hypot(x-cx,z-cz)-10)*(.035+.022*Math.sin(x*.3+z*.18))+(kind==='wolves'?Math.max(0,cz-z-5)*.09:0);
}
function random(seed:number):()=>number {
  let a=seed>>>0;
  return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}

/** One layout for rendering and camera planning. Preserve the original seed and
 * ground-colour draws so extracting the layout does not move a single plant. */
export function forestNatureLayout(kind:ForestLocation,waterRadius:(a:number)=>number=pondRadius):Partial<Record<ForestNatureId,ForestSpot[]>> {
  const r=random(kind==='pond'?915:1015),cx=kind==='pond'?-8:14,cz=kind==='pond'?10:-1;
  for(let i=0;i<(FOREST_GROUND_SEGMENTS+1)**2;i++)r();
  const spots:Partial<Record<ForestNatureId,ForestSpot[]>>={};
  const add=(id:ForestNatureId,spot:Omit<ForestSpot,'y'>)=>(spots[id]??=[]).push({...spot,y:forestHeightAt(kind,spot.x,spot.z)+.025});
  for(let i=0;i<(kind==='pond'?95:52);i++){
    const a=r()*Math.PI*2,rad=9+Math.sqrt(r())*29,x=cx+Math.cos(a)*rad,z=cz+Math.sin(a)*rad;
    if(rad<19&&((kind==='pond'&&x>cx+2&&z>cz-5)||(kind==='wolves'&&z>cz+1&&x<cx+9)))continue;
    const id:ForestNatureId=kind==='wolves'?(i%3===0?'Pine_5':i%2?'Pine_2':'Pine_3'):i%5===0?'Pine_2':i%3===0?'CommonTree_4':i%2?'BirchTree_1':'BirchTree_3';
    add(id,{x,z,height:7+r()*4.5,yaw:r()*6.28,tint:.89+r()*.16});
  }
  for(let i=0;i<(kind==='pond'?115:32);i++){
    const a=r()*Math.PI*2,rad=kind==='pond'?5.1+r()*10:4.8+r()*10;
    const x=cx+Math.cos(a)*rad,z=cz+Math.sin(a)*rad;
    if(kind==='pond'&&rad<waterRadius(a)+.5)continue;
    if(kind==='pond'&&x>-6.5&&x<1.8&&z<9&&z>-3)continue;
    if(kind==='wolves'&&x>10.5&&x<16.7&&z>-4&&z<5)continue;
    add('Bush_Common',{x,z,height:.65+r()*(kind==='pond'?1.1:1.5),yaw:r()*6,tint:.94+r()*.14});
    if(i%4===0)add('Fern_1',{x:x+.7,z:z+.4,height:.6+r()*.45,yaw:r()*6});
  }
  if(kind==='pond'){
    for(let i=0;i<18;i++){
      const a=Math.PI*.82+i/18*Math.PI*1.12,rad=7.4+(i%3)*1.2;
      add(i%3===0?'CommonTree_4':'BirchTree_1',{x:cx+Math.cos(a)*rad,z:cz+Math.sin(a)*rad,height:8.5+(i%4)*.7,yaw:i*1.7,tint:.95});
    }
  }else{
    add('Pine_2',{x:9.5,z:-5.6,height:11.5,yaw:1.2});
    add('Pine_3',{x:19,z:-2.5,height:10.8,yaw:2});
  }
  return spots;
}

/** Conservative solid-body proxies; leaves high above actors are not treated as
 * full-height canopy cylinders. These protect sight lines, not navigation. */
export function forestCameraOccluders(kind:ForestLocation):SceneryOccluder[] {
  return Object.entries(forestNatureLayout(kind)).flatMap(([id,spots])=>id==='Fern_1'?[]:spots.map(spot=>({
    c:[spot.x,spot.z] as Vec2,y:spot.y,h:spot.height,
    r:spot.height*(id==='Bush_Common'?.58:id==='CommonTree_4'?.065:id.startsWith('Birch')?.032:.045),
  })));
}
