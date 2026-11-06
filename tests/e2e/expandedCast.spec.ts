import {expect,test} from '@playwright/test';
import {E2E_PASSWORD} from '../../playwright.config';
import {writeFileSync} from 'node:fs';
test('generated cast and garden load, new actors play and seek without render errors',async({page})=>{
 test.setTimeout(180_000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.request.post('/login',{form:{password:E2E_PASSWORD},maxRedirects:0});await page.goto('/');
 await expect(page.getByRole('button',{name:'Lady Bear',exact:true})).toBeEnabled({timeout:90_000});
 const assets=await page.evaluate(()=>window.__mabear!.assets()) as {id:string;ok:boolean}[];
 for(const id of ['masha','bear','lady_bear','hare','rosie','squirrel','rival_bear','set:house','set:beehive','prop:carrot'])expect(assets.find(a=>a.id===id),id).toMatchObject({ok:true});
 const rigs=await page.evaluate(()=>window.__mabear!.rigs()) as Record<string,{name:string;generated?:{dressVertices:number;facialRig:boolean;calibrationError:number;mapping:Record<string,string>}}>;
 for(const id of ['masha','bear','lady_bear','hare','rosie','squirrel','rival_bear']){expect(rigs[id].name).toContain(':generated');expect(Object.keys(rigs[id].generated!.mapping).length).toBeGreaterThan(20);expect(rigs[id].generated!.calibrationError,id).toBeLessThan(.002);}
 expect(rigs.masha.generated!.dressVertices).toBeGreaterThan(100);expect(rigs.masha.generated!.facialRig).toBe(true);
 await page.getByTestId('chip-garden_party').click();
 const tl=await page.evaluate(()=>window.__mabear!.timeline()) as any;
 for(const id of ['lady_bear','hare','rosie','squirrel','rival_bear'])expect(tl.segments.some((s:any)=>s.segment.actorClips[id].some((c:any)=>c.verb!=='idle')),id).toBe(true);
 await page.getByRole('button',{name:'Play all',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__mabear!.t())).toBeGreaterThan(2);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 for(const id of ['masha','bear','lady_bear','hare','rosie','squirrel','rival_bear'])await page.evaluate(id=>window.__mabear!.closeup(id as any),id);
 await page.getByRole('button',{name:'Story view',exact:true}).click();
 await page.evaluate(()=>window.__mabear!.freeze(true));
 const data=await page.evaluate(()=>window.__mabear!.snapshot());expect(data!.length).toBeGreaterThan(10_000);
 writeFileSync('docs/expansion/e2e-yard.png',Buffer.from(data!.split(',')[1],'base64'));
 expect(errors).toEqual([]);
});
