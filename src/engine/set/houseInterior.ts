import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GeoBag, xf, type LookMaterials, type MatKey } from '../look';

/** The story room uses the existing house footprint. Its front is a theatrical cutaway;
 * it is only revealed when a story camera looks into the house. All coordinates are world metres. */
export function buildHouseInterior(materials:LookMaterials):THREE.Group {
  const b=new GeoBag();
  const block=(mat:MatKey,col:number,x:number,y:number,z:number,w:number,h:number,d:number,r=0)=>
    b.add(mat,r?new RoundedBoxGeometry(w,h,d,2,r):new THREE.BoxGeometry(w,h,d),col,xf([x,y,z]));
  const cylinder=(mat:MatKey,col:number,x:number,y:number,z:number,rt:number,rb:number,h:number,rot:[number,number,number]=[0,0,0])=>
    b.add(mat,new THREE.CylinderGeometry(rt,rb,h,16),col,xf([x,y,z],rot));
  const sphere=(mat:MatKey,col:number,x:number,y:number,z:number,r:number,scale:[number,number,number]=[1,1,1])=>
    b.add(mat,new THREE.SphereGeometry(r,12,8),col,xf([x,y,z],[0,0,0],scale));
  const details:THREE.Object3D[]=[];
  // Wide, slightly uneven honey-coloured floorboards, dark joints and exposed edge.
  block('wood',0x59412c,-6,-.09,-3.4,7,.18,11.4);
  for(let i=0;i<24;i++){
    block('wood',[0x956d48,0x9f7751,0x9a734d,0xa37c52,0x8c6645][i%5],-9.35+i*.29,.015,-3.4,.28,.035,11.35);
    for(let k=0;k<4;k++)block('paint',0x694f36,-9.35+i*.29,.034,-8.2+k*2.8+(i%3)*.6,.27,.004,.012);
  }
  // Cream plaster and muted green wainscot: the episode's homely, unpolished woodwork.
  block('paint',0xd4c4a1,-6,2.16,-9.03,7,2.55,.16);
  block('paint',0x60766c,-6,.62,-8.92,7,1.24,.13);
  for(let i=0;i<28;i++)block('wood',i%3?0x668077:0x566e65,-9.4+i*.25,.62,-8.82,.035,1.2,.025);
  for(const y of [.12,1.24,3.42])block('wood',0x88613f,-6,y,-8.8,7,.11,.18);
  for(const x of [-9.45,-6,-2.55])block('wood',0x755336,x,1.75,-8.82,.17,3.5,.18);
  // The side walls and ceiling continue around the south-facing story camera. The
  // exterior is cut away, but the image still reads as an enclosed room at every framing.
  for(const x of [-9.48,-2.52]){
    block('paint',0xcbbb97,x,2.38,-3.4,.16,2.5,11.3);
    block('paint',0x64786c,x,.62,-3.4,.16,1.24,11.3);
    for(const y of [.10,1.24,3.55])block('wood',0x876243,x,y,-3.4,.22,.13,11.3);
  }
  block('wood',0x795b3c,-6,3.66,-3.4,7.1,.16,11.4);
  for(const z of [-8.8,-6.2,-3.5,-.8])block('wood',0x614831,-6,3.51,z,7.1,.20,.18,.025);
  // Bear's living-room wallpaper uses a quiet bicycle motif, visible behind the circus mementos.
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
    if(ctx){
      ctx.fillStyle='#92957b';ctx.fillRect(0,0,256,256);
      for(const [x,y,s]of [[20,44,.72],[150,35,.58],[72,154,.66],[190,193,.57]]){
        ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.strokeStyle=x===72?'rgba(211,211,176,.43)':'rgba(75,83,61,.35)';ctx.lineWidth=2;
        for(const cx of [0,60]){ctx.beginPath();ctx.arc(cx,0,21,0,Math.PI*2);ctx.stroke();for(let j=0;j<8;j++){const a=j*Math.PI/4;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx+Math.cos(a)*21,Math.sin(a)*21);ctx.stroke();}}
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(20,-28);ctx.lineTo(33,0);ctx.closePath();ctx.lineTo(60,-28);ctx.lineTo(60,0);ctx.moveTo(20,-28);ctx.lineTo(60,-28);ctx.moveTo(16,-32);ctx.lineTo(29,-32);ctx.moveTo(60,-28);ctx.lineTo(56,-40);ctx.lineTo(65,-42);ctx.stroke();ctx.restore();
      }
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2.2,1.5);tex.anisotropy=4;
      const mat=new THREE.MeshStandardMaterial({map:tex,roughness:1});mat.userData.setOwned=true;
      const wallpaper=new THREE.Mesh(new THREE.PlaneGeometry(3.6,2.08),mat);wallpaper.position.set(-7.85,2.34,-8.805);wallpaper.name='set:house:living-wallpaper';details.push(wallpaper);
    }
  }
  // Side-window trim and curtains suggest daylight without exposing the outdoor set.
  block('paint',0xaab4a3,-9.37,2.28,-6.1,.02,1.7,1.5);
  for(const z of [-6.94,-5.26])block('wood',0x8b6844,-9.33,2.28,z,.09,1.95,.13);
  for(const y of [1.32,2.28,3.24])block('wood',0x8b6844,-9.33,y,-6.1,.09,.1,1.8);
  for(const z of [-6.83,-5.37])block('fabric',0xc1996f,-9.23,2.19,z,.12,1.75,.25,.05);
  // Living-room rug, braided concentric border; it does not affect the walk height.
  for(let i=0;i<5;i++){
    const g=new THREE.RingGeometry(1.13-i*.09,1.20-i*.09,64);g.rotateX(-Math.PI/2);
    b.add('fabric',g,[0xa6543f,0xd0a86d,0x65796c,0xcd9a61,0x875544][i],xf([-7.75,.044,-5.4],[0,0,0],[1.2,1,.8]));
  }
  // A low rug built separately so its texture lies flat without a floating carpet rim.
  b.add('fabric',new THREE.CylinderGeometry(1.20,1.20,.006,96),0x9b6b49,xf([-7.75,.04,-5.4],[0,0,0],[1.2,1,.8]));
  // Bookcase at the rear left. Individual spines and leaning books give scale at close camera distances.
  block('wood',0x654932,-7.72,1.55,-8.55,2.2,2.9,.42);
  for(const x of [-8.86,-6.58])block('wood',0x93633b,x,1.55,-8.25,.14,3,.55);
  for(let row=0;row<5;row++){
    const y=.2+row*.57;
    block('wood',0x9f7047,-7.72,y,-8.25,2.4,.1,.65);
    for(let k=0;k<14;k++){
      // A few horizontal piles and open gaps break the repeated full-height picket rhythm.
      if((row===1&&k>9)||(row===3&&k<3))continue;
      const h=.23+((k*7+row*3)%9)*.024,x=-8.72+k*.145,w=.09+(k%3)*.009;
      const lean=k===0?-.13:k===13?.18:k===8&&row%2?.11:0;
      b.add('paint',new THREE.BoxGeometry(w,h,.29),[0x55635d,0x874d3e,0x98855b,0x3b5055,0x9b7849,0x655244][(k+row)%6],xf([x,y+h/2+.06,-8.25],[0,0,lean]));
      block('paint',0xcbb788,x,y+h+.06,-8.245,w*.83,.014,.25);
      for(const d of [.1,.73])block('paint',0xc4ae7d,x,y+h*d+.06,-8.095,w*.78,.011,.004);
    }
    if(row===1||row===3){const x=row===1?-6.96:-8.5;for(let j=0;j<3;j++){block('paint',[0x65715c,0x9b7853,0x584d47][j],x,y+.08+j*.085,-8.17,.5,.073,.35,.01);block('paint',0xd2c5a0,x,y+.08+j*.085,-7.985,.46,.05,.01);}}
  }
  // Striped upholstered reading chair: exact seat centre is the semantic living-room mark.
  const sx=-7.8,sz=-5.8;
  for(const x of [sx-.48,sx+.48])for(const z of [sz-.4,sz+.4])cylinder('wood',0x65452e,x,.18,z,.045,.065,.34);
  block('fabric',0xa75f42,sx,.31,sz,1.32,.18,1.1,.07);
  // A woven stripe texture stays continuous on the curved cushion; geometry bars would
  // look like rails and cast false shadows at the close eating shot.
  const stripePixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const f=x%24,base=f<2||f===5?[215,189,144]:f===3?[113,61,42]:[148,83,54];
    const weave=((x+y)%2?2:-2)+Math.sin(y*.9)*1.5,o=(y*128+x)*4;
    stripePixels[o]=base[0]+weave;stripePixels[o+1]=base[1]+weave;stripePixels[o+2]=base[2]+weave;stripePixels[o+3]=255;
  }
  const stripeTex=new THREE.DataTexture(stripePixels,128,128,THREE.RGBAFormat);
  stripeTex.colorSpace=THREE.SRGBColorSpace;stripeTex.magFilter=THREE.LinearFilter;stripeTex.minFilter=THREE.LinearMipmapLinearFilter;stripeTex.generateMipmaps=true;stripeTex.needsUpdate=true;
  const upholstery=materials.fabric.clone();upholstery.vertexColors=false;upholstery.color.setHex(0xffffff);upholstery.map=stripeTex;upholstery.roughness=.95;upholstery.userData={setOwned:true};
  const cushions:THREE.Mesh[]=[];
  for(const [w,h,d,x,y,z,tilt] of [[1.08,.16,.96,sx,.39,sz,0],[1.28,1.5,.32,sx,1.15,sz-.47,.07]]){
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,4,Math.min(h,d)*.44),upholstery);
    mesh.position.set(x,y,z);mesh.rotation.x=tilt;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='set:armchair:upholstery';cushions.push(mesh);
  }
  for(const x of [sx-.64,sx+.64]){
    const arm=new THREE.Mesh(new RoundedBoxGeometry(.24,.25,1.1,3,.10),upholstery);arm.position.set(x,.78,sz);arm.castShadow=true;arm.receiveShadow=true;arm.name='set:armchair:upholstery';cushions.push(arm);
  }
  // A side table, open book and brass-shaded reading lamp beside the chair.
  cylinder('wood',0x9b7048,-9,.63,-5.35,.45,.45,.08);
  cylinder('wood',0x725236,-9,.32,-5.35,.065,.10,.62);
  cylinder('metal',0x7b632f,-9,.69,-5.4,.16,.19,.055);
  cylinder('metal',0x8b7039,-9,1.11,-5.4,.025,.025,.83);
  cylinder('fabric',0xe8c98f,-9,1.54,-5.4,.22,.37,.37);
  block('paint',0xefe0ba,-8.92,.70,-5.04,.43,.04,.32);
  // White masonry fireplace, dark arched firebox, worn brick edging and the trophy mantel.
  // It occupies the left wall behind the chair, leaving every story/contact mark clear.
  block('stone',0xb2a48e,-9.11,.09,-7.42,.65,.14,1.85,.025);
  block('paint',0xc6bda9,-9.12,.67,-7.42,.48,1.1,1.68,.025);
  const arch=new THREE.Shape();arch.moveTo(-.49,0);arch.lineTo(.49,0);arch.lineTo(.49,.53);arch.absarc(0,.53,.49,0,Math.PI,false);arch.lineTo(-.49,0);
  b.add('paint',new THREE.ShapeGeometry(arch,20),0x262b25,xf([-8.868,.14,-7.42],[0,Math.PI/2,0]));
  for(let i=0;i<9;i++){
    const a=i/8*Math.PI,z=-7.42+Math.cos(a)*.58,y=.67+Math.sin(a)*.58;
    b.add('stone',new THREE.BoxGeometry(.06,.20,.18),[0x957d69,0xa38c74,0x8c7563][i%3],xf([-8.826,y,z],[-a,0,0]));
  }
  block('wood',0x67472f,-9.08,1.30,-7.42,.7,.13,1.92,.025);
  block('paint',0xbcb59e,-9.28,2.27,-7.42,.26,1.85,.84,.035);
  for(let i=0;i<3;i++){
    const z=-8.03+i*.52,h=[.43,.65,.34][i],y=1.39;
    block('stone',0x49654b,-9.01,y,z,.22,.08,.22,.01);
    cylinder('metal',0xab8b43,-9.01,y+.14,z,.035,.09,.20);
    const profile=[[.04,0],[.08,.04],[.12,h*.52],[.15,h*.7],[.15,h*.75],[.13,h*.75],[.10,h*.5],[.03,.04]].map(([x,y])=>new THREE.Vector2(x,y));
    b.add('metal',new THREE.LatheGeometry(profile,18),0xb7984c,xf([-9.01,y+.22,z]));
    for(const side of [-1,1])b.add('metal',new THREE.TorusGeometry(.09,.013,6,14,Math.PI*1.25),0xb7984c,xf([-9.01,y+.22+h*.48,z+side*.13],[0,Math.PI/2,side*.15]));
  }
  // Framed circus mementos and a small clock; visual motif, no invented readable award claims.
  for(const [x,y,w,h]of [[-8.95,2.5,.6,.8],[-6.25,2.4,.5,.7]] as const){
    block('wood',0x815438,x,y,-8.70,w+.12,h+.12,.07);
    block('paint',0xd5bb83,x,y,-8.65,w,h,.015);
    sphere('paint',0x80633e,x,y,-8.62,w*.22,[1,1.1,.08]);
  }
  cylinder('wood',0x8d633d,-6.03,2.95,-8.59,.28,.28,.08,[Math.PI/2,0,0]);
  cylinder('paint',0xe5d6ac,-6.03,2.95,-8.53,.23,.23,.018,[Math.PI/2,0,0]);
  block('paint',0x4e4a38,-6.03,3.02,-8.51,.025,.16,.02);
  block('paint',0x4e4a38,-5.97,2.95,-8.51,.14,.025,.02);
  // Kitchen rear wall: beadboard cabinets, cream enamel refrigerator, cookware and shelves.
  block('paint',0xe2d5ae,-4.25,2.18,-8.76,3.2,2.37,.06);
  block('paint',0xd9d5c6,-5.38,.87,-8.28,.84,1.73,.77,.15);
  block('paint',0xc5bfa7,-5.38,1.35,-7.875,.74,.014,.025);
  block('metal',0x9a9e92,-5.12,1.11,-7.83,.05,.27,.055,.025);
  // Low rounded bread box on the old enamel fridge, as in the kitchen reference.
  block('wood',0xa78458,-5.38,1.91,-8.25,.64,.32,.48,.12);
  for(let k=0;k<6;k++)block('wood',0x7f6547,-5.38,1.79+k*.043,-8.004,.48,.009,.008);
  for(const x of [-4.45,-3.55]){
    block('wood',0x9e7045,x,2.2,-8.46,.85,.88,.48,.035);
    block('wood',0xb38656,x,2.2,-8.20,.73,.75,.055,.02);
    block('wood',0xa57749,x,2.2,-8.165,.57,.59,.012,.015);
    sphere('wood',0x725032,x+.26,2.16,-8.16,.045);
  }
  block('wood',0x805b3d,-3.55,1.53,-8.38,1.6,.10,.6);
  for(let k=0;k<4;k++){
    cylinder('paint',[0xeee2bb,0x96b4b1,0xbfa0ad,0xd9ad64][k],-4.12+k*.36,1.74,-8.31,.12,.12,.32);
    cylinder('wood',0x916a43,-4.12+k*.36,1.91,-8.31,.13,.13,.035);
  }
  // Open lower pantry: dark preserves, lids and labels; the furniture should read as lived-in storage.
  block('wood',0x785337,-4.35,.47,-8.3,1.12,.86,.56);
  for(const y of [.10,.48,.87])block('wood',0x9e714a,-4.35,y,-8.03,1.2,.07,.69);
  for(let k=0;k<5;k++){
    const x=-4.78+k*.22;
    cylinder('paint',[0x543d32,0x443b2f,0x6d342b][k%3],x,.68,-7.97,.085,.092,.27);
    cylinder('metal',0x96946b,x,.83,-7.97,.09,.09,.028);
    block('paint',0xd5c8a2,x,.68,-7.873,.13,.13,.012);
    sphere('paint',0x943b2d,x,.68,-7.86,.035,[1,1,.1]);
  }
  // Enamel stove with iron rings, oven window and yellow kettle.
  block('paint',0xe1d3aa,-3.17,.47,-7.73,1.0,.9,.85,.04);
  block('metal',0x393c35,-3.17,.94,-7.73,1.03,.07,.88,.025);
  block('paint',0xdfd1ac,-3.17,1.08,-8.1,1.0,.24,.09,.035);
  for(let k=0;k<4;k++)sphere('metal',0x595b4d,-3.49+k*.21,.82,-7.267,.045);
  block('metal',0x4c5147,-3.17,.48,-7.28,.69,.42,.04,.035);
  block('paint',0x262e2a,-3.17,.49,-7.25,.52,.26,.025);
  for(const x of [-3.43,-2.92])for(const z of [-7.95,-7.51]){
    const ring=new THREE.TorusGeometry(.14,.018,6,18);ring.rotateX(Math.PI/2);b.add('metal',ring,0x777667,xf([x,.988,z]));
  }
  sphere('paint',0xe9c55b,-3.42,1.16,-7.94,.2,[1,.85,1]);
  cylinder('paint',0xe3bd54,-3.42,1.32,-7.94,.14,.17,.06);
  sphere('wood',0x745530,-3.42,1.38,-7.94,.045);
  b.add('metal',new THREE.TorusGeometry(.19,.024,6,18,Math.PI),0x5a5943,xf([-3.42,1.2,-7.94],[0,0,0]));
  // Hanging skillets contrast against cream plaster.
  for(let k=0;k<3;k++){
    const x=-4.6+k*.5;
    cylinder('metal',0x4d5149,x,2.95,-8.59,.18,.18,.05,[Math.PI/2,0,0]);
    block('metal',0x4a4b3e,x,3.19,-8.58,.05,.25,.04);
  }
  // Sturdy preparation table: the cooking prop rests at .78 m in front of the kitchen mark.
  block('wood',0xa77a4b,-4.25,.735,-5.85,1.95,.09,.62,.025);
  for(const x of [-5.05,-3.45])for(const z of [-6.05,-5.65]){
    const leg=[[.045,0],[.05,.06],[.065,.09],[.07,.13],[.045,.17],[.085,.43],[.095,.49],[.06,.55],[.08,.59],[.08,.70]].map(([x,y])=>new THREE.Vector2(x,y));
    b.add('wood',new THREE.LatheGeometry(leg,16),0x93623d,xf([x,.02,z]));
  }
  block('wood',0x8f613d,-4.25,.61,-5.85,1.7,.13,.48);
  block('wood',0xb38454,-4.25,.61,-5.59,.68,.12,.035,.01);
  sphere('wood',0x6b4b32,-4.25,.61,-5.55,.035);
  // Open plate shelf near the worktable, towel and bread board.
  block('wood',0xc79b63,-3.55,.794,-5.85,.42,.025,.34,.015);
  block('fabric',0xe2d0ad,-4.9,.795,-5.84,.32,.012,.48);
  for(let k=0;k<4;k++)cylinder('paint',0xc6dce0,-4.95,.82+k*.018,-5.86,.11,.12,.016);
  const root=b.build(materials,'set:house_interior');b.dispose();root.add(...cushions,...details);
  root.visible=false;
  root.userData={setElement:'house_interior',description:'Playable kitchen and living room, revealed as a cutaway'};
  const warm=new THREE.PointLight(0xffd6a1,26,12,2);warm.position.set(-5.8,3.15,-5.3);warm.castShadow=true;warm.shadow.mapSize.set(1024,1024);warm.shadow.bias=-.0004;warm.shadow.normalBias=.015;warm.shadow.radius=3;root.add(warm);
  const reading=new THREE.PointLight(0xffc477,3.5,4,2);reading.position.set(-8.9,1.5,-5.1);root.add(reading);
  return root;
}
