import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';

// A local texture captured from the app's own existing woodland, never an episode frame.
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:720,height:840}});
 await page.goto('http://127.0.0.1:8793/tools/interior-review.html');
 await page.waitForFunction(()=>!!(window as any).__interiorReview,null,{timeout:180000});
 const png=await page.evaluate(()=>{const review=(window as any).__interiorReview;review.stage.resize(720,840);return review.windowView({pos:[-2,1.5,-12],look:[-4,2.2,-23],fov:55,location:'yard'});});
 await mkdir('public/assets/interior',{recursive:true});
 await sharp(Buffer.from(png.split(',')[1],'base64')).resize(600,700).webp({quality:82}).toFile('public/assets/interior/woodland-window.webp');
}finally{await browser.close();}
