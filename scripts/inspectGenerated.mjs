import {NodeIO} from '@gltf-transform/core';import * as THREE from 'three';import sharp from 'sharp';
const [source]=process.argv.slice(2);const doc=await new NodeIO().read(source);const points=[];
for(const node of doc.getRoot().listNodes().filter(n=>n.getMesh())){
 const skin=node.getSkin();if(!skin)continue;
 const joints=skin.listJoints();const ibm=skin.getInverseBindMatrices();const matrices=joints.map((j,i)=>new THREE.Matrix4().fromArray(j.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ibm.getElement(i,[]))));
 for(const prim of node.getMesh().listPrimitives()){
  const tex=prim.getMaterial().getBaseColorTexture();const {data,info}=await sharp(tex.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pos=prim.getAttribute('POSITION'),uv=prim.getAttribute('TEXCOORD_0'),idx=prim.getAttribute('JOINTS_0'),wt=prim.getAttribute('WEIGHTS_0');
  for(let i=0;i<pos.getCount();i++){
   const v=new THREE.Vector3().fromArray(pos.getElement(i,[])),p=new THREE.Vector3(),js=idx.getElement(i,[]),ws=wt.getElement(i,[]);
   for(let k=0;k<4;k++)if(ws[k])p.add(v.clone().applyMatrix4(matrices[js[k]]).multiplyScalar(ws[k]));
   const [u,t]=uv.getElement(i,[]);const x=Math.max(0,Math.min(info.width-1,Math.round(u*(info.width-1)))),y=Math.max(0,Math.min(info.height-1,Math.round(t*(info.height-1))));const off=(y*info.width+x)*4;
   points.push({p:p.toArray(),rgb:[data[off],data[off+1],data[off+2]],i});
  }
 }
}
const green=points.filter(({p:[x,y,z],rgb:[r,g,b]})=>y>.65&&y<.9&&z>.05&&g>r*1.3&&g>b*.95&&r<140&&g<180);
const stats=ps=>({count:ps.length,min:[0,1,2].map(k=>Math.min(...ps.map(v=>v.p[k]))),max:[0,1,2].map(k=>Math.max(...ps.map(v=>v.p[k]))),mean:[0,1,2].map(k=>ps.reduce((s,v)=>s+v.p[k],0)/ps.length)});
console.log({all:stats(points),leftGreen:stats(green.filter(p=>p.p[0]>0)),rightGreen:stats(green.filter(p=>p.p[0]<0)), mouth:stats(points.filter(({p:[x,y,z],rgb:[r,g,b]})=>Math.abs(x)<.055&&y>.60&&y<.71&&z>.1&&r>g*1.6&&r>b*1.1))});
