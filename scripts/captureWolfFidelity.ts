import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const prefix=process.argv[2]??'pass1';
await mkdir('docs/wolf-fidelity/proof',{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:920}});page.on('pageerror',e=>console.error(e.message));
 for(const variant of ['a','b']){
  await page.routeWebSocket('**', ws=>{
   const server=ws.connectToServer();
   server.onMessage(message=>{
    try {const value=JSON.parse(String(message));if(value.type==='update'||value.type==='full-reload')return;}catch{}
    ws.send(message);
   });
  });
  await page.goto(`http://127.0.0.1:5173/tools/wolf-fidelity.html?variant=${variant}`);
  await page.waitForFunction(()=>!!(window as any).__ready,null,{timeout:120000});
  for(const [name,angle,pose,emotion,time] of [
   ['stand','three','stand','neutral',1.2],['front','front','stand','neutral',1.2],['face','face','stand','happy',1.2],['profile','side','stand','happy',1.2],
   ['walk','three','walk_to','neutral',.6],['seated','three','seated','happy',1.2],
   ['reference','reference','stand','surprised',1.2],['rising','three','stand_up','neutral',1.6],
  ]){
   const r=await page.evaluate((state)=>(window as any).__wolfFidelity.render(state),{angle,pose,emotion,time});
   await writeFile(`docs/wolf-fidelity/proof/${prefix}-${variant}-${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));
   console.log(`${prefix}-${variant}-${name}`);
  }
 }
}finally{await browser.close()}
