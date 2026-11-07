import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

// Four bounded frames through the actual fixture/compiler/evaluator/stage.
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const selected=process.argv.slice(2);
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 // Other agents may save files during this bounded review. Keep the loaded
 // fixture/rig snapshot stable instead of letting Vite reload mid-capture.
 await page.route('**/@vite/client',route=>route.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:5173/tools/visual-fixes.html');
 await page.waitForFunction(()=>!!(window as any).__visualFixes,null,{timeout:180000});
 await mkdir('docs/visual-fixes/proof',{recursive:true});
 const frames:{name:string;[key:string]:unknown}[]=[];
 for(const name of selected.length?selected:['seated-cooking','seated-eating','seated-contact','standing-wave']){
  const data=await page.evaluate(async name=>{
   const h=(window as any).__visualFixes;
   const modulePath='/src/engine/player/evaluate.ts';
   const {evaluate}=await import(modulePath);
   const index=name==='standing-wave'?0:8;
   const eat=h.timelines[8].segments.flatMap((s:any)=>s.segment.actorClips.masha.filter((c:any)=>c.verb==='eat').map((c:any)=>s.offset+c.start+.45))[0];
   const t=name==='standing-wave'?2.296:name==='seated-cooking'?h.timeFor(8,'bear','cook'):eat+(name==='seated-contact-front'?1:name==='seated-contact-early'?-.35:0);
   const frame=evaluate(h.timelines[index],t);
   if(name==='seated-contact')frame.camera={pos:[-7.1,1,-3.05],look:[-7.8,.65,-5.5],fov:35,location:'house'};
   if(name==='seated-contact-front'||name==='seated-contact-early')frame.camera={pos:[-7.8,1,-2.8],look:[-7.8,.65,-5.5],fov:35,location:'house'};
   if(name==='standing-wave'){
    const a=frame.actors.masha,angle=a.yaw+.45;
    frame.camera={pos:[a.pos[0]+Math.sin(angle)*1.9,a.pos[1]+.72,a.pos[2]+Math.cos(angle)*1.9],look:[a.pos[0],a.pos[1]+.56,a.pos[2]],fov:35,location:'yard'};
   }
   h.stage.render(frame);
   return {png:document.querySelector('canvas')!.toDataURL('image/png'),t,camera:frame.camera,masha:frame.actors.masha,dressVertices:h.stage.rigs.masha.root.userData.generated.dressVertices};
  },name);
  const {png,...proof}=data;
  await writeFile(`docs/visual-fixes/proof/final-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
  frames.push({name,...proof});console.log(name);
 }
 const proofPath=`docs/visual-fixes/final-clothing${selected.length?'-detail':''}-frames.json`;
 const previous:typeof frames=selected.length?JSON.parse(await readFile(proofPath,'utf8').catch(()=>'[]')):[];
 await writeFile(proofPath,JSON.stringify([...previous.filter(p=>!frames.some(f=>f.name===p.name)),...frames],null,2));
}finally{await browser.close();}
