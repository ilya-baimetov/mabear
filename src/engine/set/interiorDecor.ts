import * as THREE from 'three';

/** Small, local illustrations: no captured episode frame is shipped as a texture. */
function canvasMaterial(width:number,height:number,draw:(ctx:CanvasRenderingContext2D)=>void):THREE.MeshStandardMaterial|null {
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)return null;draw(ctx);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
 const material=new THREE.MeshStandardMaterial({map,roughness:.96});material.userData.setOwned=true;return material;
}

export function paintedPanelMaterial():THREE.MeshStandardMaterial {
 const material=canvasMaterial(256,512,ctx=>{
  ctx.fillStyle='#e3e1d8';ctx.fillRect(0,0,256,512);
  for(let i=0;i<100;i++){
   const seed=Math.sin(i*83.71)*43874.21,x=(seed-Math.floor(seed))*256;
   ctx.strokeStyle=i%3?'rgba(81,89,70,.055)':'rgba(255,254,239,.10)';ctx.lineWidth=.5+i%3*.5;ctx.beginPath();ctx.moveTo(x,0);
   for(let y=0;y<=512;y+=24)ctx.lineTo(x+Math.sin(y*.013+i)*1.8,y);ctx.stroke();
  }
 });
 const result=material??new THREE.MeshStandardMaterial();result.vertexColors=true;result.roughness=.9;result.userData.setOwned=true;return result;
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
 });
 if(material?.map){material.map.wrapS=material.map.wrapT=THREE.RepeatWrapping;}
 return material;
}

export function circusArtwork(kind:'poster'|'photo'|'certificate'):THREE.MeshStandardMaterial|null {
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
  const loading=new THREE.TextureLoader().load('/assets/interior/woodland-window.webp',texture=>{
   if(disposed){texture.dispose();resolve();return;}
   texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
   material.map?.dispose();material.map=texture;material.emissiveMap=texture;resolve();
  },undefined,()=>{loading.dispose();resolve();});
 });
 return{material,ready};
}
