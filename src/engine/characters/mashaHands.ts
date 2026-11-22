import * as THREE from 'three';

interface HandFrame {
 side:'Left'|'Right';wrist:THREE.Bone;
 long:THREE.Vector3;width:THREE.Vector3;normal:THREE.Vector3;
}
type P=[number,number,number];

/** Measured in normalized actor metres, also used by the contact solver. */
export const MASHA_HAND = {
 palmCenter: .027, palmLength: .031, palmWidth: .028, palmDepth: .012,
 gripLong: .067, gripNormal: .028, stemRadius: .006,
} as const;

/** Short, softly tapered child fingers have separate open, relaxed and grasp
 * shapes. The grasp's pads conform to the actual prop cylinder, rather than
 * merely positioning the wrist socket near a visibly intersecting stick. */
export function createMashaHands(meshes:THREE.SkinnedMesh[],hands:HandFrame[]){
 const roots:THREE.Group[]=[],geometries:THREE.BufferGeometry[]=[],updates:((grip:number,relax:number)=>void)[]=[];
 const material=new THREE.MeshStandardMaterial({color:'#d1b49a',roughness:.72}),cuffMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide,forceSinglePass:true});
 const sssColor=new THREE.Color('#FF6A48');
 material.onBeforeCompile=shader=>{
  shader.uniforms.handSssColor={value:sssColor};
  if(shader.fragmentShader.includes('#include <common>')){
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 handSssColor;');
  }
  if(shader.fragmentShader.includes('#include <emissivemap_fragment>')&&shader.fragmentShader.includes('handSssColor')){
   shader.fragmentShader=shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n{\n  float sssF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));\n  totalEmissiveRadiance += handSssColor * diffuseColor.rgb * (0.02 + 0.14 * sssF * sssF);\n}',
   );
  }
 };
 material.customProgramCacheKey=()=>'masha-hand-skin-sss-v1';
 for(const hand of hands){
  const origin=hand.wrist.getWorldPosition(new THREE.Vector3()),at=([u,v,n]:P)=>origin.clone().addScaledVector(hand.long,u).addScaledVector(hand.width,v).addScaledVector(hand.normal,n);
  for(const mesh of meshes){
   const joint=mesh.skeleton.bones.indexOf(hand.wrist),si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,remove=new Uint8Array(si.count),p=new THREE.Vector3();
   for(let i=0;i<si.count;i++){let weight=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===joint)weight+=sw.getComponent(i,k);if(weight<.35)continue;mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld).sub(origin);if(p.dot(hand.long)>-.004)remove[i]=1;}
   const indices=mesh.geometry.index!.array,keep:number[]=[];for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2];if(remove[a]+remove[b]+remove[c]>=2)continue;keep.push(a,b,c);}mesh.geometry.setIndex(keep);
  }
  const root=new THREE.Group();root.name=`masha:${hand.side.toLowerCase()}-hand-articulated`;root.matrixAutoUpdate=false;root.matrix.copy(hand.wrist.matrixWorld).invert();hand.wrist.add(root);roots.push(root);
  const add=(geometry:THREE.BufferGeometry,name:string)=>{geometries.push(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.name=`masha:${hand.side.toLowerCase()}-${name}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);return mesh;};
  const palm=new THREE.SphereGeometry(1,40,28),transform=new THREE.Matrix4().makeBasis(hand.long,hand.width,hand.normal);transform.scale(new THREE.Vector3(MASHA_HAND.palmLength,MASHA_HAND.palmWidth,MASHA_HAND.palmDepth));transform.setPosition(at([MASHA_HAND.palmCenter,0,0]));palm.applyMatrix4(transform);add(palm,'palm');
  // A short rolled cuff covers the source's irregular cut at the wrist.
  const cuffPositions:number[]=[],cuffColors:number[]=[],cuffIndices:number[]=[],cuffSides=48;
  const cuffRings:[[number,number,number],string][]=[[[ -.016,.026,.017],'#dddcd5'],[[.002,.024,.0155],'#dddcd5'],[[.004,.024,.0155],'#8195a0'],[[.0045,.023,.0148],'#dddcd5'],[[.005,.017,.0085],'#dddcd5']];
  cuffRings.forEach(([[u,w,n],color],j)=>{for(let i=0;i<=cuffSides;i++){const a=i/cuffSides*Math.PI*2;at([u,Math.cos(a)*w,Math.sin(a)*n]).toArray(cuffPositions,cuffPositions.length);new THREE.Color(color).toArray(cuffColors,cuffColors.length);if(j<cuffRings.length-1&&i<cuffSides){const a0=j*(cuffSides+1)+i,b=a0+cuffSides+1;cuffIndices.push(a0,a0+1,b,a0+1,b+1,b);}}});
  const cuff=new THREE.BufferGeometry();cuff.setAttribute('position',new THREE.Float32BufferAttribute(cuffPositions,3));cuff.setAttribute('color',new THREE.Float32BufferAttribute(cuffColors,3));cuff.setIndex(cuffIndices);cuff.computeVertexNormals();geometries.push(cuff);const cuffMesh=new THREE.Mesh(cuff,cuffMaterial);cuffMesh.name=`masha:${hand.side.toLowerCase()}-cuff`;cuffMesh.castShadow=true;root.add(cuffMesh);
  const buildFinger=(open:P[],relaxed:P[],closed:P[],radius:number,name:string)=>{
   const rings=28,sides=20,positions=new Float32Array((rings+1)*(sides+1)*3),indices:number[]=[];
   for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(indices);add(geometry,name);
   const local=new THREE.Vector3();
   return (grip:number,relax:number)=>{
    const points=open.map((p,i)=>at(p.map((x,k)=>THREE.MathUtils.lerp(THREE.MathUtils.lerp(x,relaxed[i][k],relax),closed[i][k],grip)) as P)),curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
    for(let j=0;j<=rings;j++){
     const t=j/rings,p=curve.getPoint(t),tangent=curve.getTangent(t).normalize(),radial=hand.width.clone().addScaledVector(tangent,-hand.width.dot(tangent));if(radial.lengthSq()<.01)radial.copy(hand.normal).addScaledVector(tangent,-hand.normal.dot(tangent));radial.normalize();const normal=new THREE.Vector3().crossVectors(tangent,radial).normalize();
     // Rounded pads with a little proximal fullness; no tubular flat ends.
     const cap=t>.79?Math.sqrt(Math.max(0,1-((t-.79)/.21)**2)):1,r=radius*(1-.16*t+.055*Math.sin(t*Math.PI*2))*cap;
     for(let i=0;i<=sides;i++){
      const a=i/sides*Math.PI*2,v=p.clone().addScaledVector(radial,Math.cos(a)*r).addScaledVector(normal,Math.sin(a)*r*.94);
      if(grip>.98){
       local.copy(v).sub(origin);const u=local.dot(hand.long)-MASHA_HAND.gripLong,n=local.dot(hand.normal)-MASHA_HAND.gripNormal,dist=Math.hypot(u,n),clearance=MASHA_HAND.stemRadius+.00018;
       if(dist<clearance&&dist>1e-8)v.addScaledVector(hand.long,u*(clearance/dist-1)).addScaledVector(hand.normal,n*(clearance/dist-1));
      }
      v.toArray(positions,(j*(sides+1)+i)*3);
     }
    }
    geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();
   };
  };
  const fingers:((grip:number,relax:number)=>void)[]=[];
  for(const [index,[v,length,radius,curl]] of [[-.020,.031,.0075,1.0],[-.0065,.042,.0082,.93],[.008,.045,.0085,.82],[.021,.036,.0078,.72]].entries()){
   const open:P[]=[[.032,v,0],[.042+length*.20,v,-.002],[.042+length*.48,v*1.03,-.004],[.042+length*.76,v*1.04,-.008],[.042+length,v*1.04,-.012]];
   const relaxed:P[]=[[.032,v,0],[.042+length*.20,v,.002],[.042+length*.45,v,.008*curl],[.042+length*.62,v,.018*curl],[.042+length*.61,v,.026*curl]];
   const closed:P[]=[[.032,v,0],[.054,v,.006],[.079,v,.023],[.076,v,.037],[.064,v,.040]];
   fingers.push(buildFinger(open,relaxed,closed,radius,`finger-${index}`));
  }
  fingers.push(buildFinger(
   [[.017,.015,-.001],[.025,.030,0],[.034,.038,.001],[.044,.041,0],[.052,.039,-.001]],
   [[.017,.015,-.001],[.026,.027,.002],[.038,.032,.007],[.049,.031,.012],[.055,.026,.015]],
   [[.017,.015,-.001],[.028,.029,.003],[.041,.030,.016],[.0535,.025,.029],[.058,.018,.032]],.009,'thumb'));
  let lastGrip=-1,lastRelax=-1;updates.push((grip,relax)=>{if(grip===lastGrip&&relax===lastRelax)return;lastGrip=grip;lastRelax=relax;fingers.forEach(f=>f(grip,relax));});
 }
 return {update(grip:number,opacity:number,relax=1){for(const m of [material,cuffMaterial]){m.opacity=opacity;m.transparent=opacity<1;m.depthWrite=opacity>.98;}updates.forEach((f,i)=>f(i===1?grip:0,relax));},dispose(){roots.forEach(r=>r.removeFromParent());geometries.forEach(g=>g.dispose());material.dispose();cuffMaterial.dispose();}};
}
