/** Shared rendered shoreline and locomotion boundary, in world metres. */
export const POND_CENTER:readonly[number,number]=[-8,10];
export const POND_PIER_START:readonly[number,number]=[-4.6,7.2];
export function pondRadius(theta:number):number{
  const d=Math.atan2(Math.sin(theta+Math.PI/4),Math.cos(theta+Math.PI/4));
  const deg=d*180/Math.PI,farBank=Math.max(0,Math.cos(theta+Math.PI*.78));
  return 3.55+3.4*farBank**2-Math.exp(-(deg*deg)/200)+.26*Math.sin(theta*3+1)+.13*Math.sin(theta*7);
}
export function pondWaterAt(x:number,z:number,pad=0):boolean{
  const dx=x-POND_CENTER[0],dz=z-POND_CENTER[1];
  return Math.hypot(dx,dz)<pondRadius(Math.atan2(dz,dx))+pad;
}
/** The existing pier is a legal dry route through the water collider. */
export function pondPierAt(x:number,z:number,pad=0):boolean{
  const norm=Math.hypot(-1,2.6),dx=-1/norm,dz=2.6/norm;
  const x0=x-POND_PIER_START[0],z0=z-POND_PIER_START[1];
  const along=x0*dx+z0*dz,across=x0*dz-z0*dx;
  return Math.abs(across)<.66+pad&&along>-.55-pad&&along<3.15+pad;
}
export function pondBlocksWalk(x:number,z:number):boolean{return pondWaterAt(x,z)&&!pondPierAt(x,z);}
