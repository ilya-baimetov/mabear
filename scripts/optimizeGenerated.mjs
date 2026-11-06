// Reproducible local optimization; no generation requests or paid API calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt, weld, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [source, destination, edge = '2048', ratio = '1'] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node scripts/optimizeGenerated.mjs source.glb destination.glb [textureEdge]');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc = await io.read(source);
for(const a of doc.getRoot().listAnimations()) a.dispose(); // Our deterministic story engine owns animation.
if(+ratio<1) { await MeshoptSimplifier.ready; await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:+ratio,error:.002})); }
await doc.transform(dedup(), prune(),
  textureCompress({encoder:sharp,targetFormat:'webp',slots:/baseColorTexture|emissiveTexture/,resize:[+edge,+edge],quality:85}),
  textureCompress({encoder:sharp,targetFormat:'webp',slots:/normalTexture|metallicRoughnessTexture|occlusionTexture/,resize:[Math.min(+edge,1024),Math.min(+edge,1024)],quality:80}),
  meshopt({encoder:MeshoptEncoder,level:'high'}));
await fs.mkdir(path.dirname(destination),{recursive:true}); await io.write(destination,doc);
console.log(JSON.stringify({source,destination,before:(await fs.stat(source)).size,after:(await fs.stat(destination)).size}));
