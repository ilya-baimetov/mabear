import * as THREE from 'three';

/** Safe guard for headless Node tests (including partial pixel-only canvas shims). */
function canCreateCanvas():boolean {
 if(typeof document==='undefined')return false;
 const canvas=document.createElement('canvas');
 const ctx=canvas.getContext('2d') as Partial<CanvasRenderingContext2D>|null;
 return !!ctx&&typeof ctx.fillRect==='function';
}

function makeCanvasTexture(
 width:number,
 height:number,
 draw:(ctx:CanvasRenderingContext2D)=>void,
 repeat=true,
 colorSpace:THREE.ColorSpace=THREE.SRGBColorSpace,
):THREE.CanvasTexture|null {
 if(!canCreateCanvas())return null;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)return null;draw(ctx);
 const tex=new THREE.CanvasTexture(canvas);
 tex.colorSpace=colorSpace;
 tex.wrapS=tex.wrapT=repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
 tex.anisotropy=8;
 return tex;
}

const mapDisposers = new WeakSet<THREE.Material>();

function attachMapDisposal(material:THREE.Material):void {
 if(mapDisposers.has(material))return;
 mapDisposers.add(material);
 material.addEventListener('dispose',()=>{
  const std=material as THREE.MeshStandardMaterial;
  for(const tex of new Set([std.map,std.normalMap,std.roughnessMap,std.emissiveMap])){
   tex?.dispose();
  }
 });
}

function hash01(x:number,y:number,seed=1):number {
 const n=Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453123;
 return n-Math.floor(n);
}

/** Seamless periodic 2D value noise over u,v in [0,1). */
function periodicNoise(u:number,v:number,freqX:number,freqY:number,seed=1):number {
 const fx=((u%1+1)%1)*freqX,fy=((v%1+1)%1)*freqY;
 const x0=Math.floor(fx),y0=Math.floor(fy);
 const tx=fx-x0,ty=fy-y0;
 const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
 const x1=(x0+1)%freqX,y1=(y0+1)%freqY;
 const n00=hash01(x0,y0,seed),n10=hash01(x1,y0,seed);
 const n01=hash01(x0,y1,seed),n11=hash01(x1,y1,seed);
 return (n00*(1-sx)+n10*sx)*(1-sy)+(n01*(1-sx)+n11*sx)*sy;
}

/** Generate a seamless tangent-space normal DataTexture from h(u,v) in UV space. */
function makeNormalTexture(
 width:number,
 height:number,
 heightAt:(u:number,v:number)=>number,
 strength:number,
 repeat=true,
):THREE.DataTexture|null {
 if(!canCreateCanvas())return null;
 const grid=new Float32Array(width*height);
 for(let y=0;y<height;y++){
  const v=(y+.5)/height;
  for(let x=0;x<width;x++)grid[y*width+x]=heightAt((x+.5)/width,v);
 }
 const data=new Uint8Array(width*height*4);
 const sample=(ix:number,iy:number)=>{
  const x=repeat?((ix%width)+width)%width:Math.max(0,Math.min(width-1,ix));
  const y=repeat?((iy%height)+height)%height:Math.max(0,Math.min(height-1,iy));
  return grid[y*width+x];
 };
 for(let y=0;y<height;y++){
  for(let x=0;x<width;x++){
   const dx=(sample(x+1,y)-sample(x-1,y))*strength;
   const dy=(sample(x,y+1)-sample(x,y-1))*strength;
   const invLen=1/Math.hypot(dx,dy,1);
   const idx=(y*width+x)*4;
   data[idx]=Math.round((-dx*invLen*.5+.5)*255);
   data[idx+1]=Math.round((-dy*invLen*.5+.5)*255);
   data[idx+2]=Math.round((invLen*.5+.5)*255);
   data[idx+3]=255;
  }
 }
 const tex=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
 tex.colorSpace=THREE.NoColorSpace;
 tex.wrapS=tex.wrapT=repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
 tex.magFilter=THREE.LinearFilter;
 tex.minFilter=THREE.LinearMipmapLinearFilter;
 tex.generateMipmaps=true;
 tex.anisotropy=8;
 tex.needsUpdate=true;
 return tex;
}

function makeRoughnessTexture(
 width:number,
 height:number,
 roughAt:(u:number,v:number)=>number,
 repeat=true,
):THREE.DataTexture|null {
 if(!canCreateCanvas())return null;
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++){
  const v=(y+.5)/height;
  for(let x=0;x<width;x++){
   const byte=Math.max(0,Math.min(255,Math.round(roughAt((x+.5)/width,v)*255)));
   const idx=(y*width+x)*4;
   data[idx]=data[idx+1]=data[idx+2]=byte;data[idx+3]=255;
  }
 }
 const tex=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
 tex.colorSpace=THREE.NoColorSpace;
 tex.wrapS=tex.wrapT=repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
 tex.magFilter=THREE.LinearFilter;
 tex.minFilter=THREE.LinearMipmapLinearFilter;
 tex.generateMipmaps=true;
 tex.needsUpdate=true;
 return tex;
}

/** Small, local illustrations: no captured episode frame is shipped as a texture. */
function canvasMaterial(width:number,height:number,draw:(ctx:CanvasRenderingContext2D)=>void,repeat=false):THREE.MeshStandardMaterial|null {
 const map=makeCanvasTexture(width,height,draw,repeat);
 if(!map)return null;
 const material=new THREE.MeshStandardMaterial({map,roughness:.96});material.userData.setOwned=true;
 attachMapDisposal(material);
 return material;
}

export function paintedPanelMaterial():THREE.MeshStandardMaterial {
 const material=canvasMaterial(256,512,ctx=>{
  ctx.fillStyle='#e3e1d8';ctx.fillRect(0,0,256,512);
  for(let i=0;i<100;i++){
   const seed=Math.sin(i*83.71)*43874.21,x=(seed-Math.floor(seed))*256;
   ctx.strokeStyle=i%3?'rgba(81,89,70,.055)':'rgba(255,254,239,.10)';ctx.lineWidth=.5+i%3*.5;ctx.beginPath();ctx.moveTo(x,0);
   for(let y=0;y<=512;y+=24)ctx.lineTo(x+Math.sin(y*.013+i)*1.8,y);ctx.stroke();
  }
  // Subtle vertical beadboard seam highlights matching the 10-board 1.4m normal map.
  const boards=10;
  for(let b=0;b<boards;b++){
   const bx=(b/boards)*256;
   ctx.fillStyle='rgba(55,66,48,.12)';ctx.fillRect(bx,0,3,512);
   ctx.fillStyle='rgba(255,254,242,.08)';ctx.fillRect((bx+3)%256,0,2,512);
  }
 },true);
 const result=material??new THREE.MeshStandardMaterial();
 if(!material)attachMapDisposal(result);
 result.vertexColors=true;result.roughness=.9;result.userData.setOwned=true;
 return result;
}

/** Vertical tongue-and-groove wainscot board normal map (10 boards per 1.4m UV tile). */
export function wainscotBoardNormal():THREE.DataTexture|null {
 const boards=10;
 return makeNormalTexture(256,256,(u,v)=>{
  const p=(u*boards)%1;
  const dist=Math.min(p,1-p);
  const groove=dist<.085?-Math.pow(1-dist/.085,1.6)*.85:0;
  const bead=p>.085&&p<.17?Math.sin(((p-.085)/.085)*Math.PI)*.16:0;
  const grain=periodicNoise(u,v,32,6,19)*.05;
  return groove+bead+grain;
 },1.8,true);
}

/** Subtle matte paper-grain bump normal map for wallpapered walls. */
export function paperGrainNormal():THREE.DataTexture|null {
 return makeNormalTexture(256,256,(u,v)=>{
  const coarse=periodicNoise(u,v,12,12,7)*.45;
  const fiber=periodicNoise(u,v,32,20,13)*.35;
  const fine=periodicNoise(u,v,48,48,29)*.20;
  return coarse+fiber+fine;
 },.65,true);
}

export function bicycleWallpaper():THREE.MeshStandardMaterial|null {
 const material=canvasMaterial(512,512,ctx=>{
  ctx.fillStyle='#78836e';ctx.fillRect(0,0,512,512);
  // Low-frequency paper mottling: subpixel speckles shimmer as the camera moves.
  for(let i=0;i<45;i++){const n=Math.sin(i*83.31)*43758.5453,f=n-Math.floor(n);ctx.fillStyle=`rgba(221,218,189,${.01+f*.012})`;ctx.beginPath();ctx.ellipse((i*137)%512,(i*71)%512,35+(i%4)*9,60+(i%3)*15,.4,0,Math.PI*2);ctx.fill();}
  for(const [x,y,s,light] of [[55,92,.8,1],[308,64,.7,0],[157,266,.72,0],[403,354,.83,1],[45,454,.65,0]]){
   ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.strokeStyle=light?'rgba(210,209,172,.33)':'rgba(54,65,46,.29)';ctx.lineWidth=2.1;
   for(const cx of [0,76]){ctx.beginPath();ctx.arc(cx,0,25,0,Math.PI*2);ctx.stroke();for(let j=0;j<12;j++){const a=j*Math.PI/6;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx+Math.cos(a)*25,Math.sin(a)*25);ctx.stroke();}}
   ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(26,-34);ctx.lineTo(42,0);ctx.closePath();ctx.lineTo(65,-36);ctx.lineTo(76,0);ctx.moveTo(26,-34);ctx.lineTo(65,-36);ctx.moveTo(20,-39);ctx.lineTo(35,-39);ctx.moveTo(65,-36);ctx.lineTo(62,-49);ctx.lineTo(74,-52);ctx.moveTo(42,0);ctx.lineTo(48,7);ctx.lineTo(55,7);ctx.stroke();ctx.restore();
  }
 },true);
 if(material){
  const normalMap=paperGrainNormal();
  if(normalMap){material.normalMap=normalMap;material.normalScale.set(.26,.26);}
 }
 return material;
}

/** Warm honey-oak plank floorboards with groove normal map and satin-worn roughness (0.60–0.82). */
export function floorboardMaterial():THREE.MeshStandardMaterial {
 const rows=8;
 const plankJoints=[.18,.63,.41,.85,.27,.72,.11,.54];
 const plankHeight=(u:number,v:number)=>{
  const r=Math.floor(((v%1+1)%1)*rows);
  const lv=((v%1+1)%1)*rows-r;
  const joint=plankJoints[r];
  const lu=((u-joint)%1+1)%1;
  const seamV=Math.min(lv,1-lv);
  const seamU=Math.min(lu,1-lu);
  const bevelV=seamV<.055?Math.pow(1-seamV/.055,1.5)*.9:0;
  const bevelU=seamU<.018?Math.pow(1-seamU/.018,1.5)*.75:0;
  const grain=periodicNoise(u,v,6,36,41+r*3)*.12+periodicNoise(u,v,14,64,71)*.06;
  return -Math.max(bevelV,bevelU)+grain;
 };
 const map=makeCanvasTexture(512,512,ctx=>{
  ctx.fillStyle='#b38a59';ctx.fillRect(0,0,512,512);
  const rowH=512/rows;
  for(let r=0;r<rows;r++){
   // Canvas py runs top-down while UV v runs bottom-up.
   const py=(rows-1-r)*rowH;
   const jx=plankJoints[r]*512;
   const segs:[number,number,number][]=[[0,jx,r*2],[jx,512,r*2+1]];
   for(const [x0,x1,seed] of segs){
    const w=x1-x0;if(w<=0)continue;
    const tone=(hash01(seed,r,11)-.5)*22;
    const rr=Math.round(179+tone),gg=Math.round(138+tone*.78),bb=Math.round(89+tone*.55);
    ctx.fillStyle=`rgb(${rr},${gg},${bb})`;
    ctx.fillRect(x0,py,w,rowH);
    // Longitudinal honey-oak wood grain streaks along each plank.
    for(let g=0;g<16;g++){
     const gy=py+((hash01(g,seed,23)*.86+.07)*rowH);
     const dark=g%3!==0;
     ctx.strokeStyle=dark?'rgba(95,62,32,.14)':'rgba(232,197,140,.10)';
     ctx.lineWidth=1+hash01(seed,g,31)*2.2;
     ctx.beginPath();ctx.moveTo(x0,gy);
     for(let sx=x0;sx<=x1;sx+=24)ctx.lineTo(sx,gy+Math.sin(sx*.035+g+seed)*2.2);
     ctx.stroke();
    }
    // Subtle chamfer highlight + dark seam crevice.
    ctx.fillStyle='rgba(235,204,155,.16)';ctx.fillRect(x0,py+2,w,2);
    ctx.fillStyle='rgba(70,46,24,.55)';ctx.fillRect(x0,py,w,2.5);
    ctx.fillRect(x0,py+rowH-2,w,2);
   }
   ctx.fillStyle='rgba(66,44,22,.58)';ctx.fillRect(jx-1.5,py,3,rowH);
  }
 },true);
 const normalMap=makeNormalTexture(256,256,plankHeight,1.7,true);
 const roughnessMap=makeRoughnessTexture(256,256,(u,v)=>{
  const r=Math.floor(((v%1+1)%1)*rows);
  const lv=((v%1+1)%1)*rows-r;
  const lu=((u-plankJoints[r])%1+1)%1;
  const seam=Math.min(lv,1-lv)<.045||Math.min(lu,1-lu)<.014;
  if(seam)return .82;
  const wear=periodicNoise(u,v,8,20,53);
  return .60+wear*.15;
 },true);
 const mat=new THREE.MeshStandardMaterial({
  color:map?'#ffffff':'#ae9472',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.75,.75),
  ...(roughnessMap?{roughnessMap}:{}),
  roughness:roughnessMap?1.0:.72,
 });
 mat.name='warm floor';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Sunlit butter-cream plaster for the kitchen walls. */
export function butterCreamPlasterMaterial():THREE.MeshStandardMaterial {
 const map=makeCanvasTexture(512,512,ctx=>{
  ctx.fillStyle='#dfd096';ctx.fillRect(0,0,512,512);
  for(let i=0;i<55;i++){
   const x=hash01(i,1,5)*512,y=hash01(i,2,9)*512;
   const rx=36+hash01(i,3,13)*64,ry=24+hash01(i,4,17)*48;
   const rot=hash01(i,5,21)*Math.PI;
   ctx.fillStyle=i%2?'rgba(244,234,185,.14)':'rgba(186,164,98,.11)';
   for(const ox of [-512,0,512])for(const oy of [-512,0,512]){
    ctx.beginPath();ctx.ellipse(x+ox,y+oy,rx,ry,rot,0,Math.PI*2);ctx.fill();
   }
  }
 },true);
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  return periodicNoise(u,v,6,6,31)*.55+periodicNoise(u,v,14,14,43)*.30+periodicNoise(u,v,28,28,59)*.15;
 },.85,true);
 const mat=new THREE.MeshStandardMaterial({
  color:map?'#f5ecd2':'#cdbb7c',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.32,.32),
  roughness:.90,
 });
 mat.name='yellow kitchen wall';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Rich honey-walnut wood grain material (optionally with vertical plank grooves for doors). */
export function honeyWalnutMaterial(opts:{planked?:boolean;color?:string;roughness?:number;name?:string}={}):THREE.MeshStandardMaterial {
 const planked=opts.planked??false;
 const planks=6;
 const map=makeCanvasTexture(512,512,ctx=>{
  ctx.fillStyle='#dfd1be';ctx.fillRect(0,0,512,512);
  const bands=planked?planks:1;
  const bandW=512/bands;
  for(let b=0;b<bands;b++){
   const bx=b*bandW;
   if(planked){
    const shift=(hash01(b,7,61)-.5)*16;
    ctx.fillStyle=`rgb(${Math.round(223+shift)},${Math.round(209+shift*.85)},${Math.round(190+shift*.7)})`;
    ctx.fillRect(bx,0,bandW,512);
   }
   for(let i=0;i<(planked?22:95);i++){
    const lx=bx+hash01(i,b,3)*bandW;
    const lw=1.2+hash01(i,b,8)*4.5;
    const warm=i%3===0;
    ctx.strokeStyle=warm?'rgba(248,236,216,.20)':'rgba(128,92,56,.18)';
    ctx.lineWidth=lw;
    ctx.beginPath();ctx.moveTo(lx,0);
    for(let y=0;y<=512;y+=32)ctx.lineTo(lx+Math.sin(y/512*Math.PI*2+i*1.3+b)*4.5,y);
    ctx.stroke();
   }
   if(planked&&b>0){
    ctx.fillStyle='rgba(78,52,28,.65)';ctx.fillRect(bx-2,0,4,512);
    ctx.fillStyle='rgba(246,232,210,.20)';ctx.fillRect(bx+2,0,2,512);
   }
  }
  for(let k=0;k<4;k++){
   const kx=hash01(k,12,73)*512,ky=hash01(k,13,79)*512;
   ctx.strokeStyle='rgba(110,76,42,.22)';ctx.lineWidth=2.2;
   ctx.beginPath();ctx.ellipse(kx,ky,7+k%2*3,20+k%3*6,0,0,Math.PI*2);ctx.stroke();
  }
 },true);
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  let h=periodicNoise(u,v,28,5,83)*.55+periodicNoise(u,v,48,10,97)*.25;
  if(planked){
   const p=(u*planks)%1;
   const dist=Math.min(p,1-p);
   if(dist<.05)h-=Math.pow(1-dist/.05,1.5)*1.1;
  }
  return h;
 },planked?1.4:.95,true);
 const mat=new THREE.MeshStandardMaterial({
  color:opts.color??'#8c6a46',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(planked?.65:.45,planked?.65:.45),
  roughness:opts.roughness??.68,
 });
 mat.name=opts.name??'aged timber';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Warm woven upholstery physical material with subtle tweed stripe texture and soft sheen. */
export function upholsteryMaterial():THREE.MeshPhysicalMaterial {
 const map=makeCanvasTexture(256,256,ctx=>{
  ctx.fillStyle='#a86b4e';ctx.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=4){
   ctx.fillStyle=y%8===0?'rgba(232,190,148,.16)':'rgba(118,58,36,.14)';
   ctx.fillRect(0,y,256,2);
  }
  for(let x=0;x<256;x+=4){
   ctx.fillStyle=x%16===0?'rgba(220,175,130,.18)':x%8===0?'rgba(104,50,32,.14)':'rgba(160,98,70,.08)';
   ctx.fillRect(x,0,2,256);
  }
  // Broad cozy vintage stripes.
  for(const sx of [24,152]){
   ctx.fillStyle='rgba(224,184,136,.15)';ctx.fillRect(sx,0,18,256);
   ctx.fillStyle='rgba(92,45,30,.12)';ctx.fillRect(sx+22,0,6,256);
  }
 },true);
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  return Math.sin(u*Math.PI*64)*Math.cos(v*Math.PI*64)*.45+periodicNoise(u,v,24,24,17)*.25;
 },1.1,true);
 if(map)map.repeat.set(3,3);
 if(normalMap)normalMap.repeat.set(3,3);
 const mat=new THREE.MeshPhysicalMaterial({
  color:map?'#ffffff':'#a26a50',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.55,.55),
  roughness:.88,
  sheen:.48,
  sheenRoughness:.78,
  sheenColor:new THREE.Color('#f0c8a8'),
 });
 mat.name='warm upholstery';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Woven oatmeal linen curtain physical material with subtle cottage stripes and sheen. */
export function curtainLinenMaterial():THREE.MeshPhysicalMaterial {
 const map=makeCanvasTexture(512,512,ctx=>{
  ctx.fillStyle='#ccb992';ctx.fillRect(0,0,512,512);
  for(const cx of [70,256,442]){
   ctx.fillStyle='rgba(122,138,104,.22)';ctx.fillRect(cx-18,0,36,512);
   ctx.fillStyle='rgba(170,104,70,.16)';ctx.fillRect(cx-24,0,4,512);ctx.fillRect(cx+20,0,4,512);
  }
  for(let y=0;y<512;y+=4){
   ctx.fillStyle=y%8===0?'rgba(248,240,218,.16)':'rgba(130,112,80,.10)';
   ctx.fillRect(0,y,512,2);
  }
  for(let x=0;x<512;x+=4){
   ctx.fillStyle=x%8===0?'rgba(245,235,212,.14)':'rgba(122,104,74,.09)';
   ctx.fillRect(x,0,2,512);
  }
 },true);
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  return Math.sin(u*Math.PI*80)*Math.sin(v*Math.PI*80)*.40+periodicNoise(u,v,20,20,23)*.20;
 },.95,true);
 if(normalMap)normalMap.repeat.set(4,5);
 const mat=new THREE.MeshPhysicalMaterial({
  color:map?'#ffffff':'#b5a27a',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.45,.45),
  roughness:.90,
  sheen:.48,
  sheenRoughness:.78,
  sheenColor:new THREE.Color('#f5ebd2'),
 });
 mat.name='plain curtain';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Hammered dark cast-iron material with stippled normal map. */
export function castIronMaterial(color='#4a4e4c',metalness=.74,roughness=.42,name='stove iron'):THREE.MeshStandardMaterial {
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  return periodicNoise(u,v,24,24,61)*.60+periodicNoise(u,v,48,48,67)*.40;
 },1.35,true);
 const mat=new THREE.MeshStandardMaterial({
  color,
  metalness,
  roughness,
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.55,.55),
 });
 mat.name=name;mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Crisp 8x8 wooden checkerboard inlay material for the living room reading table. */
export function checkerboardMaterial():THREE.MeshStandardMaterial {
 const map=makeCanvasTexture(512,512,ctx=>{
  ctx.fillStyle='#5c3b22';ctx.fillRect(0,0,512,512);
  const pad=24,inner=512-pad*2,sq=inner/8;
  ctx.strokeStyle='#d6b47e';ctx.lineWidth=3;ctx.strokeRect(pad-5,pad-5,inner+10,inner+10);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
   const dark=(r+c)%2===1;
   const x=pad+c*sq,y=pad+r*sq;
   ctx.fillStyle=dark?'#5e3c23':'#e0be85';
   ctx.fillRect(x,y,sq,sq);
   ctx.strokeStyle=dark?'rgba(42,24,12,.22)':'rgba(176,136,80,.20)';
   ctx.lineWidth=1.5;
   for(let g=4;g<sq-2;g+=7){
    ctx.beginPath();ctx.moveTo(x+2,y+g);ctx.lineTo(x+sq-2,y+g+(hash01(c+g,r,9)-.5)*3);ctx.stroke();
   }
  }
 },false);
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  const pad=24/512;
  if(u<pad||u>1-pad||v<pad||v>1-pad)return 0;
  const gx=((u-pad)/(1-2*pad)*8)%1,gy=((v-pad)/(1-2*pad)*8)%1;
  const edge=Math.min(gx,1-gx,gy,1-gy);
  return edge<.04?-Math.pow(1-edge/.04,1.4)*.6:0;
 },1.1,false);
 const mat=new THREE.MeshStandardMaterial({
  color:map?'#ffffff':'#d6c4a4',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.35,.35),
  roughness:.46,
 });
 mat.name='wooden checkerboard';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Cozy braided oval rag rug material with concentric woven rope rings. */
export function braidedRugMaterial():THREE.MeshStandardMaterial {
 const palette=['#d7c5a1','#a8583e','#758a6a','#c89b52','#5b7482','#dfd0b2','#9e5138','#819372'];
 const rings=14;
 const map=makeCanvasTexture(512,512,ctx=>{
  ctx.fillStyle='#c8b48e';ctx.fillRect(0,0,512,512);
  const cx=256,cy=256;
  for(let r=rings-1;r>=0;r--){
   const rad=(r+1)/rings*252;
   const col=palette[r%palette.length];
   ctx.fillStyle=col;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.fill();
   // Braided stitches around the circumference of each concentric band.
   const segs=Math.max(18,Math.round(rad*.42));
   const bandR=rad-252/rings*.5;
   ctx.strokeStyle='rgba(44,32,20,.20)';ctx.lineWidth=2.5;
   for(let s=0;s<segs;s++){
    const a=s/segs*Math.PI*2;
    const x1=cx+Math.cos(a)*(bandR-6),y1=cy+Math.sin(a)*(bandR-6);
    const x2=cx+Math.cos(a+.08)*(bandR+6),y2=cy+Math.sin(a+.08)*(bandR+6);
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
   }
   ctx.strokeStyle='rgba(42,28,18,.30)';ctx.lineWidth=2.2;
   ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();
  }
 },false);
 const normalMap=makeNormalTexture(256,256,(u,v)=>{
  const dx=u-.5,dy=v-.5,rad=Math.hypot(dx,dy)*2;
  if(rad>.99)return -.4;
  const ring=rad*rings;
  const f=ring-Math.floor(ring);
  const arch=Math.sin(f*Math.PI)*.7;
  const angle=Math.atan2(dy,dx);
  const braid=Math.sin(angle*Math.max(12,Math.round(ring*18))+f*4)*.25;
  return arch+braid;
 },1.6,false);
 const mat=new THREE.MeshStandardMaterial({
  color:map?'#ffffff':'#b57e58',
  ...(map?{map}:{}),
  ...(normalMap?{normalMap}:{}),
  normalScale:new THREE.Vector2(.65,.65),
  roughness:.92,
 });
 mat.name='braided rag rug';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Glowing hearth charcoal & ember bed material. */
export function emberBedMaterial():THREE.MeshStandardMaterial {
 const map=makeCanvasTexture(256,256,ctx=>{
  ctx.fillStyle='#24120c';ctx.fillRect(0,0,256,256);
  for(let i=0;i<160;i++){
   const x=hash01(i,1,15)*256,y=hash01(i,2,19)*256;
   const r=4+hash01(i,3,29)*14;
   const g=ctx.createRadialGradient(x,y,1,x,y,r);
   g.addColorStop(0,i%3===0?'rgba(255,210,75,.95)':'rgba(255,95,18,.88)');
   g.addColorStop(.55,'rgba(195,38,8,.55)');
   g.addColorStop(1,'rgba(28,14,10,0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<55;i++){
   const x=hash01(i,4,37)*256,y=hash01(i,5,41)*256;
   ctx.fillStyle='rgba(26,18,16,.78)';
   ctx.beginPath();ctx.ellipse(x,y,6+hash01(i,6,43)*11,4+hash01(i,7,47)*7,hash01(i,8,53)*Math.PI,0,Math.PI*2);ctx.fill();
  }
 },true);
 const mat=new THREE.MeshStandardMaterial({
  color:'#2d160e',
  ...(map?{map,emissiveMap:map}:{}),
  emissive:new THREE.Color('#ff5514'),
  emissiveIntensity:1.4,
  roughness:.94,
 });
 mat.name='hearth embers';mat.userData.setOwned=true;
 attachMapDisposal(mat);
 return mat;
}

/** Animated additive fireplace flame shader material driven solely by deterministic uTime. */
export function createHearthFlameMaterial():THREE.ShaderMaterial {
 const mat=new THREE.ShaderMaterial({
  uniforms:{
   uTime:{value:0},
   uIntensity:{value:1},
  },
  vertexShader:/* glsl */`
   uniform float uTime;
   varying vec2 vUv;
   void main(){
    vUv=uv;
    vec3 p=position;
    float sway=(sin(uTime*5.3+uv.y*4.5+p.x*9.0)*.55+cos(uTime*8.7+uv.y*7.0)*.45)*uv.y*uv.y*.055;
    p.x+=sway;
    p.z+=sway*.55;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
   }`,
  fragmentShader:/* glsl */`
   uniform float uTime;
   uniform float uIntensity;
   varying vec2 vUv;
   void main(){
    float x=(vUv.x-.5)*2.0;
    float y=vUv.y;
    float wobble=sin(y*8.5-uTime*7.5+x*2.4)*.14+sin(y*14.0-uTime*11.2-x*3.1)*.07;
    float width=mix(.74,.05,pow(y,.72));
    float d=abs(x+wobble*(.25+y*.75))/max(width,.02);
    float body=smoothstep(1.0,.18,d)*smoothstep(0.0,.14,y)*smoothstep(1.0,.35,y);
    float core=smoothstep(.65,.0,d)*smoothstep(0.0,.22,y)*smoothstep(.75,.15,y);
    vec3 outerCol=vec3(0.96,0.28,0.03);
    vec3 midCol=vec3(1.00,0.62,0.10);
    vec3 coreCol=vec3(1.00,0.95,0.65);
    vec3 col=mix(outerCol,midCol,smoothstep(.15,.75,body));
    col=mix(col,coreCol,core);
    float alpha=clamp(body*0.86*uIntensity,0.0,1.0);
    if(alpha<.01)discard;
    gl_FragColor=vec4(col*alpha*1.35,alpha);
   }`,
  transparent:true,
  depthWrite:false,
  side:THREE.DoubleSide,
  blending:THREE.AdditiveBlending,
 });
 mat.name='hearth flame';mat.userData.setOwned=true;
 return mat;
}

/** Soft additive sunbeam shaft material angled down from the kitchen window. */
export function createSunbeamMaterial():THREE.ShaderMaterial {
 const mat=new THREE.ShaderMaterial({
  uniforms:{
   uOpacity:{value:.14},
   uColor:{value:new THREE.Color('#ffe49e')},
  },
  vertexShader:/* glsl */`
   varying vec2 vUv;
   varying vec3 vNormalV;
   varying vec3 vViewDir;
   void main(){
    vUv=uv;
    vec4 mv=modelViewMatrix*vec4(position,1.0);
    vNormalV=normalize(normalMatrix*normal);
    vViewDir=normalize(-mv.xyz);
    gl_Position=projectionMatrix*mv;
   }`,
  fragmentShader:/* glsl */`
   uniform float uOpacity;
   uniform vec3 uColor;
   varying vec2 vUv;
   varying vec3 vNormalV;
   varying vec3 vViewDir;
   void main(){
    float along=smoothstep(0.0,.12,1.0-vUv.y)*pow(vUv.y,1.45);
    float fresnel=pow(abs(dot(normalize(vNormalV),normalize(vViewDir))),1.35);
    float alpha=along*fresnel*uOpacity;
    if(alpha<.002)discard;
    gl_FragColor=vec4(uColor*alpha,alpha);
   }`,
  transparent:true,
  depthWrite:false,
  side:THREE.DoubleSide,
  blending:THREE.AdditiveBlending,
 });
 mat.name='kitchen sunbeam';mat.userData.setOwned=true;
 return mat;
}

export function circusArtwork(kind:'poster'|'photo'|'certificate'|'forest'):THREE.MeshStandardMaterial|null {
 if(kind==='photo')return canvasMaterial(640,320,ctx=>{
  ctx.fillStyle='#b0a78e';ctx.fillRect(0,0,640,320);ctx.strokeStyle='#625a47';ctx.lineWidth=4;ctx.strokeRect(18,18,604,284);
  ctx.fillStyle='#8d866e';ctx.beginPath();ctx.moveTo(125,225);ctx.lineTo(320,48);ctx.lineTo(515,225);ctx.closePath();ctx.fill();
  ctx.fillStyle='#4c4b3e';ctx.fillRect(80,245,480,8);
  for(const [x,y,s]of [[180,168,.83],[320,140,1.1],[450,172,.8]]){
   ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='#5a5948';ctx.beginPath();ctx.ellipse(0,29,31,53,0,0,Math.PI*2);ctx.fill();
   for(const [dx,dy,r]of [[0,-35,28],[-20,-57,11],[20,-57,11]]){ctx.beginPath();ctx.arc(dx,dy,r,0,Math.PI*2);ctx.fill();}
   ctx.strokeStyle='#5a5948';ctx.lineWidth=17;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-17,9);ctx.lineTo(-50,-5);ctx.moveTo(17,9);ctx.lineTo(50,-5);ctx.moveTo(-13,69);ctx.lineTo(-18,95);ctx.moveTo(13,69);ctx.lineTo(18,95);ctx.stroke();
   ctx.fillStyle='#bfb69a';ctx.beginPath();ctx.ellipse(0,-24,19,10,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
 });
 if(kind==='forest')return canvasMaterial(320,640,ctx=>{
  const sky=ctx.createLinearGradient(0,0,0,640);sky.addColorStop(0,'#e2d5a7');sky.addColorStop(.55,'#c7cfb0');sky.addColorStop(1,'#8da072');
  ctx.fillStyle=sky;ctx.fillRect(0,0,320,640);
  ctx.strokeStyle='#5a4934';ctx.lineWidth=4;ctx.strokeRect(16,16,288,608);ctx.strokeRect(23,23,274,594);
  // Layered storybook pines.
  for(const [tx,ty,th,col] of [[78,430,220,'#7b906c'],[236,415,245,'#6f8662'],[158,390,190,'#8fa37e']] as const){
   ctx.fillStyle='#5c4530';ctx.fillRect(tx-6,ty-20,12,55);
   ctx.fillStyle=col;
   for(let lv=0;lv<4;lv++){
    const top=ty-th+lv*(th*.21),half=34+lv*17;
    ctx.beginPath();ctx.moveTo(tx,top);ctx.lineTo(tx+half,top+th*.30);ctx.lineTo(tx-half,top+th*.30);ctx.closePath();ctx.fill();
   }
  }
  // Gentle meadow slope and little forest bear with honey pot.
  ctx.fillStyle='#788e5b';ctx.beginPath();ctx.ellipse(160,610,210,130,0,0,Math.PI*2);ctx.fill();
  const ellipse=(x:number,y:number,rx:number,ry:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();};
  ellipse(160,478,42,56,'#8d5b32');ellipse(160,482,27,39,'#dcb882');
  ellipse(134,387,13,14,'#8d5b32');ellipse(186,387,13,14,'#8d5b32');
  ellipse(160,408,34,32,'#8d5b32');ellipse(160,420,24,16,'#dcb882');
  ellipse(148,404,4,5,'#2e261f');ellipse(172,404,4,5,'#2e261f');ellipse(160,415,9,6,'#2e261f');
  ellipse(206,496,20,24,'#c98934');ctx.fillStyle='#e5cb94';ctx.fillRect(191,472,30,8);
  ctx.fillStyle='#f4e6be';for(const [fx,fy] of [[65,540],[98,568],[248,548],[215,575]]){ctx.beginPath();ctx.arc(fx,fy,5,0,Math.PI*2);ctx.fill();}
 });
 return canvasMaterial(512,640,ctx=>{
  const gradient=ctx.createLinearGradient(0,0,512,640);gradient.addColorStop(0,'#d1b77c');gradient.addColorStop(1,'#92734e');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,640);
  ctx.strokeStyle='#5a4934';ctx.lineWidth=4;ctx.strokeRect(20,20,472,600);ctx.strokeRect(28,28,456,584);
  if(kind==='certificate'){
   ctx.fillStyle='#645437';ctx.textAlign='center';ctx.font='bold 39px Georgia';ctx.fillText('ДИПЛОМ',256,116);
   ctx.lineWidth=2;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(98+i%2*22,205+i*31);ctx.lineTo(414-i%2*22,205+i*31);ctx.stroke();}
   ctx.fillStyle='#995a3b';ctx.beginPath();ctx.arc(256,501,46,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c8aa69';ctx.font='bold 48px Georgia';ctx.fillText('★',256,518);return;
  }
  ctx.fillStyle='#493a2c';ctx.textAlign='center';ctx.font='bold 70px Georgia';ctx.fillText('ЦИРК',256,111);
  // A warm illustrated circus bear, on a single wheel, echoes the room's history.
  const brown='#9c6530',cream='#e4c58b';
  ctx.lineCap='round';ctx.strokeStyle='#493d2c';ctx.lineWidth=7;ctx.beginPath();ctx.arc(258,527,53,0,Math.PI*2);ctx.stroke();
  for(let k=0;k<10;k++){const a=k*Math.PI/5;ctx.beginPath();ctx.moveTo(258,527);ctx.lineTo(258+Math.cos(a)*49,527+Math.sin(a)*49);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(258,527);ctx.lineTo(258,453);ctx.moveTo(230,452);ctx.lineTo(284,452);ctx.stroke();
  const ellipse=(x:number,y:number,rx:number,ry:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();};
  ctx.strokeStyle=brown;ctx.lineWidth=41;ctx.beginPath();ctx.moveTo(212,288);ctx.quadraticCurveTo(138,306,101,246);ctx.moveTo(300,285);ctx.quadraticCurveTo(362,255,390,199);ctx.stroke();
  ellipse(255,341,78,109,brown);ellipse(260,347,55,85,cream);ellipse(213,449,36,19,brown);ellipse(299,449,36,19,brown);
  ellipse(209,187,26,28,brown);ellipse(294,187,26,28,brown);ellipse(253,222,64,62,brown);ellipse(251,244,49,31,cream);
  ellipse(231,218,12,16,cream);ellipse(272,218,12,16,cream);ellipse(233,220,5,8,'#322d27');ellipse(270,220,5,8,'#322d27');ellipse(252,238,18,11,'#322d27');
  ctx.strokeStyle='#493a2c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(253,247,22,.1,Math.PI-.1);ctx.stroke();
  for(const [x,y,r]of [[111,164,19],[173,143,16],[338,149,21]]){ellipse(x,y,r,r,cream);ctx.strokeStyle='#765331';ctx.lineWidth=3;ctx.stroke();}
  ctx.fillStyle='#57462f';ctx.font='22px Georgia';ctx.fillText('ЛЕСНОЙ АРТИСТ',256,597);
 });
}

export function windowLandscape():{material:THREE.MeshStandardMaterial;ready:Promise<void>}|null {
 const material=canvasMaterial(512,640,ctx=>{
  const sky=ctx.createLinearGradient(0,0,0,640);sky.addColorStop(0,'#a7b9b2');sky.addColorStop(.58,'#e2d9b5');sky.addColorStop(1,'#899873');ctx.fillStyle=sky;ctx.fillRect(0,0,512,640);
  const tree=(x:number,y:number,h:number,color:string,seed:number)=>{
   ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y-h);ctx.lineTo(x,y+30);ctx.stroke();ctx.fillStyle=color;
   for(let level=0;level<13;level++){
    const f=level/13,yy=y-h+f*h,half=(.08+f)*h*.25;
    ctx.beginPath();ctx.moveTo(x,yy-h*.16);for(let side=1;side>=-1;side-=2){for(let j=0;j<7;j++){const d=j/6;ctx.lineTo(x+side*(half*(side===1?d:1-d)),yy+(side===1?d:1-d)*h*.15+Math.sin((j+seed)*3.4)*h*.012);}}ctx.closePath();ctx.fill();
   }
  };
  for(let i=0;i<15;i++)tree((i*53)%560-20,420+(i%3)*14,190+(i*31)%150,'#a0afa0',i);
  ctx.fillStyle='rgba(225,222,195,.19)';ctx.fillRect(0,0,512,640);
  for(let i=0;i<7;i++)tree(-55+i*110,495+(i%3)*20,290+(i*43)%100,i%2?'#7d937b':'#8b9e80',i+12);
  ctx.fillStyle='#9eae82';ctx.beginPath();ctx.ellipse(190,633,400,110,-.13,0,Math.PI*2);ctx.fill();
  for(let i=0;i<18;i++){ctx.fillStyle=i%2?'#7d946b':'#91a576';ctx.beginPath();ctx.ellipse((i*73)%550-20,555+(i*17)%70,25+i%4*8,15+i%3*10,-.2,0,Math.PI*2);ctx.fill();}
  const glow=ctx.createRadialGradient(400,170,5,400,170,290);glow.addColorStop(0,'rgba(249,231,179,.25)');glow.addColorStop(1,'rgba(249,231,179,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,512,640);
 });
 if(!material)return null;
 material.emissive.setHex(0xffffff);material.emissiveMap=material.map;material.emissiveIntensity=.3;
 let disposed=false;material.addEventListener('dispose',()=>{disposed=true;});
 const ready=new Promise<void>(resolve=>{
  if(typeof Image==='undefined'){resolve();return;}
  let loading:THREE.Texture|undefined;
  loading=new THREE.TextureLoader().load('/assets/interior/woodland-window.webp',texture=>{
   if(disposed){texture.dispose();resolve();return;}
   texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
   material.map?.dispose();material.map=texture;material.emissiveMap=texture;resolve();
  },undefined,()=>{loading?.dispose();resolve();});
 });
 return{material,ready};
}
