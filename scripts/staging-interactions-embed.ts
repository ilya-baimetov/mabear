import {readFile,writeFile} from 'node:fs/promises';
const folder='docs/staging-interactions';
const embedded:Record<string,unknown>={};
for(const side of ['before','after'])for(const filename of ['proof.json','recordings.json']){
 const key=`${side}/${filename}`,data=JSON.parse(await readFile(`${folder}/${key}`,'utf8'));
 if(data.errors?.length||data.failedRequests?.length||data.sourceStable===false)throw new Error(`Cannot package failed evidence: ${key}`);
 if(filename==='proof.json'&&!data.speechTiming?.includes('AppStore'))throw new Error(`Missing app speech timing: ${key}`);
 embedded[key]=data;
}
for(const side of ['before','after']){
 const proof=embedded[`${side}/proof.json`] as {durations:Record<string,number>};
 const recordings=embedded[`${side}/recordings.json`] as {recordings:{story:string;filename:string}[]};
 if(Object.keys(proof.durations).some(story=>!recordings.recordings.some(r=>r.story===story)))throw new Error(`Incomplete full-story recordings: ${side}`);
}
const path=`${folder}/index.html`,html=await readFile(path,'utf8');
const marker=/<script id="embedded-proof" type="application\/json">[\s\S]*?<\/script>/;
if(!marker.test(html))throw new Error('Embedded metadata marker missing');
const json=JSON.stringify(embedded).replaceAll('<','\\u003c');
await writeFile(path,html.replace(marker,()=>`<script id="embedded-proof" type="application/json">${json}</script>`));
console.log(`Embedded four capture metadata objects in ${path}; local videos remain relative.`);
