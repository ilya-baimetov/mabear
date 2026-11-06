import * as THREE from 'three';

interface HandFrame {
 side:'Left'|'Right';wrist:THREE.Bone;
 long:THREE.Vector3;width:THREE.Vector3;normal:THREE.Vector3;
}
type P=[number,number,number];

/** Smooth articulated hands replace the generated fused fingertips. The cuff
 * conceals the wrist join; all coordinates use the measured bind hand frame. */
export function createMashaHands(meshes:THREE.SkinnedMesh[],hands:HandFrame[]){
 const roots:THREE.Group[]=[],geometries:THREE.BufferGeometry[]=[],updates:((grip:number)=>void)[]=[];
 const material=new THREE.MeshStandardMaterial({color:'#cbb196',roughness:.74}),cuffMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide});
 for(const hand of hands){
  const origin=hand.wrist.getWorldPosition(new THREE.Vector3()),at=([u,v,n]:P)=>origin.clone().addScaledVector(hand.long,u).addScaledVector(hand.width,v).addScaledVector(hand.normal,n);
  for(const mesh of meshes){
   const joint=mesh.skeleton.bones.indexOf(hand.wrist),si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,remove=new Uint8Array(si.count),p=new THREE.Vector3();
   for(let i=0;i<si.count;i++){let weight=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===joint)weight+=sw.getComponent(i,k);if(weight<.35)continue;mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld).sub(origin);if(p.dot(hand.long)>-.004)remove[i]=1;}
   const indices=mesh.geometry.index!.array,keep:number[]=[];for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2];if(remove[a]+remove[b]+remove[c]>=2)continue;keep.push(a,b,c);}mesh.geometry.setIndex(keep);
  }
  const root=new THREE.Group();root.name=`masha:${hand.side.toLowerCase()}-hand-articulated`;root.matrixAutoUpdate=false;root.matrix.copy(hand.wrist.matrixWorld).invert();hand.wrist.add(root);roots.push(root);
  const add=(geometry:THREE.BufferGeometry)=>{geometries.push(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);return mesh;};
  const palm=new THREE.SphereGeometry(1,32,24),transform=new THREE.Matrix4().makeBasis(hand.long,hand.width,hand.normal);transform.scale(new THREE.Vector3(.032,.031,.012));transform.setPosition(at([.027,0,0]));palm.applyMatrix4(transform);add(palm);
  // A short rolled cuff covers the source's irregular cut at the wrist.
  const cuffPositions:number[]=[],cuffColors:number[]=[],cuffIndices:number[]=[],cuffSides=48;
  const cuffRings:[[number,number,number],string][]=[[[ -.016,.026,.017],'#dddcd5'],[[.002,.024,.0155],'#dddcd5'],[[.004,.024,.0155],'#8195a0'],[[.0045,.023,.0148],'#dddcd5'],[[.005,.017,.0085],'#dddcd5']];
  cuffRings.forEach(([[u,w,n],color],j)=>{for(let i=0;i<=cuffSides;i++){const a=i/cuffSides*Math.PI*2;at([u,Math.cos(a)*w,Math.sin(a)*n]).toArray(cuffPositions,cuffPositions.length);new THREE.Color(color).toArray(cuffColors,cuffColors.length);if(j<cuffRings.length-1&&i<cuffSides){const a0=j*(cuffSides+1)+i,b=a0+cuffSides+1;cuffIndices.push(a0,a0+1,b,a0+1,b+1,b);}}});
  const cuff=new THREE.BufferGeometry();cuff.setAttribute('position',new THREE.Float32BufferAttribute(cuffPositions,3));cuff.setAttribute('color',new THREE.Float32BufferAttribute(cuffColors,3));cuff.setIndex(cuffIndices);cuff.computeVertexNormals();geometries.push(cuff);const cuffMesh=new THREE.Mesh(cuff,cuffMaterial);cuffMesh.castShadow=true;root.add(cuffMesh);
  const buildFinger=(open:P[],closed:P[],radius:number)=>{
   const rings=24,sides=16,positions=new Float32Array((rings+1)*(sides+1)*3),indices:number[]=[];
   for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(indices);add(geometry);
   return (grip:number)=>{
    const points=open.map((p,i)=>at(p.map((x,k)=>THREE.MathUtils.lerp(x,closed[i][k],grip)) as P)),curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
    for(let j=0;j<=rings;j++){
     const t=j/rings,p=curve.getPoint(t),tangent=curve.getTangent(t).normalize(),radial=hand.width.clone().addScaledVector(tangent,-hand.width.dot(tangent));if(radial.lengthSq()<.01)radial.copy(hand.normal).addScaledVector(tangent,-hand.normal.dot(tangent));radial.normalize();const normal=new THREE.Vector3().crossVectors(tangent,radial).normalize();
     const cap=t>.83?Math.sqrt(Math.max(0,1-((t-.83)/.17)**2)):1,r=radius*(1-.20*t)*cap;
     for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2;p.clone().addScaledVector(radial,Math.cos(a)*r).addScaledVector(normal,Math.sin(a)*r).toArray(positions,(j*(sides+1)+i)*3);}
    }
    geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();
   };
  };
  const fingers:((grip:number)=>void)[]=[];
  for(const [v,length,radius] of [[-.022,.040,.007],[-.007,.054,.008],[.009,.058,.0082],[.023,.047,.0074]]){
   const open:P[]=[[.033,v,0],[.043+length*.25,v,.001],[.043+length*.55,v,.002],[.043+length*.80,v,.001],[.043+length,v,0]];
   const size=length/.058,closed:P[]=[[.033,v,0],[.067,v,.006],[.079,v,.023],[.075,v,.037],[.063,v,.039]];
   for(let i=1;i<closed.length;i++)closed[i][0]=.043+(closed[i][0]-.043)*(.8+.2*size);
   fingers.push(buildFinger(open,closed,radius));
  }
  fingers.push(buildFinger([[.018,.017,-.001],[.025,.035,0],[.033,.045,.001],[.041,.051,.002],[.048,.053,.003]],[[.018,.017,-.001],[.029,.032,.002],[.043,.033,.010],[.056,.026,.018],[.063,.018,.023]],.0085));
  let lastGrip=-1;updates.push(grip=>{if(grip===lastGrip)return;lastGrip=grip;fingers.forEach(f=>f(grip));});
 }
 return {update(grip:number,opacity:number,relax=0){for(const m of [material,cuffMaterial]){m.opacity=opacity;m.transparent=opacity<1;m.depthWrite=opacity>.98;}updates.forEach((f,i)=>f(i===1&&grip>0?grip:relax));},dispose(){roots.forEach(r=>r.removeFromParent());geometries.forEach(g=>g.dispose());material.dispose();cuffMaterial.dispose();}};
}
