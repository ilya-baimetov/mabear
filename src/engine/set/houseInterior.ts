import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBag, xf, type LookMaterials, type MatKey } from '../look';
import {bicycleWallpaper,circusArtwork,windowLandscape,paintedPanelMaterial} from './interiorDecor';

// Shell bands deliberately do not overlap: the old cream/green side-wall boxes
// shared their exposed plane over 11 cm, so camera movement produced z-fighting.
export const HOUSE_WALL_BANDS={panelTop:1.24,upperBottom:1.30,upperTop:3.58} as const;

/** The window backdrop is a rendered view of our woodland, tinted absolutely for
 * each story time of day. Never multiply its previous frame's color. */
export function updateHouseInterior(interior:THREE.Group,windowGlow:number):void {
  const night=THREE.MathUtils.clamp(windowGlow,0,1);
  for(const material of interior.userData.windowMaterials as THREE.MeshStandardMaterial[]){
    material.color.setRGB(1-.80*night,1-.72*night,1-.55*night);
    material.emissive.setRGB(1-.60*night,1-.45*night,1-.20*night);
    material.emissiveIntensity=.3*(1-.75*night);
  }
}

/** The story room uses the existing house footprint. Its front is a theatrical cutaway;
 * it is only revealed when a story camera looks into the house. All coordinates are world metres. */
export function buildHouseInterior(materials:LookMaterials):THREE.Group {
  const b=new GeoBag();
  const panels=new GeoBag();
  const panelBlock=(col:number,x:number,y:number,z:number,w:number,h:number,d:number)=>panels.add('paint',new THREE.BoxGeometry(w,h,d),col,xf([x,y,z]));
  const block=(mat:MatKey,col:number,x:number,y:number,z:number,w:number,h:number,d:number,r=0)=>
    b.add(mat,r?new RoundedBoxGeometry(w,h,d,2,r):new THREE.BoxGeometry(w,h,d),col,xf([x,y,z]));
  const cylinder=(mat:MatKey,col:number,x:number,y:number,z:number,rt:number,rb:number,h:number,rot:[number,number,number]=[0,0,0])=>
    b.add(mat,new THREE.CylinderGeometry(rt,rb,h,16),col,xf([x,y,z],rot));
  const sphere=(mat:MatKey,col:number,x:number,y:number,z:number,r:number,scale:[number,number,number]=[1,1,1])=>
    b.add(mat,new THREE.SphereGeometry(r,12,8),col,xf([x,y,z],[0,0,0],scale));
  const details:THREE.Object3D[]=[];
  const windowLoads:Promise<void>[]=[],windowMaterials:THREE.MeshStandardMaterial[]=[];
  const shellParts=new GeoBag();
  const wall=(name:string,col:number,x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.name=`set:house:wall:${name}`;
    shellParts.add('paint',geometry,col,xf([x,y,z]));
  };
  // Wide, slightly uneven honey-coloured floorboards, dark joints and exposed edge.
  block('wood',0x59412c,-6,-.09,-3.4,7,.18,11.4);
  for(let i=0;i<24;i++){
    block('wood',[0x7d654b,0x897154,0x82694d,0x927758,0x796247][i%5],-9.35+i*.29,.015,-3.4,.28,.035,11.35);
    for(let k=0;k<4;k++)block('paint',0x694f36,-9.35+i*.29,.034,-8.2+k*2.8+(i%3)*.6,.27,.004,.012);
  }
  // Cream plaster and muted green wainscot: the episode's homely, unpolished woodwork.
  const upperHeight=HOUSE_WALL_BANDS.upperTop-HOUSE_WALL_BANDS.upperBottom,upperY=(HOUSE_WALL_BANDS.upperTop+HOUSE_WALL_BANDS.upperBottom)/2;
  wall('rear-upper',0xd2c8a6,-6,upperY,-9.03,7,upperHeight,.16);
  wall('rear-panel',0x627369,-6,.62,-8.92,7,1.24,.13);
  for(let i=0;i<28;i++){
    panelBlock([0x8b9882,0x85947e,0x909b85,0x81917b][i%4],-9.4+i*.25,.62,-8.82,.23,1.2,.028);
  }
  // The ceiling joist is also the crown rail. A second rail at the same depth
  // used to overlap its front face, creating a wide flickering strip at the ceiling.
  for(const y of [.12,1.27])block('wood',0x9b9982,-6,y,-8.8,7,.10,.16);
  for(const x of [-9.45,-6,-2.55])block('wood',0x8a8875,x,1.78,-8.82,.14,3.56,.18);
  // The side walls and ceiling continue around the south-facing story camera. The
  // exterior is cut away, but the image still reads as an enclosed room at every framing.
  for(const x of [-9.48,-2.52]){
    const side=x<-6?'left':'right',inside=x<-6?x+.10:x-.10;
    wall(`${side}-upper`,0xd4c9a7,x,upperY,-3.4,.16,upperHeight,11.3);
    wall(`${side}-panel`,0x64776a,x,.62,-3.4,.16,1.24,11.3);
    for(let i=0;i<44;i++)panelBlock([0x89977f,0x81917a,0x8c9881,0x85947d][i%4],inside,.62,-8.92+i*.255,.025,1.20,.24);
    for(const y of [.10,1.27,3.50])block('wood',0x9d9880,x,y,-3.4,.22,.10,11.3);
  }
  block('wood',0x75664d,-6,3.66,-3.4,7.1,.16,11.4);
  for(const z of [-8.8,-6.2,-3.5,-.8])block('wood',0x69614d,-6,3.51,z,7.1,.16,.16,.025);
  // Bear's living-room wallpaper uses a quiet bicycle motif, visible behind the circus mementos.
  for(const [name,width,x,z,rotation]of [['rear',3.38,-7.73,-8.93,0],['left',11.3,-9.385,-3.4,Math.PI/2]] as const){
    const material=bicycleWallpaper();if(!material)continue;
    material.map!.repeat.set(width/1.65,upperHeight/1.65);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,upperHeight),material);mesh.position.set(x,upperY,z);mesh.rotation.y=rotation;mesh.receiveShadow=true;mesh.name=`set:house:wallpaper:${name}`;details.push(mesh);
  }
  // Timber sash windows have real recessed panes, visible trees and folded linen.
  const window=(x:number,z:number,left:boolean)=>{
    const sign=left?1:-1,front=x+sign*.10;
    block('wood',0x7b7058,x,2.30,z,.12,1.83,1.58);
    const landscape=windowLandscape();if(landscape){windowLoads.push(landscape.ready);windowMaterials.push(landscape.material);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.38,1.61),landscape.material);mesh.rotation.y=sign*Math.PI/2;mesh.position.set(front,2.30,z);mesh.name='set:house:window-view';details.push(mesh);}
    for(const dz of [-.79,0,.79])block('wood',0xaca48a,front+sign*.025,2.30,z+dz,.09,1.86,dz===0?.045:.09);
    for(const y of [1.38,2.30,3.22])block('wood',0xaca48a,front+sign*.035,y,z,.09,y===2.30?.045:.09,1.68);
    block('wood',0xb1a589,front+sign*.09,1.34,z,.30,.08,1.91,.02);
    cylinder('metal',0x6a5b3d,front+sign*.11,3.28,z,.022,.022,2.08,[Math.PI/2,0,0]);
    for(const side of [-1,1])for(let p=0;p<5;p++){
      const zz=z+side*(.75+p*.052);block('fabric',p%2?0xc9b995:0xddcaa3,front+sign*(.12+(p%2)*.035),2.29,zz,.085,1.81,.068,.025);
    }
  };
  window(-9.33,-3.9,true);window(-2.67,-6.8,false);
  // Living-room rug, braided concentric border; it does not affect the walk height.
  for(let i=0;i<5;i++){
    const g=new THREE.RingGeometry(1.13-i*.09,1.20-i*.09,64);g.rotateX(-Math.PI/2);
    b.add('fabric',g,[0x925a43,0xb49869,0x657567,0xb99667,0x795342][i],xf([-7.75,.049,-5.4],[0,0,0],[1.2,1,.8]));
  }
  // A low rug built separately so its texture lies flat without a floating carpet rim.
  b.add('fabric',new THREE.CylinderGeometry(1.20,1.20,.006,96),0x9b6b49,xf([-7.75,.04,-5.4],[0,0,0],[1.2,1,.8]));
  // Bookcase at the rear left. Individual spines and leaning books give scale at close camera distances.
  block('wood',0x5d4734,-7.2,1.56,-8.58,1.77,2.9,.30);
  for(const x of [-8.13,-6.27])block('wood',0x79583d,x,1.56,-8.28,.11,2.99,.57);
  block('wood',0x765237,-7.2,3.08,-8.28,2.02,.12,.64,.025);
  block('wood',0x765237,-7.2,.10,-8.28,2.02,.16,.66,.02);
  for(let row=0;row<5;row++){
    const y=.2+row*.57;
    block('wood',0x876244,-7.2,y,-8.25,1.83,.075,.65);
    for(let k=0;k<12;k++){
      // A few horizontal piles and open gaps break the repeated full-height picket rhythm.
      if((row===1&&k>7)||(row===3&&k<3)||(row===4&&k>8))continue;
      const h=.24+((k*7+row*3)%9)*.024,x=-8.02+k*.145,w=.085+(k%3)*.012;
      const lean=k===0?-.13:k===11?.18:k===7&&row%2?.11:0;
      b.add('paint',new THREE.BoxGeometry(w,h,.29),[0x55635d,0x874d3e,0x98855b,0x3b5055,0x9b7849,0x655244][(k+row)%6],xf([x,y+h/2+.06,-8.25],[0,0,lean]));
      block('paint',0xcbb788,x,y+h+.06,-8.245,w*.83,.014,.25);
      for(const d of [.1,.73])block('paint',0xc4ae7d,x,y+h*d+.06,-8.095,w*.78,.011,.004);
    }
    if(row===1||row===3){const x=row===1?-6.6:-7.82;for(let j=0;j<3;j++){block('paint',[0x65715c,0x9b7853,0x584d47][j],x,y+.08+j*.085,-8.17,.43,.073,.35,.01);block('paint',0xd2c5a0,x,y+.08+j*.085,-7.985,.39,.05,.01);}}
  }
  // Striped upholstered reading chair: exact seat centre is the semantic living-room mark.
  const sx=-7.8,sz=-5.8;
  for(const x of [sx-.48,sx+.48])for(const z of [sz-.4,sz+.4])cylinder('wood',0x65452e,x,.18,z,.045,.065,.34);
  block('fabric',0x9b593b,sx,.30,sz,1.39,.20,1.16,.085);
  // A woven stripe texture stays continuous on the curved cushion; geometry bars would
  // look like rails and cast false shadows at the close eating shot.
  const stripePixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const f=x%28,base=f<2||f===5?[193,166,124]:f===3?[103,64,48]:[129,78,57];
    const weave=((x+y)%2?2:-2)+Math.sin(y*.9)*1.2,worn=Math.sin(x*.13+Math.sin(y*.08))*Math.cos(y*.17)*3.5,o=(y*128+x)*4;
    stripePixels[o]=base[0]+weave+worn;stripePixels[o+1]=base[1]+weave+worn;stripePixels[o+2]=base[2]+weave+worn;stripePixels[o+3]=255;
  }
  const stripeTex=new THREE.DataTexture(stripePixels,128,128,THREE.RGBAFormat);
  stripeTex.colorSpace=THREE.SRGBColorSpace;stripeTex.magFilter=THREE.LinearFilter;stripeTex.minFilter=THREE.LinearMipmapLinearFilter;stripeTex.generateMipmaps=true;stripeTex.needsUpdate=true;
  const upholstery=materials.fabric.clone();upholstery.vertexColors=false;upholstery.color.setHex(0xffffff);upholstery.map=stripeTex;upholstery.roughness=.95;upholstery.userData={setOwned:true};
  const cushions:THREE.Mesh[]=[];
  for(const [w,h,d,x,y,z,tilt] of [[1.08,.16,.96,sx,.39,sz,0],[1.36,1.39,.40,sx,1.08,sz-.47,.10]]){
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,5,Math.min(h,d)*.46),upholstery);
    mesh.position.set(x,y,z);mesh.rotation.x=tilt;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='set:armchair:upholstery';cushions.push(mesh);
  }
  for(const x of [sx-.67,sx+.67]){
    // Filled, rounded sides connect the arms to the base. The former floating bars
    // made the chair look like a racing seat and exposed an empty skeletal frame.
    for(const [w,h,d,y,z,r]of [[.31,.46,1.08,.55,sz,.12],[.34,.24,1.16,.79,sz+.015,.115]]){
      const arm=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,5,r),upholstery);arm.position.set(x,y,z);arm.castShadow=true;arm.receiveShadow=true;arm.name='set:armchair:upholstery';cushions.push(arm);
    }
    block('wood',0x624a34,x,.30,sz,.26,.08,1.13,.025);
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
  // Narrow exposed-brick flue belongs to the fireplace's rear edge; it must not
  // cover the picture wall like the former broad white slab.
  block('stone',0x876c58,-9.28,2.27,-8.07,.26,1.85,.48,.02);
  for(let row=0;row<10;row++){
    const y=1.43+row*.18;block('paint',0xafa28b,-9.143,y,-8.07,.008,.014,.48);
    block('paint',0xafa28b,-9.143,y+.09,-8.07+(row%2?.09:-.06),.008,.16,.013);
  }
  for(let i=0;i<3;i++){
    const z=-8.03+i*.52,h=[.43,.65,.34][i],y=1.39;
    block('stone',0x49654b,-9.01,y,z,.22,.08,.22,.01);
    cylinder('metal',0xab8b43,-9.01,y+.14,z,.035,.09,.20);
    const profile=[[.04,0],[.08,.04],[.12,h*.52],[.15,h*.7],[.15,h*.75],[.13,h*.75],[.10,h*.5],[.03,.04]].map(([x,y])=>new THREE.Vector2(x,y));
    b.add('metal',new THREE.LatheGeometry(profile,18),0xb7984c,xf([-9.01,y+.22,z]));
    for(const side of [-1,1])b.add('metal',new THREE.TorusGeometry(.09,.013,6,14,Math.PI*1.25),0xb7984c,xf([-9.01,y+.22+h*.48,z+side*.13],[0,Math.PI/2,side*.15]));
  }
  // Circus posters and diplomas are part of Bear's identity, not anonymous dots in frames.
  const framed=(kind:'poster'|'photo'|'certificate',x:number,y:number,z:number,w:number,h:number,side=false)=>{
    if(side){block('wood',0x69472f,x,y,z,.09,h+.11,w+.11,.015);block('paint',0xbea572,x+.052,y,z,.012,h+.02,w+.02);}
    else{block('wood',0x69472f,x,y,z,w+.11,h+.11,.09,.015);block('paint',0xbea572,x,y,z+.052,w+.02,h+.02,.012);}
    const material=circusArtwork(kind);if(!material)return;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x+(side?.065:0),y,z+(side?0:.065));mesh.rotation.y=side?Math.PI/2:0;mesh.receiveShadow=true;mesh.name=`set:house:gallery:${kind}`;details.push(mesh);
  };
  framed('poster',-8.79,2.24,-8.75,.91,1.38);
  framed('photo',-8.84,3.18,-8.75,.91,.39);
  framed('certificate',-9.29,2.38,-5.48,.56,.76,true);
  framed('poster',-9.29,2.42,-6.75,.62,.95,true);
  framed('photo',-9.29,3.17,-6.75,.62,.35,true);
  // A small pendulum clock, with a glazed lower case and brass bob.
  block('wood',0x765238,-4.25,2.70,-8.63,.48,.87,.18,.035);
  cylinder('wood',0x8a6541,-4.25,2.94,-8.51,.28,.28,.085,[Math.PI/2,0,0]);
  cylinder('paint',0xe5d6ac,-4.25,2.94,-8.455,.23,.23,.018,[Math.PI/2,0,0]);
  for(let k=0;k<12;k++){const a=k*Math.PI/6;sphere('paint',0x6b6049,-4.25+Math.sin(a)*.19,2.94+Math.cos(a)*.19,-8.436,.012,[1,1,.3]);}
  block('paint',0x4e4a38,-4.25,3.01,-8.43,.019,.15,.014);
  block('paint',0x4e4a38,-4.19,2.94,-8.43,.14,.019,.014);
  block('paint',0x534c37,-4.25,2.53,-8.527,.29,.35,.02,.02);
  block('metal',0xa48a44,-4.25,2.59,-8.506,.019,.25,.015);
  sphere('metal',0xaf954e,-4.25,2.46,-8.49,.075,[1,1,.2]);
  // The episode's kitchen has a tall open crockery pantry to the left of the
  // enamel fridge. The yellow pan wall belongs above the base counter and burner.
  block('paint',0xdfd2a0,-4.25,2.37,-8.76,3.2,2.10,.06);
  const enamelPot=(x:number,y:number,z:number,r:number,h:number,color:number)=>{
    const profile=[[0,0],[r*.9,0],[r,.05],[r,h],[r-.018,h],[r-.025,.055],[0,.035]].map(([xx,yy])=>new THREE.Vector2(xx,yy));
    b.add('paint',new THREE.LatheGeometry(profile,24),color,xf([x,y,z]));
    const rim=new THREE.TorusGeometry(r,.013,6,24);rim.rotateX(Math.PI/2);b.add('metal',rim,0x424d4c,xf([x,y+h,z]));
    for(const side of [-1,1])block('paint',color,x+side*(r+.045),y+h*.66,z,.13,.045,.065,.018);
    for(const dx of [-r*.45,r*.42]){
      for(let petal=0;petal<5;petal++){const angle=petal*Math.PI*2/5;sphere('paint',0xc2a0ba,x+dx+Math.cos(angle)*.033,y+h*.52+Math.sin(angle)*.033,z+r*.95,.025,[1,1,.2]);}
      sphere('paint',0xd4b857,x+dx,y+h*.52,z+r*.97,.017,[1,1,.2]);
    }
  };
  block('wood',0x604a35,-5.33,1.30,-8.58,1.04,2.48,.17);
  for(const x of [-5.89,-4.77])block('wood',0x836143,x,1.31,-8.24,.10,2.58,.67);
  for(const y of [.09,.64,1.25,1.88,2.58])block('wood',0x936c49,-5.33,y,-8.24,1.22,.08,.72,.014);
  enamelPot(-5.56,1.30,-8.15,.19,.27,0x91b2c0);enamelPot(-5.10,1.30,-8.15,.17,.21,0x9da577);
  enamelPot(-5.53,.69,-8.15,.20,.29,0xa091b3);enamelPot(-5.08,.69,-8.15,.16,.22,0x7da49d);
  enamelPot(-5.36,.14,-8.16,.26,.30,0xb1ad7a);
  for(let k=0;k<6;k++)cylinder('paint',0xd4ddce,-5.58,1.94+k*.021,-8.16,.16,.17,.02);
  for(let k=0;k<3;k++){
    const x=-5.14+k*.14;cylinder('paint',0x6b4936,x,2.08,-8.17,.058,.064,.28);cylinder('metal',0xb7b493,x,2.23,-8.17,.065,.065,.025);
  }
  block('paint',0xd9d5c6,-4.25,.87,-8.28,.84,1.73,.77,.15);
  block('paint',0xc5bfa7,-4.25,1.35,-7.875,.74,.014,.025);
  block('metal',0x9a9e92,-3.99,1.11,-7.83,.05,.27,.055,.025);
  block('wood',0xa78458,-4.25,1.91,-8.25,.64,.32,.48,.12);
  for(let k=0;k<6;k++)block('wood',0x7f6547,-4.25,1.79+k*.043,-8.004,.48,.009,.008);
  // Solid base cupboard, then the characteristic cylindrical single-pot stove.
  block('wood',0x8b6544,-3.29,.43,-8.31,.84,.80,.73,.02);
  block('wood',0xa37b52,-3.29,.87,-8.27,.97,.10,.83,.02);
  for(const x of [-3.49,-3.09]){
    block('wood',0x9e7952,x,.43,-7.925,.36,.68,.042,.014);
    block('wood',0x8b6846,x,.43,-7.898,.27,.54,.012,.012);
    sphere('wood',0x725438,x+(x<-3.29?.11:-.11),.46,-7.88,.028);
  }
  cylinder('metal',0x534d3d,-3.0,.41,-7.24,.29,.32,.64);
  for(const y of [.17,.64])cylinder('metal',0x8a6a40,-3.0,y,-7.24,.325,.325,.055);
  for(const angle of [0,Math.PI*2/3,Math.PI*4/3])cylinder('metal',0x373c34,-3+Math.cos(angle)*.26,.09,-7.24+Math.sin(angle)*.26,.035,.045,.18);
  cylinder('metal',0x2f3631,-3,.755,-7.24,.34,.34,.055);
  enamelPot(-3,.79,-7.24,.31,.46,0x8eacb9);
  // Yellow enamel kettle with a visible curved spout on the wooden counter.
  sphere('paint',0xe0bf57,-3.32,1.09,-8.15,.19,[1,.85,1]);
  const spout=new THREE.CatmullRomCurve3([new THREE.Vector3(-3.44,1.08,-8.10),new THREE.Vector3(-3.56,1.12,-8.04),new THREE.Vector3(-3.63,1.22,-7.99)]);
  b.add('paint',new THREE.TubeGeometry(spout,10,.041,10,false),0xe0bf57,xf([0,0,0]));
  sphere('paint',0x5a5035,-3.635,1.227,-7.985,.036,[1,.2,1]);
  cylinder('paint',0xd9b851,-3.32,1.25,-8.15,.13,.16,.055);
  sphere('wood',0x745530,-3.32,1.31,-8.15,.04);
  b.add('metal',new THREE.TorusGeometry(.18,.022,6,18,Math.PI),0x5a5943,xf([-3.32,1.14,-8.15]));
  // Hanging skillets contrast against cream plaster.
  for(let k=0;k<3;k++){
    const x=-3.72+k*.43;
    const radius=[.20,.16,.23][k];
    cylinder('metal',k===1?0x9b9b87:0x4d5149,x,2.72,-8.59,radius,radius,.05,[Math.PI/2,0,0]);
    block('metal',0x4a4b3e,x,2.94,-8.58,.043,.21,.04);
    if(k===1)for(const [dx,dy]of [[0,0],[-.06,.05],[.06,.05],[-.06,-.05],[.06,-.05]])sphere('paint',0x50574a,x+dx,2.72+dy,-8.555,.016,[1,1,.2]);
    else{const rim=new THREE.TorusGeometry(radius,.012,6,24);b.add('metal',rim,0x747667,xf([x,2.72,-8.555]));}
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
  const root=b.build(materials,'set:house_interior');b.dispose();
  const shell=shellParts.build(materials,'set:house:wall-shell');shellParts.dispose();
  const panelGroup=panels.build({...materials,paint:paintedPanelMaterial()},'set:house:paneling');panels.dispose();
  // Static upholstery shares one draw, including the six point-light shadow faces.
  for(const mesh of cushions){mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);}
  const chair=new THREE.Mesh(mergeGeometries(cushions.map(mesh=>mesh.geometry)),upholstery);chair.name='set:armchair:upholstery';chair.castShadow=true;chair.receiveShadow=true;
  for(const mesh of cushions)mesh.geometry.dispose();
  root.add(shell,panelGroup,chair,...details);
  root.visible=false;
  root.userData={setElement:'house_interior',description:'Playable kitchen and living room, revealed as a cutaway',windowMaterials,assetsReady:Promise.all(windowLoads).then(()=>undefined)};
  const warm=new THREE.PointLight(0xffd6a1,24,12,2);warm.position.set(-5.8,3.15,-5.3);warm.castShadow=true;warm.shadow.mapSize.set(1024,1024);warm.shadow.camera.near=.1;warm.shadow.camera.far=12;warm.shadow.bias=-.00015;warm.shadow.normalBias=.025;warm.shadow.radius=3;warm.name='set:house:ceiling-light';root.add(warm);
  const reading=new THREE.PointLight(0xffc477,3.5,4,2);reading.position.set(-8.9,1.5,-5.1);root.add(reading);
  return root;
}
