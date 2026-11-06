import * as THREE from 'three';
import type {ActorFrame} from '../api';
import {EMOTION_PRESETS,mouthShapeFor,type MouthShape} from './face';

// A local retopology pass over the generated model: replace the closed facial
// surface with continuous skin rings, real eye openings and a recessed mouth.
// All authoring coordinates are metres in the normalized bind-pose actor space.
type Point={p:THREE.Vector3;uv:THREE.Vector2;index?:number};
type Region={cx:number;cy:number;rx:number;ry:number};
type Ring={mesh:THREE.Mesh;angles:number[];update:(inner:(angle:number)=>THREE.Vector3)=>void};
const clamp=THREE.MathUtils.clamp;
const mix=THREE.MathUtils.lerp;
const smooth=(x:number)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const key=(p:THREE.Vector3)=>`${Math.round(p.x*1e5)},${Math.round(p.y*1e5)},${Math.round(p.z*1e5)}`;

function bindPoints(mesh:THREE.SkinnedMesh):Point[]{
 const pos=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
 return Array.from({length:pos.count},(_,i)=>({p:mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),uv:new THREE.Vector2(uv.getX(i),uv.getY(i)),index:i}));
}

/** Project normalized xy onto the original textured surface. A small spatial
 * index avoids raycasting the entire character for every retopology vertex. */
function surfaceSampler(points:Point[],indices:number[]){
 const cells=new Map<string,number[]>(),step=.008;
 for(let n=0;n<indices.length;n+=3){
  const ps=indices.slice(n,n+3).map(i=>points[i].p);
  if(ps.some(p=>p.z<.09)||Math.max(...ps.map(p=>p.y))<.58||Math.min(...ps.map(p=>p.y))>.84||Math.min(...ps.map(p=>p.x))>.15||Math.max(...ps.map(p=>p.x))<-.15)continue;
  const minX=Math.floor(Math.min(...ps.map(p=>p.x))/step),maxX=Math.floor(Math.max(...ps.map(p=>p.x))/step),minY=Math.floor(Math.min(...ps.map(p=>p.y))/step),maxY=Math.floor(Math.max(...ps.map(p=>p.y))/step);
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const k=`${x},${y}`,a=cells.get(k)??[];a.push(n);cells.set(k,a);}
 }
 return (x:number,y:number):Point=>{
  let best:Point|undefined;
  for(const n of cells.get(`${Math.floor(x/step)},${Math.floor(y/step)}`)??[]){
   const [a,b,c]=indices.slice(n,n+3).map(i=>points[i]);
   const den=(b.p.y-c.p.y)*(a.p.x-c.p.x)+(c.p.x-b.p.x)*(a.p.y-c.p.y);if(Math.abs(den)<1e-12)continue;
   const u=((b.p.y-c.p.y)*(x-c.p.x)+(c.p.x-b.p.x)*(y-c.p.y))/den,v=((c.p.y-a.p.y)*(x-c.p.x)+(a.p.x-c.p.x)*(y-c.p.y))/den,w=1-u-v;
   if(Math.min(u,v,w)<-.0001)continue;const z=a.p.z*u+b.p.z*v+c.p.z*w;
   if(!best||z>best.p.z)best={p:new THREE.Vector3(x,y,z),uv:a.uv.clone().multiplyScalar(u).addScaledVector(b.uv,v).addScaledVector(c.uv,w)};
  }
  if(best)return best;
  let nearest=points[0],d=Infinity;
  for(let ox=-2;ox<=2;ox++)for(let oy=-2;oy<=2;oy++)for(const n of cells.get(`${Math.floor(x/step)+ox},${Math.floor(y/step)+oy}`)??[]){
   for(let j=0;j<3;j++){const point=points[indices[n+j]];if(point.p.z<.09)continue;const e=(point.p.x-x)**2+(point.p.y-y)**2;if(e<d){d=e;nearest=point;}}
  }
  return {p:new THREE.Vector3(x,y,nearest.p.z),uv:nearest.uv.clone()};
 };
}

function cutRegion(mesh:THREE.SkinnedMesh,points:Point[],r:Region,contains?:(x:number,y:number)=>boolean):Point[]{
 const old=Array.from(mesh.geometry.index!.array),kept:number[][]=[],edges=new Map<string,{a:number;b:number;count:number}>();
 const keys=points.map(point=>key(point.p)),edgeKey=(a:number,b:number)=>keys[a]<keys[b]?`${keys[a]}|${keys[b]}`:`${keys[b]}|${keys[a]}`;
 const candidates:number[][]=[],outside:number[][]=[];
 for(let n=0;n<old.length;n+=3){
  const ids=old.slice(n,n+3),ps=ids.map(i=>points[i].p),x=ps.reduce((s,p)=>s+p.x,0)/3,y=ps.reduce((s,p)=>s+p.y,0)/3;
  const inside=ps.every(p=>p.z>.09)&&(contains?contains(x,y):((x-r.cx)/r.rx)**2+((y-r.cy)/r.ry)**2<1);
  (inside?candidates:outside).push(ids);
 }
 // Cut only the connected facial surface, not nearby disconnected lashes or
 // hair slivers that happen to project into the same 2D region.
 const parent=candidates.map((_,i)=>i),owner=new Map<string,number>();
 const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 candidates.forEach((ids,i)=>ids.forEach(id=>{const k=key(points[id].p),prior=owner.get(k);if(prior!==undefined)parent[find(i)]=find(prior);else owner.set(k,i);}));
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
 const positions=new Float32Array(rest.length*3);rest.forEach((p,i)=>{p.toArray(positions,i*3);const t=faceUV(p.x,p.y);uv.push(t.x,t.y);});const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const mat=material.clone() as THREE.MeshStandardMaterial;mat.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;
 return {mesh,angles,update(next){
  const edgePositions=outer.map(outerAt);for(let i=0;i<outer.length;i++)edgePositions[i].toArray(positions,i*3);
  for(let i=0;i<count;i++){
   const delta=next(angles[i]).sub(base[i]),edge=edgePositions[active[i]].clone().sub(outer[active[i]].p);
   for(let j=1;j<=rows;j++){
    const t=j/rows,w=smooth(t),index=vertex(j,i),p=rest[index].clone();
    // Linear planar interpolation cannot overshoot into an adjacent row when
    // the mouth opens wide. Depth keeps the original smooth lip deformation.
    p.x+=delta.x*t+edge.x*(1-t);p.y+=delta.y*t+edge.y*(1-t);p.z+=delta.z*w+edge.z*(1-w);p.toArray(positions,index*3);
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
 const mat=material.clone() as THREE.MeshStandardMaterial;mat.side=THREE.DoubleSide;const mesh=new THREE.Mesh(geom,mat);mesh.frustumCulled=false;mesh.receiveShadow=true;
 const workingPoint=new THREE.Vector3();
 return {mesh,angles,update(next){
  for(let i=0;i<outer.length;i++)outerAt(outer[i]).toArray(positions,i*3);
  for(let i=0;i<count;i++){const delta=next(angles[i]).sub(innerRest[i]);for(let j=0;j<=rows;j++){const index=offset+j*count+i,p=workingPoint.copy(rest[index]).addScaledVector(delta,smooth(j/rows));if(project&&j>0&&j<rows)project(p);p.toArray(positions,index*3);}}
  geom.attributes.position.needsUpdate=true;updateNormals();
 }};
}

/** Paint only the removed eye/lash surface, preserving the exact source colour
 * along its irregular seam. Clean forehead/temple samples avoid turning the
 * whole eyelid into the source cheek's pink blush. */
function cleanEyeTexture(source:THREE.CanvasTexture,target:THREE.CanvasTexture,outer:Point[],cx:number,cy:number,side:number){
 const original=source.image as HTMLCanvasElement,canvas=target.image as HTMLCanvasElement,ctx=canvas.getContext('2d')!,width=canvas.width,height=canvas.height;
 const raw=original.getContext('2d')!.getImageData(0,0,width,height).data,out=ctx.getImageData(0,0,width,height);
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

function irisGeometry(rx:number,ry:number,depth:number){
 const pos:number[]=[],colors:number[]=[],idx:number[]=[],radial=12,segments=64;
 const green=new THREE.Color('#2c7755'),light=new THREE.Color('#609570'),dark=new THREE.Color('#12372b'),pupil=new THREE.Color('#071312');
 for(let r=0;r<=radial;r++)for(let s=0;s<=segments;s++){
  const u=r/radial,a=s/segments*Math.PI*2,x=Math.cos(a)*.0185*u,y=Math.sin(a)*.0185*u;
  pos.push(x,y,depth*Math.sqrt(Math.max(0,1-(x/rx)**2-(y/ry)**2))+.0006);
  const streak=.5+.2*Math.sin(a*49)+.16*Math.sin(a*93+.9)+.14*Math.sin(a*21+u*7);
  const c=u<.50?pupil.clone():green.clone().lerp(light,streak*.65).lerp(dark,smooth((u-.86)/.14));c.toArray(colors,colors.length);
  if(r<radial&&s<segments){const k=r*(segments+1)+s;idx.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function dynamicLine(count:number,material:THREE.Material,width:number){
 const g=new THREE.BufferGeometry(),p=new Float32Array(count*2*3),idx:number[]=[];
 for(let i=0;i<count-1;i++)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
 g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(idx);const mesh=new THREE.Mesh(g,material);mesh.frustumCulled=false;
 return {mesh,write(fn:(t:number)=>THREE.Vector3){for(let i=0;i<count;i++){const v=fn(i/(count-1)),w=width*Math.max(0,Math.sin(Math.PI*i/(count-1)))**.4;v.clone().add(new THREE.Vector3(0,w,.0005)).toArray(p,i*6);v.clone().add(new THREE.Vector3(0,-w,.0005)).toArray(p,i*6+3);}g.attributes.position.needsUpdate=true;g.computeVertexNormals();}};
}

function bakeFaceTexture(source:THREE.MeshStandardMaterial,sample:ReturnType<typeof surfaceSampler>,cleanEyes=false){
 const image=source.map!.image as ImageBitmap,input=document.createElement('canvas');input.width=image.width;input.height=image.height;const ctx=input.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,input.width,input.height).data;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const out=canvas.getContext('2d')!,pixels=out.createImageData(512,512);
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const s=sample(x/511*.32-.16,y/511*.29+.56),u=clamp(Math.round(s.uv.x*(input.width-1)),0,input.width-1),v=clamp(Math.round(s.uv.y*(input.height-1)),0,input.height-1),from=(v*input.width+u)*4,to=(y*512+x)*4;
  pixels.data.set(data.subarray(from,from+4),to);
  if(cleanEyes)for(const [cx,cy] of [[.0556,.7374],[-.053,.7449]]){
   const px=x/511*.32-.16,py=y/511*.29+.56,side=Math.sign(cx),r=Math.hypot((px-cx)/(side*(px-cx)>0?.067:.049),(py-cy)/(py>cy?.055:.049)),weight=1-smooth((r-1.03)/.22);
   if(weight>0){const clean=sample(clamp(px,cx-.035,cx+.035),cy-.054),su=clamp(Math.round(clean.uv.x*(input.width-1)),0,input.width-1),sv=clamp(Math.round(clean.uv.y*(input.height-1)),0,input.height-1),offset=(sv*input.width+su)*4;for(let c=0;c<3;c++)pixels.data[to+c]=mix(pixels.data[to+c],data[offset+c],weight);}
  }
 }
 out.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 const material=source.clone();material.map=texture;material.normalMap=null;material.roughnessMap=null;material.metalnessMap=null;material.aoMap=null;material.side=THREE.DoubleSide;return material;
}

function expression(frame:ActorFrame){
 const target=EMOTION_PRESETS[frame.face.emotion],transition=frame.face.emotionTransition;if(!transition)return target;
 const from=EMOTION_PRESETS[transition.from],w=smooth(transition.progress);
 return {...target,browL:mix(from.browL,target.browL,w),browR:mix(from.browR,target.browR,w),tilt:mix(from.tilt,target.tilt,w),lid:mix(from.lid,target.lid,w)};
}
function mouthExpression(frame:ActorFrame):MouthShape{
 const f=frame.face,target=mouthShapeFor(f.emotion,f.viseme,f.visemeWeight),transition=f.emotionTransition;if(!transition)return target;
 const from=mouthShapeFor(transition.from,f.viseme,f.visemeWeight),w=smooth(transition.progress);for(const key of Object.keys(target) as (keyof MouthShape)[])target[key]=mix(from[key],target[key],w);return target;
}
export interface MashaPerformance { update(frame:ActorFrame):void; mouthTarget(frame:ActorFrame):THREE.Vector3; dispose():void; }
export function createMashaPerformance(meshes:THREE.SkinnedMesh[],bones:Record<string,THREE.Bone>,root:THREE.Object3D):MashaPerformance{
 const head=bones.Head,space=new THREE.Group();space.name='masha:articulated-face';space.matrixAutoUpdate=false;space.matrix.copy(head.matrixWorld).invert();head.add(space);
 const updates:((frame:ActorFrame)=>void)[]=[],owned:THREE.Object3D[]=[];
 const add=(o:THREE.Object3D)=>{space.add(o);owned.push(o);};
 const faceMesh=meshes.reduce((a,b)=>a.geometry.attributes.position.count>b.geometry.attributes.position.count?a:b);
 const points=bindPoints(faceMesh),indices=Array.from(faceMesh.geometry.index!.array),sample=surfaceSampler(points,indices),originalSkin=(Array.isArray(faceMesh.material)?faceMesh.material[0]:faceMesh.material) as THREE.MeshStandardMaterial;
 const skin=bakeFaceTexture(originalSkin,sample),lidSkin=bakeFaceTexture(originalSkin,sample,true);
 const outerAt=(point:Point)=>space.worldToLocal(faceMesh.getVertexPosition(point.index!,new THREE.Vector3()).applyMatrix4(faceMesh.matrixWorld));
 const diagnostics:Record<string,unknown>={type:'articulated facial surface',sourceVertices:points.length};root.userData.performance=diagnostics;

 // Mouth: the outer edge remains stitched to the original mesh. An inner
 // boundary opens into an actual recessed cavity with separate teeth and tongue.
 const mr={cx:-.001,cy:.651,rx:.081,ry:.039};
 const mouthOuter=cutRegion(faceMesh,points,mr);
 const baseMouth=(a:number)=>{const x=mr.cx+.056*Math.cos(a),y=mr.cy+.010*Math.cos(a)**2+.0014*Math.sin(a);return sample(x,y).p;};
 const lips=mouthSkin(mouthOuter,mr,sample,skin,baseMouth,outerAt);lips.mesh.name='masha:mouth-skin';add(lips.mesh);
 const count=lips.angles.length,cavityGeom=new THREE.BufferGeometry(),cavityPos=new Float32Array((count*2+1)*3),cavityCol=new Float32Array((count*2+1)*3),ci:number[]=[];
 for(let i=0;i<count;i++){const j=(i+1)%count;ci.push(i,j,count+i,j,count+j,count+i,count+i,count+j,count*2);new THREE.Color('#6e2830').toArray(cavityCol,i*3);new THREE.Color('#240f18').toArray(cavityCol,(count+i)*3);}new THREE.Color('#180b12').toArray(cavityCol,count*6);
 cavityGeom.setAttribute('position',new THREE.BufferAttribute(cavityPos,3));cavityGeom.setAttribute('color',new THREE.BufferAttribute(cavityCol,3));cavityGeom.setIndex(ci);
 const cavity=new THREE.Mesh(cavityGeom,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));cavity.name='masha:mouth-cavity';cavity.frustumCulled=false;add(cavity);
 const teeth=new THREE.Group(),toothMat=new THREE.MeshStandardMaterial({color:'#e5d9c4',roughness:.78});
 // Flat-fronted incisors with softly rounded lower corners. Their roots sit
 // behind the upper lip, so the visible shape is a short edge, not two beads.
 const toothShape=new THREE.Shape();toothShape.moveTo(-.0057,.006);toothShape.lineTo(.0057,.006);toothShape.lineTo(.0057,-.004);toothShape.quadraticCurveTo(.0057,-.0057,.0038,-.0057);toothShape.lineTo(-.0038,-.0057);toothShape.quadraticCurveTo(-.0057,-.0057,-.0057,-.004);toothShape.closePath();
 for(const s of [-1,1]){const tooth=new THREE.Mesh(new THREE.ExtrudeGeometry(toothShape,{depth:.0025,bevelEnabled:true,bevelSize:.0005,bevelThickness:.0004,bevelSegments:2,curveSegments:6,steps:1}),toothMat);tooth.position.x=s*.0066;tooth.rotation.y=-s*.04;teeth.add(tooth);}add(teeth);
 const tongue=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),new THREE.MeshStandardMaterial({color:'#b86b75',roughness:.58}));tongue.scale.set(.021,.004,.009);add(tongue);
 const mouthState=(frame:ActorFrame)=>{
  const state=mouthExpression(frame);
  // Subtle emotional rest shapes; pronunciation has the wider articulation range.
  const speaking=frame.face.viseme!=='rest'&&frame.face.visemeWeight>.05,open=clamp(state.open*(speaking?1:.68),0,1),w=clamp(state.w*(1-state.round*.20),.43,1.12),smile=state.smile;
  const half=.0014+open*(.020+state.round*.008),mid=mr.cy-open*.011;
  const inner=(a:number)=>{
   const nx=Math.cos(a),x=mr.cx+.056*w*nx,y=mid+.011*(.35+smile*.8)*nx*nx+half*Math.sin(a)+state.asym*.003*nx;
   const original=sample(mr.cx+.056*nx,mr.cy+.010*nx*nx+.0014*Math.sin(a));
   return new THREE.Vector3(x,y,original.p.z+state.round*.004-open*.002*(Math.sin(a)<0?1:0));
  };
  const centre=sample(mr.cx,mr.cy).p,taste=frame.verb==='eat'&&frame.holding==='lollipop'?smooth((((1-Math.cos((frame.action?.time??0)/3*Math.PI*2))*.5)-.85)/.15):0;
  return {state,open,w,half,mid,inner,centre,taste,tonguePosition:new THREE.Vector3(mr.cx,mid-half+.004,centre.z-.010+taste*.009)};
 };
 updates.push(frame=>{
  const {state,open,w,half,mid,inner,centre,tonguePosition,taste}=mouthState(frame);lips.update(inner);
  for(let i=0;i<count;i++){const v=inner(lips.angles[i]);v.toArray(cavityPos,i*3);new THREE.Vector3(mix(v.x,mr.cx,.12),mix(v.y,mid,.12),v.z-.018).toArray(cavityPos,(count+i)*3);}
  new THREE.Vector3(mr.cx,mid,centre.z-.033).toArray(cavityPos,count*6);cavityGeom.attributes.position.needsUpdate=true;
  teeth.visible=open>.12&&state.teeth>.08;teeth.position.set(mr.cx,mid+half+.0007,centre.z-.007);teeth.scale.setScalar(.9+.1*state.teeth);
  tongue.visible=open>.22;tongue.position.copy(tonguePosition);tongue.scale.x=.021*w;tongue.scale.z=.009+taste*.009;
  diagnostics.mouthOpen=open;
 });

 // Replace each baked eye with a real gaze pivot and a skin eyelid aperture.
 for(const [side,cx,cy] of [[1,.0556,.7374],[-1,-.053,.7449]]){
  const er={cx,cy,rx:.049,ry:.049};
  // The source lash fan reaches farther toward the temple than the eye itself.
  // Include that fan without raising the whole cut into the fringe or nose.
  const outer=cutRegion(faceMesh,points,er,(x,y)=>((x-cx)/(side*(x-cx)>0?.067:.049))**2+((y-cy)/(y>cy?.055:.049))**2<1),front=sample(cx,cy).p.z-.001;
  cleanEyeTexture(skin.map as THREE.CanvasTexture,lidSkin.map as THREE.CanvasTexture,outer,cx,cy,side);
  const eyeRx=.037,eyeRy=.034,eyeDepth=.023;
  const eye=new THREE.Group();eye.name=side>0?'masha:left-eye':'masha:right-eye';eye.position.set(cx,cy,front-eyeDepth);add(eye);
  const eyeball=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.MeshPhysicalMaterial({color:'#fff9eb',roughness:.24,clearcoat:.8,clearcoatRoughness:.12}));eyeball.scale.set(eyeRx,eyeRy,eyeDepth);eye.add(eyeball);
  const iris=new THREE.Mesh(irisGeometry(eyeRx,eyeRy,eyeDepth),new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.22,clearcoat:1,clearcoatRoughness:.1}));eye.add(iris);
  const lidPoint=(a:number,close=0,tilt=0)=>{
   const x=.0345*Math.cos(a),y=.0295*Math.sin(a)*(1-close)-close*.004+tilt*Math.cos(a);
   const z=front-eyeDepth+eyeDepth*Math.sqrt(Math.max(.02,1-(x/eyeRx)**2-(y/eyeRy)**2))+.0011;
   return new THREE.Vector3(cx+x,cy+y,z);
  };
  // Sample clean cheek skin for the moving lid, rather than stretching the
  // generated texture's painted lashes over a closed eye.
  const boundaryNormals=outer.map(point=>new THREE.Vector3().fromBufferAttribute(faceMesh.geometry.attributes.normal,point.index!).transformDirection(faceMesh.matrixWorld));
  const lid=skinRing(outer,er,sample,lidSkin,a=>lidPoint(a),outerAt,p=>{const d=((p.x-cx)/eyeRx)**2+((p.y-cy)/eyeRy)**2;if(d<1){const cover=front-eyeDepth+eyeDepth*Math.sqrt(1-d)+.0012,delta=p.z-cover;p.z=(p.z+cover+Math.sqrt(delta*delta+.00000225))*.5;}},boundaryNormals);lid.mesh.name='masha:eyelid-skin';add(lid.mesh);
  const irisRest=iris.geometry.attributes.position.array.slice();
  const lashMat=new THREE.MeshStandardMaterial({color:'#63432f',roughness:.7,side:THREE.DoubleSide});
  const lash=dynamicLine(48,lashMat,.001);add(lash.mesh);
  const flicks=Array.from({length:5},()=>dynamicLine(10,lashMat,.00065));for(const f of flicks)add(f.mesh);
  const brow=dynamicLine(32,new THREE.MeshStandardMaterial({color:'#a57c50',roughness:1,side:THREE.DoubleSide}),.0015);add(brow.mesh);
  updates.push(frame=>{
   const pre=expression(frame),base=clamp(.04+pre.lid*.6,0,.5),close=clamp(base+(1-base)*frame.face.lidClose,0,.995),tilt=pre.tilt*.003*side;
   lid.update(a=>lidPoint(a,close,tilt));lash.write(k=>lidPoint(k*Math.PI,close,tilt));
   flicks.forEach((f,i)=>{const angle=side>0?.18+i*.16:Math.PI-.18-i*.16;f.write(k=>{const p=lidPoint(angle,close,tilt);return p.add(new THREE.Vector3(side*.004*k,.0045*k*(1-close*.7),.0015*Math.sin(k*Math.PI)));});});
   brow.write(k=>{const nx=k*2-1,x=cx+.030*nx,y=cy+.042+.004*(1-nx*nx)+(side>0?pre.browL:pre.browR)*.006+frame.face.browRaise*.003-pre.tilt*side*nx*.007;const p=sample(x,y).p;p.z+=.001;return p;});
   eye.updateWorldMatrix(true,false);
   // Keep the sclera stationary: rotating an ellipsoid moves its silhouette
   // through the eyelid. The iris follows the gaze over the fixed eye surface.
   const target=frame.face.lookAt?space.worldToLocal(new THREE.Vector3(...frame.face.lookAt)).sub(eye.position):new THREE.Vector3(0,0,1);
   const ox=eyeRx*Math.sin(clamp(Math.atan2(target.x,Math.max(.1,target.z)),-.20,.20)),oy=eyeRy*Math.sin(clamp(Math.atan2(target.y,Math.hypot(target.x,target.z)),-.15,.15));
   const ip=iris.geometry.attributes.position;for(let i=0;i<ip.count;i++){const x=irisRest[i*3]+ox,y=irisRest[i*3+1]+oy;ip.setXYZ(i,x,y,eyeDepth*Math.sqrt(Math.max(.02,1-(x/eyeRx)**2-(y/eyeRy)**2))+.0008);}ip.needsUpdate=true;iris.geometry.computeVertexNormals();
  });
 }
 diagnostics.mouthBoundary=mouthOuter.length;
 const mats=new Set<THREE.Material>();for(const object of owned)object.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)for(const a of Array.isArray(m.material)?m.material:[m.material])mats.add(a);});
 return {mouthTarget(frame){const m=mouthState(frame);return space.localToWorld(m.tonguePosition.add(new THREE.Vector3(0,0,.009+m.taste*.009)));},update(frame){root.updateMatrixWorld(true);for(const f of updates)f(frame);for(const m of mats){m.opacity=frame.opacity;m.transparent=frame.opacity<1;m.depthWrite=frame.opacity>.98;}space.updateMatrixWorld(true);},dispose(){space.removeFromParent();for(const object of owned)object.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)m.geometry.dispose();});for(const m of mats)m.dispose();skin.map?.dispose();skin.dispose();lidSkin.map?.dispose();lidSkin.dispose();}};
}
