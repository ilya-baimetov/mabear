import * as THREE from 'three';
import type {ActorFrame} from '../api';
import {EMOTION_PRESETS,mouthShapeFor,type MouthShape} from './face';
import {emotionWeights} from '../motion/emotion';
import { clamp, lerp as mix, smooth } from '../../shared/math';

// A local retopology pass over the generated model: replace the closed facial
// surface with continuous skin rings, real eye openings and a recessed mouth.
// All authoring coordinates are metres in the normalized bind-pose actor space.
type Point={p:THREE.Vector3;uv:THREE.Vector2;index?:number};
type Region={cx:number;cy:number;rx:number;ry:number};
type Ring={mesh:THREE.Mesh;angles:number[];update:(inner:(angle:number)=>THREE.Vector3)=>void};
const key=(p:THREE.Vector3)=>`${Math.round(p.x*1e5)},${Math.round(p.y*1e5)},${Math.round(p.z*1e5)}`;
const cellKey=(x:number,y:number)=>((x&0xffff)<<16)|(y&0xffff);
const _sampleP=new THREE.Vector3(),_sampleUv=new THREE.Vector2();
const _lineUpper=new THREE.Vector3(),_lineLower=new THREE.Vector3();
const _ringDelta=new THREE.Vector3(),_ringEdge=new THREE.Vector3();

function bindPoints(mesh:THREE.SkinnedMesh):Point[]{
 const pos=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
 const cached=mesh.userData.bindWorldPositions as Float64Array|Float32Array|undefined;
 return Array.from({length:pos.count},(_,i)=>({
  p:cached?new THREE.Vector3(cached[i*3],cached[i*3+1],cached[i*3+2]):mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),
  uv:new THREE.Vector2(uv.getX(i),uv.getY(i)),
  index:i,
 }));
}

/** Project normalized xy onto the original textured surface. A small spatial
 * index avoids raycasting the entire character for every retopology vertex. */
function surfaceSampler(points:Point[],indices:number[]){
 const cells=new Map<number,number[]>(),step=.008;
 for(let n=0;n<indices.length;n+=3){
  const p0=points[indices[n]].p,p1=points[indices[n+1]].p,p2=points[indices[n+2]].p;
  if(p0.z<.09||p1.z<.09||p2.z<.09)continue;
  const minPx=Math.min(p0.x,p1.x,p2.x),maxPx=Math.max(p0.x,p1.x,p2.x),minPy=Math.min(p0.y,p1.y,p2.y),maxPy=Math.max(p0.y,p1.y,p2.y);
  if(maxPy<.58||minPy>.84||minPx>.15||maxPx<-.15)continue;
  const minX=Math.floor(minPx/step),maxX=Math.floor(maxPx/step),minY=Math.floor(minPy/step),maxY=Math.floor(maxPy/step);
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const k=cellKey(x,y);let a=cells.get(k);if(!a){a=[];cells.set(k,a);}a.push(n);}
 }
 const sampleAt=(x:number,y:number,outP:THREE.Vector3,outUv:THREE.Vector2)=>{
  const cx=Math.floor(x/step),cy=Math.floor(y/step),cell=cells.get(cellKey(cx,cy));
  let bestZ=-Infinity,found=false;
  if(cell)for(let i=0;i<cell.length;i++){
   const n=cell[i],a=points[indices[n]],b=points[indices[n+1]],c=points[indices[n+2]];
   const den=(b.p.y-c.p.y)*(a.p.x-c.p.x)+(c.p.x-b.p.x)*(a.p.y-c.p.y);if(Math.abs(den)<1e-12)continue;
   const u=((b.p.y-c.p.y)*(x-c.p.x)+(c.p.x-b.p.x)*(y-c.p.y))/den,v=((c.p.y-a.p.y)*(x-c.p.x)+(a.p.x-c.p.x)*(y-c.p.y))/den,w=1-u-v;
   if(u<-.0001||v<-.0001||w<-.0001)continue;
   const z=a.p.z*u+b.p.z*v+c.p.z*w;
   if(!found||z>bestZ){
    found=true;bestZ=z;
    outUv.set(a.uv.x*u+b.uv.x*v+c.uv.x*w,a.uv.y*u+b.uv.y*v+c.uv.y*w);
   }
  }
  if(found){outP.set(x,y,bestZ);return;}
  let nearest=points[0],d=Infinity;
  for(let ox=-2;ox<=2;ox++)for(let oy=-2;oy<=2;oy++){
   const neighbor=cells.get(cellKey(cx+ox,cy+oy));
   if(!neighbor)continue;
   for(let i=0;i<neighbor.length;i++){
    const n=neighbor[i];
    for(let j=0;j<3;j++){const point=points[indices[n+j]];if(point.p.z<.09)continue;const e=(point.p.x-x)**2+(point.p.y-y)**2;if(e<d){d=e;nearest=point;}}
   }
  }
  outP.set(x,y,nearest.p.z);outUv.copy(nearest.uv);
 };
 const fn=(x:number,y:number):Point=>{
  const p=new THREE.Vector3(),uv=new THREE.Vector2();
  sampleAt(x,y,p,uv);
  return {p,uv};
 };
 fn.uv=(x:number,y:number,outUv:THREE.Vector2)=>{
  sampleAt(x,y,_sampleP,outUv);
  return outUv;
 };
 return fn;
}

function cutRegion(mesh:THREE.SkinnedMesh,points:Point[],keys:string[],r:Region,contains?:(x:number,y:number)=>boolean):Point[]{
 const old=Array.from(mesh.geometry.index!.array),kept:number[][]=[],edges=new Map<string,{a:number;b:number;count:number}>();
 const edgeKey=(a:number,b:number)=>keys[a]<keys[b]?`${keys[a]}|${keys[b]}`:`${keys[b]}|${keys[a]}`;
 const candidates:number[][]=[],outside:number[][]=[];
 for(let n=0;n<old.length;n+=3){
  const i0=old[n],i1=old[n+1],i2=old[n+2],p0=points[i0].p,p1=points[i1].p,p2=points[i2].p;
  const x=(p0.x+p1.x+p2.x)/3,y=(p0.y+p1.y+p2.y)/3;
  const inside=p0.z>.09&&p1.z>.09&&p2.z>.09&&(contains?contains(x,y):((x-r.cx)/r.rx)**2+((y-r.cy)/r.ry)**2<1);
  (inside?candidates:outside).push([i0,i1,i2]);
 }
 // Cut only the connected facial surface, not nearby disconnected lashes or
 // hair slivers that happen to project into the same 2D region.
 const parent=candidates.map((_,i)=>i),owner=new Map<string,number>();
 const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 candidates.forEach((ids,i)=>ids.forEach(id=>{const k=keys[id],prior=owner.get(k);if(prior!==undefined)parent[find(i)]=find(prior);else owner.set(k,i);}));
 const groups=new Map<number,number>();candidates.forEach((_,i)=>groups.set(find(i),(groups.get(find(i))??0)+1));
 const primary=[...groups].sort((a,b)=>b[1]-a[1])[0]?.[0];
 kept.push(...outside);
 for(let i=0;i<candidates.length;i++){
  const ids=candidates[i];if(find(i)!==primary){kept.push(ids);continue;}
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],k=edgeKey(a,b);const e=edges.get(k);if(e)e.count++;else edges.set(k,{a,b,count:1});}
 }
 // Only edges shared with retained triangles form the cut frontier. Original
 // open lash/hair edges have no retained neighbour; including them creates
 // branches and turns one real contour into several falsely closed chains.
 const retainedEdges=new Map<string,number[]>(),keptParent=kept.map((_,i)=>i);
 const keptFind=(i:number):number=>{let root=i;while(keptParent[root]!==root)root=keptParent[root];while(keptParent[i]!==i){const next=keptParent[i];keptParent[i]=root;i=next;}return root;};
 kept.forEach((ids,i)=>{for(let j=0;j<3;j++){const k=edgeKey(ids[j],ids[(j+1)%3]),prior=retainedEdges.get(k);if(prior){keptParent[keptFind(i)]=keptFind(prior[0]);prior.push(i);}else retainedEdges.set(k,[i]);}});
 const keptGroups=new Map<number,number[]>();kept.forEach((_,i)=>{const group=keptFind(i),ids=keptGroups.get(group)??[];ids.push(i);keptGroups.set(group,ids);});
 const touched=new Set<number>();for(const [k,e] of edges)if(e.count===1)for(const i of retainedEdges.get(k)??[])touched.add(keptFind(i));
 // The eye cut can detach tiny outer-lash remnants from the source surface.
 // Remove only newly isolated, small components adjacent to this cut, with
 // every vertex still inside its local facial neighbourhood. Body/hair parts
 // that were already disconnected and do not share a cut edge stay intact.
 const fragments=new Set<number>();
 for(const group of touched){const ids=keptGroups.get(group)!;if(ids.length>64)continue;if(ids.every(i=>kept[i].every(v=>{const p=points[v].p;return p.z>.09&&((p.x-r.cx)/r.rx)**2+((p.y-r.cy)/r.ry)**2<1.7**2;})))for(const i of ids)fragments.add(i);}
 const keep=kept.flatMap((ids,i)=>fragments.has(i)?[]:ids);
 const verts=new Map<string,Point>(),neighbors=new Map<string,string[]>();
 const retained=new Map<string,Point>();for(const i of keep)retained.set(keys[i],points[i]);
 for(const [k,e] of edges)if(e.count===1&&(retainedEdges.get(k)??[]).some(i=>!fragments.has(i))){const a=keys[e.a],b=keys[e.b];verts.set(a,retained.get(a)??points[e.a]);verts.set(b,retained.get(b)??points[e.b]);neighbors.set(a,[...(neighbors.get(a)??[]),b]);neighbors.set(b,[...(neighbors.get(b)??[]),a]);}
 if([...neighbors.values()].some(adjacent=>adjacent.length!==2))throw new Error('Masha facial cut frontier is not a closed manifold contour');
 const used=new Set<string>(),loops:Point[][]=[];
 for(const start of verts.keys()){
  if(used.has(start))continue;const loop:Point[]=[];let current=start,previous='';
  do{if(used.has(current))throw new Error('Masha facial cut boundary crossed another contour');used.add(current);loop.push(verts.get(current)!);const next=neighbors.get(current)!.find(v=>v!==previous)!;previous=current;current=next;}while(current!==start);
  if(loop.length>=3)loops.push(loop);
 }
 const area=(loop:Point[])=>Math.abs(loop.reduce((s,p,i)=>{const q=loop[(i+1)%loop.length].p;return s+p.p.x*q.y-q.x*p.p.y;},0));
 const outer=loops.sort((a,b)=>area(b)-area(a))[0]??[];
 mesh.userData.faceCuts??=[];mesh.userData.faceCuts.push({region:r,loops:loops.map(loop=>({n:loop.length,closed:true,area:area(loop),min:[Math.min(...loop.map(v=>v.p.x)),Math.min(...loop.map(v=>v.p.y))],max:[Math.max(...loop.map(v=>v.p.x)),Math.max(...loop.map(v=>v.p.y))]})),removed:(old.length-keep.length)/3,detachedFragments:fragments.size});
 if(outer.reduce((s,p,i)=>{const q=outer[(i+1)%outer.length].p;return s+p.p.x*q.y-q.x*p.p.y;},0)<0)outer.reverse();
 if(outer.length<8)throw new Error('Masha facial retopology could not resolve its boundary');
 mesh.geometry.setIndex(keep);return outer;
}

function cloneSkinMaterial(source:THREE.MeshStandardMaterial):THREE.MeshStandardMaterial{
 const mat=source.clone();
 mat.side=THREE.DoubleSide;
 mat.forceSinglePass=true;
 mat.onBeforeCompile=source.onBeforeCompile;
 mat.customProgramCacheKey=source.customProgramCacheKey;
 return mat;
}

const faceUV=(x:number,y:number)=>new THREE.Vector2((x+.16)/.32,(y-.56)/.29);
function mouthSkin(outer:Point[],r:Region,sample:ReturnType<typeof surfaceSampler>,material:THREE.Material,inner:(angle:number)=>THREE.Vector3,outerAt:(point:Point)=>THREE.Vector3):Ring{
 const active=outer.map((_,i)=>i),indices:number[]=[],rows=14;
 const angle=(i:number)=>Math.atan2((outer[i].p.y-r.cy)/r.ry,(outer[i].p.x-r.cx)/r.rx);
 const cross=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 // The closed source cut has a few tiny ears whose polar order reverses.
 // Clip only those convex ears into static, source-following triangles. The
 // remaining contour supports radial quads without carrying a chin fold all
 // the way to the lip; every original boundary edge remains stitched.
 for(let pass=0;pass<outer.length;pass++){
  const backwards=active.findIndex((id,i)=>{const d=angle(active[(i+1)%active.length])-angle(id);return Math.atan2(Math.sin(d),Math.cos(d))<=1e-5;});
  if(backwards<0)break;
  const ear=[backwards,(backwards+1)%active.length].find(k=>{
   const a=outer[active[(k+active.length-1)%active.length]].p,b=outer[active[k]].p,c=outer[active[(k+1)%active.length]].p;
   return cross(a,b,c)>1e-10&&!active.some((id,i)=>i!==k&&i!==(k+active.length-1)%active.length&&i!==(k+1)%active.length&&cross(a,b,outer[id].p)>1e-10&&cross(b,c,outer[id].p)>1e-10&&cross(c,a,outer[id].p)>1e-10);
  });
  if(ear===undefined)throw new Error('Masha mouth contour cannot form an ordered annulus');
  indices.push(active[(ear+active.length-1)%active.length],active[ear],active[(ear+1)%active.length]);active.splice(ear,1);
 }
 const count=active.length,offset=outer.length,angles=active.map(angle),base=angles.map(inner),rest=outer.map(point=>point.p.clone()),uv:number[]=[];
 const vertex=(row:number,i:number)=>row===0?active[i]:offset+(row-1)*count+i;
 for(let j=1;j<=rows;j++)for(let i=0;i<count;i++){
  const p=outer[active[i]].p.clone().lerp(base[i],j/rows);if(j<rows)p.z=sample(p.x,p.y).p.z;rest.push(p);
  const a=vertex(j-1,i),b=vertex(j-1,(i+1)%count),c=vertex(j,i),d=vertex(j,(i+1)%count);indices.push(a,b,c,b,d,c);
 }
 const positions=new Float32Array(rest.length*3);rest.forEach((p,i)=>{p.toArray(positions,i*3);const t=faceUV(p.x,p.y);uv.push(t.x,t.y);});const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const mat=cloneSkinMaterial(material as THREE.MeshStandardMaterial);const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;
 const edgePositions=outer.map(()=>new THREE.Vector3());
 const rowWeights=Array.from({length:rows+1},(_,j)=>smooth(j/rows));
 return {mesh,angles,update(next){
  for(let i=0;i<outer.length;i++){const e=outerAt(outer[i]);edgePositions[i].copy(e);e.toArray(positions,i*3);}
  for(let i=0;i<count;i++){
   const delta=_ringDelta.copy(next(angles[i])).sub(base[i]),edge=_ringEdge.copy(edgePositions[active[i]]).sub(outer[active[i]].p);
   for(let j=1;j<=rows;j++){
    const t=j/rows,w=rowWeights[j],index=vertex(j,i),r=rest[index],o=index*3;
    // Linear planar interpolation cannot overshoot into an adjacent row when
    // the mouth opens wide. Depth keeps the original smooth lip deformation.
    positions[o]=r.x+delta.x*t+edge.x*(1-t);
    positions[o+1]=r.y+delta.y*t+edge.y*(1-t);
    positions[o+2]=r.z+delta.z*w+edge.z*(1-w);
   }
  }
  g.attributes.position.needsUpdate=true;g.computeVertexNormals();
 }};
}
function skinRing(outer:Point[],r:Region,sample:ReturnType<typeof surfaceSampler>,material:THREE.Material,inner:(angle:number)=>THREE.Vector3,outerAt:(point:Point)=>THREE.Vector3,project?:(point:THREE.Vector3)=>void,outerNormals?:THREE.Vector3[]):Ring{
 const count=96,rows=12,offset=outer.length,angles=Array.from({length:count},(_,i)=>i/count*Math.PI*2),innerRest=angles.map(inner);
 const middle=angles.map(angle=>{
  const dx=r.rx*.84*Math.cos(angle),dy=r.ry*.82*Math.sin(angle);let reach=Infinity;
  for(let i=0;i<outer.length;i++){const a=outer[i].p,b=outer[(i+1)%outer.length].p,ex=b.x-a.x,ey=b.y-a.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;const ax=a.x-r.cx,ay=a.y-r.cy,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;if(t>0&&u>=0&&u<=1)reach=Math.min(reach,t);}
  const f=Math.min(1,reach*.92);return sample(r.cx+dx*f,r.cy+dy*f).p;
 });
 // Sampling every interior vertex copied the source's baked eye/lash ridges
 // into the new skin. Smooth the support contour, then interpolate the lid.
 const depths=middle.map(p=>p.z);middle.forEach((p,i)=>{let sum=0,weight=0;for(let k=-7;k<=7;k++){const w=Math.exp(-k*k/18);sum+=depths[(i+k+count)%count]*w;weight+=w;}p.z=sum/weight;});
 const rest=outer.map(p=>p.p.clone()),indices:number[]=[],uvs:number[]=[];
 // A narrow static transition follows every irregular source edge; the moving
 // part is a regular quad annulus. This keeps generated topology defects out
 // of the eyelid/lip deformation and preserves a smooth surface during closure.
 for(let j=0;j<=rows;j++)for(let i=0;i<count;i++){
  const f=j/rows,p=middle[i].clone().lerp(innerRest[i],f);
  p.z=mix(middle[i].z,innerRest[i].z,smooth(f));
  if(project&&j>0&&j<rows)project(p);
  rest.push(p);
  if(j<rows){const a=offset+j*count+i,b=offset+j*count+(i+1)%count,c=a+count,d=b+count;indices.push(a,b,c,b,d,c);}
 }
 const contour=outer.map(v=>new THREE.Vector2(v.p.x,v.p.y)),hole=middle.map(p=>new THREE.Vector2(p.x,p.y));
 for(const tri of THREE.ShapeUtils.triangulateShape(contour,[hole])){const [a,b,c]=tri,pa=rest[a],pb=rest[b],pc=rest[c];if((pb.x-pa.x)*(pc.y-pa.y)-(pb.y-pa.y)*(pc.x-pa.x)>0)indices.push(a,b,c);else indices.push(a,c,b);}
 const positions=new Float32Array(rest.length*3);for(let i=0;i<rest.length;i++){rest[i].toArray(positions,i*3);const uv=faceUV(rest[i].x,rest[i].y);uvs.push(uv.x,uv.y);}
 const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(positions,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geom.setIndex(indices);geom.computeVertexNormals();
 const adjacent=Array.from({length:rest.length},()=>new Set<number>());for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=indices[i+j],b=indices[i+(j+1)%3];adjacent[a].add(b);adjacent[b].add(a);}
 const neighborIds=adjacent.map(ids=>Array.from(ids)),normalBuffer=new Float32Array(rest.length*3);
 const updateNormals=()=>{geom.computeVertexNormals();const normals=geom.getAttribute('normal');
  // Smooth normals across the sparse outer bridge and the dense moving ring;
  // equal-area source tessellation is not available on the generated mesh.
  for(let pass=0;pass<4;pass++){for(let i=0;i<rest.length;i++){let x=normals.getX(i)*2,y=normals.getY(i)*2,z=normals.getZ(i)*2;for(const j of neighborIds[i]){x+=normals.getX(j);y+=normals.getY(j);z+=normals.getZ(j);}const length=Math.hypot(x,y,z)||1;normalBuffer[i*3]=x/length;normalBuffer[i*3+1]=y/length;normalBuffer[i*3+2]=z/length;}for(let i=0;i<rest.length;i++)normals.setXYZ(i,normalBuffer[i*3],normalBuffer[i*3+1],normalBuffer[i*3+2]);if(outerNormals)outerNormals.forEach((normal,i)=>normals.setXYZ(i,normal.x,normal.y,normal.z));}
  normals.needsUpdate=true;
 };
 const mat=cloneSkinMaterial(material as THREE.MeshStandardMaterial);const mesh=new THREE.Mesh(geom,mat);mesh.frustumCulled=false;mesh.receiveShadow=true;
 const workingPoint=new THREE.Vector3();
 const rowWeights=Array.from({length:rows+1},(_,j)=>smooth(j/rows));
 return {mesh,angles,update(next){
  for(let i=0;i<outer.length;i++)outerAt(outer[i]).toArray(positions,i*3);
  for(let i=0;i<count;i++){const delta=_ringDelta.copy(next(angles[i])).sub(innerRest[i]);for(let j=0;j<=rows;j++){const index=offset+j*count+i,p=workingPoint.copy(rest[index]).addScaledVector(delta,rowWeights[j]);if(project&&j>0&&j<rows)project(p);p.toArray(positions,index*3);}}
  geom.attributes.position.needsUpdate=true;updateNormals();
 }};
}

/** Paint only the removed eye/lash surface, preserving the exact source colour
 * along its irregular seam. Clean forehead/temple samples avoid turning the
 * whole eyelid into the source cheek's pink blush. */
function cleanEyeTexture(source:THREE.CanvasTexture,target:THREE.CanvasTexture,outer:Point[],cx:number,cy:number,side:number){
 if(typeof document==='undefined'||!source?.image||!target?.image)return;
 const original=source.image as HTMLCanvasElement,canvas=target.image as HTMLCanvasElement,ctx=canvas.getContext?.('2d'),origCtx=original.getContext?.('2d');
 if(!ctx||!origCtx)return;
 const width=canvas.width,height=canvas.height,raw=origCtx.getImageData(0,0,width,height).data,out=ctx.getImageData(0,0,width,height);
 const rgb=(x:number,y:number)=>{const u=clamp(Math.round((x+.16)/.32*(width-1)),0,width-1),v=clamp(Math.round((y-.56)/.29*(height-1)),0,height-1),i=(v*width+u)*4;return [raw[i],raw[i+1],raw[i+2]];};
 const inner=rgb(cx-side*.047,cy-.014),temple=rgb(cx+side*.061,cy-.010),innerTop=rgb(cx-side*.040,cy+.042),templeTop=rgb(cx+side*.060,cy+.040);
 const minX=Math.max(0,Math.floor((Math.min(...outer.map(v=>v.p.x))+.16)/.32*(width-1))),maxX=Math.min(width-1,Math.ceil((Math.max(...outer.map(v=>v.p.x))+.16)/.32*(width-1)));
 const minY=Math.max(0,Math.floor((Math.min(...outer.map(v=>v.p.y))-.56)/.29*(height-1))),maxY=Math.min(height-1,Math.ceil((Math.max(...outer.map(v=>v.p.y))-.56)/.29*(height-1)));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const px=x/(width-1)*.32-.16,py=y/(height-1)*.29+.56;let distance=Infinity,inside=false;
  for(let i=0,j=outer.length-1;i<outer.length;j=i++){
   const a=outer[j].p,b=outer[i].p,dx=b.x-a.x,dy=b.y-a.y,u=clamp(((px-a.x)*dx+(py-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
   distance=Math.min(distance,Math.hypot(px-a.x-u*dx,py-a.y-u*dy));
   if((a.y>py)!==(b.y>py)&&px<(b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  const at=(y*width+x)*4,w=inside?smooth(distance/.009):0,across=clamp((side*(px-cx)+.047)/.108,0,1),up=clamp((py-cy+.014)/.056,0,1),cheek=rgb(clamp(px,cx-.035,cx+.035),cy-.054),lower=smooth((cy-py-.012)/.040);
  for(let c=0;c<3;c++){const clean=mix(mix(mix(inner[c],temple[c],across),mix(innerTop[c],templeTop[c],across),up),cheek[c],lower);out.data[at+c]=mix(raw[at+c],clean,w);}
 }
 ctx.putImageData(out,0,0);target.needsUpdate=true;
}

function scleraGeometry(){
 const g=new THREE.SphereGeometry(1,48,32),pos=g.getAttribute('position'),colors=new Float32Array(pos.count*3);
 const base=new THREE.Color('#fff9eb'),corner=new THREE.Color('#f0d4cb'),c=new THREE.Color();
 for(let i=0;i<pos.count;i++){
  const px=pos.getX(i),py=pos.getY(i),pz=pos.getZ(i),edge=1-Math.max(0,pz);
  const topOcclusion=mix(1,.80,smooth((py+.05)/.72)),cornerBlend=smooth((Math.abs(px)-.42)/.58)*(1-.35*Math.max(0,pz));
  c.copy(base).lerp(corner,cornerBlend*.45).multiplyScalar((.99-.06*edge)*topOcclusion);
  c.toArray(colors,i*3);
 }
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}

function irisGeometry(rx:number,ry:number,depth:number){
 const pos:number[]=[],colors:number[]=[],idx:number[]=[],radial=24,segments=64;
 const green=new THREE.Color('#347b54'),light=new THREE.Color('#7ca875'),bounce=new THREE.Color('#a6d482'),dark=new THREE.Color('#193826'),pupil=new THREE.Color('#091410');
 for(let r=0;r<=radial;r++)for(let s=0;s<=segments;s++){
  const u=r/radial,a=s/segments*Math.PI*2,x=Math.cos(a)*.0203*u,y=Math.sin(a)*.0203*u;
  pos.push(x,y,depth*Math.sqrt(Math.max(0,1-(x/rx)**2-(y/ry)**2))+.0006);
  const streak=.5+.2*Math.sin(a*49)+.16*Math.sin(a*93+.9)+.14*Math.sin(a*21+u*7);
  const limbal=smooth((u-.76)/.24),lowerBounce=smooth((-Math.sin(a)-.08)/.78)*smooth((u-.46)/.16)*(1-smooth((u-.82)/.18)),upperShadow=1-.24*smooth((Math.sin(a)*u-.12)/.82),pupilMask=1-smooth((u-.42)/.07);
  const c=green.clone().lerp(light,streak*.68).lerp(bounce,lowerBounce*.62).lerp(dark,limbal*.86).multiplyScalar(upperShadow).lerp(pupil,pupilMask);
  c.toArray(colors,colors.length);
  if(r<radial&&s<segments){const k=r*(segments+1)+s;idx.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function catchlightGeometry(rx:number,ry:number,depth:number){
 const pos:number[]=[],nrm:number[]=[],idx:number[]=[],segments=20;
 const discs:[number,number,number][]=[[-.26*rx,.30*ry,.0044],[.21*rx,-.21*ry,.0018]];
 for(const [cx,cy,rad] of discs){
  const base=pos.length/3;
  const pushPoint=(x:number,y:number)=>{
   const z=depth*Math.sqrt(Math.max(.02,1-(x/rx)**2-(y/ry)**2))+.00097;
   pos.push(x,y,z);
   const nx=x/(rx*rx),ny=y/(ry*ry),nz=z/(depth*depth),len=Math.hypot(nx,ny,nz)||1;
   nrm.push(nx/len,ny/len,nz/len);
  };
  pushPoint(cx,cy);
  for(let s=0;s<=segments;s++){const a=s/segments*Math.PI*2;pushPoint(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);}
  for(let s=0;s<segments;s++)idx.push(base,base+1+s,base+2+s);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));g.setIndex(idx);return g;
}

function dynamicLine(count:number,material:THREE.Material,width:number,taper:'band'|'flick'='band'){
 const g=new THREE.BufferGeometry(),p=new Float32Array(count*2*3),idx:number[]=[];
 for(let i=0;i<count-1;i++)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
 g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(idx);const mesh=new THREE.Mesh(g,material);mesh.frustumCulled=false;
 return {mesh,write(fn:(t:number)=>THREE.Vector3){for(let i=0;i<count;i++){const t=i/(count-1),v=fn(t),w=width*(taper==='flick'?Math.pow(1-t,.75):Math.max(0,Math.sin(Math.PI*t))**.38);_lineUpper.set(v.x,v.y+w,v.z+.0005).toArray(p,i*6);_lineLower.set(v.x,v.y-w,v.z+.0005).toArray(p,i*6+3);}g.attributes.position.needsUpdate=true;g.computeVertexNormals();}};
}

function bakeFaceTextures(source:THREE.MeshStandardMaterial,sample:ReturnType<typeof surfaceSampler>):[THREE.MeshStandardMaterial,THREE.MeshStandardMaterial]{
 const skin=cloneSkinMaterial(source);skin.normalMap=null;skin.roughnessMap=null;skin.metalnessMap=null;skin.aoMap=null;skin.roughness=.72;
 const lidSkin=cloneSkinMaterial(source);lidSkin.normalMap=null;lidSkin.roughnessMap=null;lidSkin.metalnessMap=null;lidSkin.aoMap=null;lidSkin.roughness=.72;
 const image=source.map?.image as ImageBitmap|undefined;
 if(typeof document==='undefined'||!image)return [skin,lidSkin];
 const input=document.createElement('canvas');input.width=image.width;input.height=image.height;const ctx=input.getContext('2d',{willReadFrequently:true});
 const skinCanvas=document.createElement('canvas');skinCanvas.width=512;skinCanvas.height=512;const skinOut=skinCanvas.getContext('2d');
 const lidCanvas=document.createElement('canvas');lidCanvas.width=512;lidCanvas.height=512;const lidOut=lidCanvas.getContext('2d');
 if(!ctx||!skinOut||!lidOut)return [skin,lidSkin];
 ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,input.width,input.height).data;
 const pixels=skinOut.createImageData(512,512),lidPixels=lidOut.createImageData(512,512);
 const pData=pixels.data,lData=lidPixels.data,w1=input.width-1,h1=input.height-1,iw=input.width;
 for(let y=0;y<512;y++){
  const py=y/511*.29+.56,row=y*512;
  for(let x=0;x<512;x++){
   const uv=sample.uv(x/511*.32-.16,py,_sampleUv),u=clamp(Math.round(uv.x*w1),0,w1),v=clamp(Math.round(uv.y*h1),0,h1),from=(v*iw+u)*4,to=(row+x)*4;
   pData[to]=data[from];pData[to+1]=data[from+1];pData[to+2]=data[from+2];pData[to+3]=data[from+3];
  }
 }
 lData.set(pData);
 for(const [cx,cy] of [[.0556,.7374],[-.053,.7449]]){
  const side=Math.sign(cx);
  const minX=Math.max(0,Math.floor(((cx-.085)+.16)/.32*511)),maxX=Math.min(511,Math.ceil(((cx+.085)+.16)/.32*511));
  const minY=Math.max(0,Math.floor(((cy-.070)-.56)/.29*511)),maxY=Math.min(511,Math.ceil(((cy+.075)-.56)/.29*511));
  for(let y=minY;y<=maxY;y++){
   const py=y/511*.29+.56,dy=(py-cy)/(py>cy?.055:.049),row=y*512;
   for(let x=minX;x<=maxX;x++){
    const px=x/511*.32-.16,dx=(px-cx)/(side*(px-cx)>0?.067:.049),r=Math.hypot(dx,dy),weight=1-smooth((r-1.03)/.22);
    if(weight>0){
     const cleanUv=sample.uv(clamp(px,cx-.035,cx+.035),cy-.054,_sampleUv),su=clamp(Math.round(cleanUv.x*w1),0,w1),sv=clamp(Math.round(cleanUv.y*h1),0,h1),offset=(sv*iw+su)*4,to=(row+x)*4;
     for(let c=0;c<3;c++)lData[to+c]=mix(lData[to+c],data[offset+c],weight);
    }
   }
  }
 }
 skinOut.putImageData(pixels,0,0);const skinTex=new THREE.CanvasTexture(skinCanvas);skinTex.flipY=false;skinTex.colorSpace=THREE.SRGBColorSpace;skinTex.anisotropy=8;skin.map=skinTex;
 lidOut.putImageData(lidPixels,0,0);const lidTex=new THREE.CanvasTexture(lidCanvas);lidTex.flipY=false;lidTex.colorSpace=THREE.SRGBColorSpace;lidTex.anisotropy=8;lidSkin.map=lidTex;
 return [skin,lidSkin];
}

/** The shared cartoon presets are deliberately broad. Masha's sculpt needs
 * smaller rest apertures so a listening smile does not become a permanent gape.
 * Speech still reaches its full authored shape, through a C1-continuous weight. */
function mashaMouth(emotion:ActorFrame['face']['emotion'],viseme:ActorFrame['face']['viseme'],weight:number):MouthShape{
 const w=viseme==='rest'?0:smooth(weight),shape=mouthShapeFor(emotion,viseme,w);
 const emotionalOpen={neutral:0,happy:.14,excited:.42,mischievous:0,curious:.11,surprised:.50,sad:0,angry:.09,scared:.30,sleepy:0,proud:0,annoyed:0}[emotion];
 shape.open+=(emotionalOpen-EMOTION_PRESETS[emotion].mouth.open)*(1-w);
 return shape;
}
function expression(frame:ActorFrame){
 const target=EMOTION_PRESETS[frame.face.emotion],transition=frame.face.emotionTransition;
 const weighted=(select:(preset:typeof target)=>number,progress=transition?.progress??1)=>Object.entries(emotionWeights(frame.face,progress)).reduce((sum,[emotion,weight])=>sum+select(EMOTION_PRESETS[emotion as keyof typeof EMOTION_PRESETS])*(weight??0),0);
 const progress=transition?.progress??1,interruptedSource=!!transition?.fromWeights;
 // Lids lead the reaction; brows settle a few frames later. Interrupted
 // reactions retain their displayed source mixture, including reverse seeks.
 return {...target,browL:weighted(p=>p.browL,interruptedSource?progress:(progress-.06)/.94),browR:weighted(p=>p.browR,interruptedSource?progress:(progress-.06)/.94),tilt:weighted(p=>p.tilt),lid:weighted(p=>p.lid,interruptedSource?progress:progress/.88),mouth:{...target.mouth,smile:weighted(p=>p.mouth.smile),asym:weighted(p=>p.mouth.asym)}};
}
function mouthExpression(frame:ActorFrame):MouthShape{
 const f=frame.face,target=mashaMouth(f.emotion,f.viseme,f.visemeWeight);
 const weights=Object.entries(emotionWeights(f));
 for(const key of Object.keys(target) as (keyof MouthShape)[])target[key]=weights.reduce((sum,[emotion,weight])=>sum+mashaMouth(emotion as ActorFrame['face']['emotion'],f.viseme,f.visemeWeight)[key]*(weight??0),0);
 return target;
}
export interface MashaPerformance { update(frame:ActorFrame):void; mouthTarget(frame:ActorFrame):THREE.Vector3; dispose():void; }
export function createMashaPerformance(meshes:THREE.SkinnedMesh[],bones:Record<string,THREE.Bone>,root:THREE.Object3D):MashaPerformance{
 const head=bones.Head,space=new THREE.Group();space.name='masha:articulated-face';space.matrixAutoUpdate=false;space.matrix.copy(head.matrixWorld).invert();head.add(space);
 const updates:((frame:ActorFrame)=>void)[]=[],owned:THREE.Object3D[]=[];
 const add=(o:THREE.Object3D)=>{space.add(o);owned.push(o);};
 const faceMesh=meshes.reduce((a,b)=>a.geometry.attributes.position.count>b.geometry.attributes.position.count?a:b);
 const points=bindPoints(faceMesh),pointKeys=points.map(point=>key(point.p)),indices=Array.from(faceMesh.geometry.index!.array),sample=surfaceSampler(points,indices),originalSkin=(Array.isArray(faceMesh.material)?faceMesh.material[0]:faceMesh.material) as THREE.MeshStandardMaterial;
 const [skin,lidSkin]=bakeFaceTextures(originalSkin,sample);
 const outerAt=(point:Point)=>space.worldToLocal(faceMesh.getVertexPosition(point.index!,new THREE.Vector3()).applyMatrix4(faceMesh.matrixWorld));
 const diagnostics:Record<string,unknown>={type:'articulated facial surface',sourceVertices:points.length};root.userData.performance=diagnostics;

 // Mouth: the outer edge remains stitched to the original mesh. An inner
 // boundary opens into an actual recessed cavity with separate teeth and tongue.
 const mr={cx:-.001,cy:.651,rx:.081,ry:.039};
 const mouthOuter=cutRegion(faceMesh,points,pointKeys,mr);
 const baseMouth=(a:number)=>{const x=mr.cx+.056*Math.cos(a),y=mr.cy+.010*Math.cos(a)**2+.0014*Math.sin(a);return sample(x,y).p;};
 const lips=mouthSkin(mouthOuter,mr,sample,skin,baseMouth,outerAt);lips.mesh.name='masha:mouth-skin';add(lips.mesh);
 const count=lips.angles.length,cavityGeom=new THREE.BufferGeometry(),cavityPos=new Float32Array((count*2+1)*3),cavityCol=new Float32Array((count*2+1)*3),ci:number[]=[];
 for(let i=0;i<count;i++){const j=(i+1)%count;ci.push(i,j,count+i,j,count+j,count+i,count+i,count+j,count*2);new THREE.Color('#7b3e3b').toArray(cavityCol,i*3);new THREE.Color('#462226').toArray(cavityCol,(count+i)*3);}new THREE.Color('#301a20').toArray(cavityCol,count*6);
 cavityGeom.setAttribute('position',new THREE.BufferAttribute(cavityPos,3));cavityGeom.setAttribute('color',new THREE.BufferAttribute(cavityCol,3));cavityGeom.setIndex(ci);
 const cavity=new THREE.Mesh(cavityGeom,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));cavity.name='masha:mouth-cavity';cavity.frustumCulled=false;add(cavity);
 const teeth=new THREE.Group(),toothMat=new THREE.MeshStandardMaterial({color:'#e5d9c4',roughness:.78});
 // Flat-fronted incisors with softly rounded lower corners. Their roots sit
 // behind the upper lip, so the visible shape is a short edge, not two beads.
 const toothShape=new THREE.Shape();toothShape.moveTo(-.0057,.006);toothShape.lineTo(.0057,.006);toothShape.lineTo(.0057,-.004);toothShape.quadraticCurveTo(.0057,-.0057,.0038,-.0057);toothShape.lineTo(-.0038,-.0057);toothShape.quadraticCurveTo(-.0057,-.0057,-.0057,-.004);toothShape.closePath();
 for(const s of [-1,1]){const tooth=new THREE.Mesh(new THREE.ExtrudeGeometry(toothShape,{depth:.0025,bevelEnabled:true,bevelSize:.0005,bevelThickness:.0004,bevelSegments:2,curveSegments:6,steps:1}),toothMat);tooth.position.x=s*.0066;tooth.rotation.y=-s*.04;teeth.add(tooth);}add(teeth);
 const tongue=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),new THREE.MeshStandardMaterial({color:'#b86b75',roughness:.58}));tongue.scale.set(.021,.004,.009);add(tongue);
 const mouthCentre=sample(mr.cx,mr.cy).p;
 const mouthState=(frame:ActorFrame)=>{
  const state=mouthExpression(frame);
  // The source cheek already contains smile dimples. Keep closed corners wide
  // and restrained rather than pulling a deep frown through those fixed folds.
  // Pronunciation and surprise retain the wider articulation range.
  const open=clamp(state.open,0,1),w=clamp(state.w*(1-state.round*.20),mix(.88,.43,smooth(open/.25)),1.08),smile=Math.max(.06,state.smile);
  const half=.00065+open*(.016+state.round*.009),mid=mr.cy-open*.0065;
  const inner=(a:number)=>{
   const nx=Math.cos(a),cornerCurve=.0035+smile*.008,x=mr.cx+.056*w*nx,y=mid+cornerCurve*nx*nx+half*Math.sin(a)+state.asym*.004*nx;
   const original=sample(mr.cx+.056*nx,mr.cy+.010*nx*nx+.0014*Math.sin(a));
   return new THREE.Vector3(x,y,original.p.z+state.round*.004-open*.002*(Math.sin(a)<0?1:0));
  };
  const centre=mouthCentre,taste=frame.verb==='eat'&&frame.holding==='lollipop'?smooth((((1-Math.cos((frame.action?.time??0)/3*Math.PI*2))*.5)-.85)/.15):0;
  return {state,open,w,half,mid,smile,inner,centre,taste,tonguePosition:new THREE.Vector3(mr.cx,mid-half+.004,centre.z-.010+taste*.009)};
 };
 let prevOpen=NaN,prevW=NaN,prevHalf=NaN,prevMid=NaN,prevSmile=NaN,prevRound=NaN,prevAsym=NaN,prevTeeth=NaN,prevTaste=NaN;
 const prevMouthOuter0=new THREE.Vector3(NaN,NaN,NaN),prevMouthOuterMid=new THREE.Vector3(NaN,NaN,NaN);
 updates.push(frame=>{
  const {state,open,w,half,mid,smile,inner,centre,tonguePosition,taste}=mouthState(frame);
  const mouthOuter0=outerAt(mouthOuter[0]),mouthOuterMid=outerAt(mouthOuter[mouthOuter.length>>1]);
  const exprSame=Math.abs(open-prevOpen)<=1e-5&&Math.abs(w-prevW)<=1e-5&&Math.abs(half-prevHalf)<=1e-5&&Math.abs(mid-prevMid)<=1e-5&&Math.abs(smile-prevSmile)<=1e-5&&Math.abs(state.round-prevRound)<=1e-5&&Math.abs(state.asym-prevAsym)<=1e-5&&Math.abs(state.teeth-prevTeeth)<=1e-5&&Math.abs(taste-prevTaste)<=1e-5;
  const outerSame=mouthOuter0.equals(prevMouthOuter0)&&mouthOuterMid.equals(prevMouthOuterMid);
  if(!exprSame||!outerSame){
   prevMouthOuter0.copy(mouthOuter0);prevMouthOuterMid.copy(mouthOuterMid);
   lips.update(inner);
  }
  if(!exprSame){
   prevOpen=open;prevW=w;prevHalf=half;prevMid=mid;prevSmile=smile;prevRound=state.round;prevAsym=state.asym;prevTeeth=state.teeth;prevTaste=taste;
   for(let i=0;i<count;i++){const v=inner(lips.angles[i]);v.toArray(cavityPos,i*3);const co=(count+i)*3;cavityPos[co]=mix(v.x,mr.cx,.12);cavityPos[co+1]=mix(v.y,mid,.12);cavityPos[co+2]=v.z-.018;}
   cavityPos[count*6]=mr.cx;cavityPos[count*6+1]=mid;cavityPos[count*6+2]=centre.z-.033;cavityGeom.attributes.position.needsUpdate=true;
  }
  teeth.visible=open>.17&&state.teeth>.12;teeth.position.set(mr.cx,mid+half+.0018,centre.z-.008);teeth.scale.setScalar(.86+.09*state.teeth);
  tongue.visible=open>.27;tongue.position.copy(tonguePosition);tongue.scale.x=.021*w;tongue.scale.z=.009+taste*.009;
  diagnostics.mouthOpen=open;
 });

 // Replace each baked eye with a real gaze pivot and a skin eyelid aperture.
 const eyeballMat=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.22,clearcoat:.85,clearcoatRoughness:.1});
 const irisMat=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.2,clearcoat:1,clearcoatRoughness:.08});
 const catchlightMat=new THREE.MeshBasicMaterial({color:new THREE.Color(1.38,1.35,1.28)});
 const lashMat=new THREE.MeshStandardMaterial({color:'#3d281c',roughness:.78,side:THREE.DoubleSide,forceSinglePass:true});
 const browMat=new THREE.MeshStandardMaterial({color:'#78593a',roughness:.92,side:THREE.DoubleSide,forceSinglePass:true});
 for(const [side,cx,cy] of [[1,.0556,.7374],[-1,-.053,.7449]]){
  const er={cx,cy,rx:.049,ry:.049};
  // The source lash fan reaches farther toward the temple than the eye itself.
  // Include that fan without raising the whole cut into the fringe or nose.
  const outer=cutRegion(faceMesh,points,pointKeys,er,(x,y)=>((x-cx)/(side*(x-cx)>0?.067:.049))**2+((y-cy)/(y>cy?.055:.049))**2<1),front=sample(cx,cy).p.z-.001;
  cleanEyeTexture(skin.map as THREE.CanvasTexture,lidSkin.map as THREE.CanvasTexture,outer,cx,cy,side);
  const eyeRx=.037,eyeRy=.034,eyeDepth=.023;
  const eye=new THREE.Group();eye.name=side>0?'masha:left-eye':'masha:right-eye';eye.position.set(cx,cy,front-eyeDepth);add(eye);
  const eyeball=new THREE.Mesh(scleraGeometry(),eyeballMat);eyeball.scale.set(eyeRx,eyeRy,eyeDepth);eye.add(eyeball);
  const iris=new THREE.Mesh(irisGeometry(eyeRx,eyeRy,eyeDepth),irisMat);eye.add(iris);
  const catchlights=new THREE.Mesh(catchlightGeometry(eyeRx,eyeRy,eyeDepth),catchlightMat);catchlights.name=side>0?'masha:left-catchlights':'masha:right-catchlights';eye.add(catchlights);
  const lidPoint=(a:number,close=0,tilt=0,upperDrop=.003,lowerLift=.003)=>{
   const sn=Math.sin(a),x=.035*Math.cos(a),aperture=sn>=0?.0295*sn-upperDrop*Math.pow(sn,.65):.027*sn+lowerLift*Math.pow(-sn,.65);
   const y=aperture*(1-close)-close*.003+tilt*Math.cos(a);
   const z=front-eyeDepth+eyeDepth*Math.sqrt(Math.max(.02,1-(x/eyeRx)**2-(y/eyeRy)**2))+.0011;
   return new THREE.Vector3(cx+x,cy+y,z);
  };
  // Sample clean cheek skin for the moving lid, rather than stretching the
  // generated texture's painted lashes over a closed eye.
  const boundaryNormals=outer.map(point=>new THREE.Vector3().fromBufferAttribute(faceMesh.geometry.attributes.normal,point.index!).transformDirection(faceMesh.matrixWorld));
  const lid=skinRing(outer,er,sample,lidSkin,a=>lidPoint(a),outerAt,p=>{const d=((p.x-cx)/eyeRx)**2+((p.y-cy)/eyeRy)**2;if(d<1){const cover=front-eyeDepth+eyeDepth*Math.sqrt(1-d)+.0012,delta=p.z-cover;p.z=(p.z+cover+Math.sqrt(delta*delta+.00000225))*.5;}},boundaryNormals);lid.mesh.name='masha:eyelid-skin';add(lid.mesh);
  const irisRest=iris.geometry.attributes.position.array.slice();
  const lash=dynamicLine(48,lashMat,.00105);add(lash.mesh);
  const flicks=Array.from({length:7},()=>dynamicLine(12,lashMat,.00062,'flick'));for(const f of flicks)add(f.mesh);
  const brow=dynamicLine(32,browMat,.0014);add(brow.mesh);
  let prevClose=NaN,prevTilt=NaN,prevUpperDrop=NaN,prevLowerLift=NaN;
  let prevBrowVal=NaN,prevBrowRaise=NaN,prevBrowTilt=NaN;
  let prevOx=NaN,prevOy=NaN;
  const prevLidOuter0=new THREE.Vector3(NaN,NaN,NaN),prevLidOuterMid=new THREE.Vector3(NaN,NaN,NaN);
  const gazeTarget=new THREE.Vector3();
  updates.push(frame=>{
   const pre=expression(frame),close=clamp(frame.face.lidClose,0,1),tilt=pre.tilt*.004*side;
   const smile=Math.max(0,pre.mouth.smile),asym=pre.mouth.asym*side;
   // The lower lid rises with the smiling cheek; the upper lid drapes instead
   // of squeezing both edges symmetrically into a circular inset disc.
   const upperDrop=clamp(.003+Math.max(0,pre.lid)*.023+Math.min(0,pre.lid)*.007+asym*.0015,.0003,.021),lowerLift=clamp(.0008+smile*.006+Math.min(0,pre.lid)*.005+Math.max(0,asym)*.001,-.001,.009);
   const lidOuter0=outerAt(outer[0]),lidOuterMid=outerAt(outer[outer.length>>1]);
   const lidParamsSame=Math.abs(close-prevClose)<=1e-5&&Math.abs(tilt-prevTilt)<=1e-5&&Math.abs(upperDrop-prevUpperDrop)<=1e-5&&Math.abs(lowerLift-prevLowerLift)<=1e-5;
   const lidOuterSame=lidOuter0.equals(prevLidOuter0)&&lidOuterMid.equals(prevLidOuterMid);
   if(!lidParamsSame||!lidOuterSame){
    prevLidOuter0.copy(lidOuter0);prevLidOuterMid.copy(lidOuterMid);
    lid.update(a=>lidPoint(a,close,tilt,upperDrop,lowerLift));
   }
   if(!lidParamsSame){
    prevClose=close;prevTilt=tilt;prevUpperDrop=upperDrop;prevLowerLift=lowerLift;
    lash.write(k=>lidPoint(k*Math.PI,close,tilt,upperDrop,lowerLift));
    flicks.forEach((f,i)=>{const angle=side>0?.14+i*.11:Math.PI-.14-i*.11,length=.0064-i*.00042;f.write(k=>{const p=lidPoint(angle,close,tilt,upperDrop,lowerLift);p.x+=side*length*(k*.82+.18*k*k);p.y+=length*(.32*k+.68*k*k)*(1-close*.72);p.z+=.0009*Math.sin(k*Math.PI);return p;});});
   }
   const browVal=side>0?pre.browL:pre.browR,browRaise=frame.face.browRaise,browTilt=pre.tilt;
   if(!(Math.abs(browVal-prevBrowVal)<=1e-5&&Math.abs(browRaise-prevBrowRaise)<=1e-5&&Math.abs(browTilt-prevBrowTilt)<=1e-5)){
    prevBrowVal=browVal;prevBrowRaise=browRaise;prevBrowTilt=browTilt;
    brow.write(k=>{const nx=k*2-1,x=cx+.029*nx,y=cy+.0365+.0035*(1-nx*nx)+browVal*.005+browRaise*.0025-browTilt*side*nx*.007;const p=sample(x,y).p;p.z+=.0007;return p;});
   }
   eye.updateWorldMatrix(true,false);
   // Keep the sclera stationary: rotating an ellipsoid moves its silhouette
   // through the eyelid. The iris follows the gaze over the fixed eye surface.
   const target=frame.face.lookAt?space.worldToLocal(gazeTarget.set(frame.face.lookAt[0],frame.face.lookAt[1],frame.face.lookAt[2])).sub(eye.position):gazeTarget.set(0,0,1);
   const ox=eyeRx*Math.sin(clamp(Math.atan2(target.x,Math.max(.1,target.z)),-.20,.20)),oy=eyeRy*Math.sin(clamp(Math.atan2(target.y,Math.hypot(target.x,target.z)),-.15,.15));
   if(!(Math.abs(ox-prevOx)<=1e-5&&Math.abs(oy-prevOy)<=1e-5)){
    prevOx=ox;prevOy=oy;
    const ip=iris.geometry.attributes.position;for(let i=0;i<ip.count;i++){const x=irisRest[i*3]+ox,y=irisRest[i*3+1]+oy;ip.setXYZ(i,x,y,eyeDepth*Math.sqrt(Math.max(.02,1-(x/eyeRx)**2-(y/eyeRy)**2))+.0008);}ip.needsUpdate=true;iris.geometry.computeVertexNormals();
   }
  });
 }
 diagnostics.mouthBoundary=mouthOuter.length;
 const mats=new Set<THREE.Material>();for(const object of owned)object.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)for(const a of Array.isArray(m.material)?m.material:[m.material])mats.add(a);});
 for(const m of mats)m.transparent=true;
 return {mouthTarget(frame){const m=mouthState(frame);return space.localToWorld(m.tonguePosition.add(new THREE.Vector3(0,0,.009+m.taste*.009)));},update(frame){root.updateMatrixWorld(true);for(const f of updates)f(frame);for(const m of mats){m.opacity=frame.opacity;m.depthWrite=frame.opacity>.98;}space.updateMatrixWorld(true);},dispose(){space.removeFromParent();for(const object of owned)object.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)m.geometry.dispose();});for(const m of mats)m.dispose();skin.map?.dispose();skin.dispose();lidSkin.map?.dispose();lidSkin.dispose();}};
}
