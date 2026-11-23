import * as THREE from 'three';
import { FOREST_GROUND_SEGMENTS, forestHeightAt, forestNatureLayout } from '../../shared/forestLayout';
import { POND_BENCH_SPEC, POND_STUMP_SPEC, WOLVES_CRATES_SPEC, WOLVES_LOGS_SPEC } from '../../shared/yardLayout';
import { GeoBag, paint, xf, type LookMaterials } from '../look';
import { rng } from '../math/rng';
import { buildPineRidgeHorizon, NatureAssets, type NatureId } from './nature';
import type { EnvTextures } from './textures';

/** Apply loaded grass detail textures to a forest location ground material, disposing placeholders once. */
export function applyForestTextures(location: THREE.Group, t: EnvTextures): void {
  const ground = location.userData.groundMaterial as THREE.MeshStandardMaterial | undefined;
  if (!ground) return;
  const ph = location.userData.groundPlaceholders as { map?: THREE.DataTexture | null; normalMap?: THREE.DataTexture | null } | undefined;
  if (t.grass && ground.map !== t.grass) {
    if (ph?.map && ground.map === ph.map) {
      ph.map.dispose();
      ph.map = null;
    }
    ground.map = t.grass;
  }
  if (t.grassN && ground.normalMap !== t.grassN) {
    if (ph?.normalMap && ground.normalMap === ph.normalMap) {
      ph.normalMap.dispose();
      ph.normalMap = null;
    }
    ground.normalMap = t.grassN;
  }
}

/** Self-contained woodland locations. Coordinates remain stable for action contacts, but
 * neither location shares visible dressing with Bear's garden. */
export function buildForestLocation(kind: 'pond' | 'wolves', mats: LookMaterials, nature: NatureAssets, waterRadius?: (angle: number) => number): THREE.Group {
  const root = new THREE.Group(); root.name = `set:location:${kind}`;
  const b = new GeoBag(), r = rng(kind === 'pond' ? 915 : 1015);
  const cx = kind === 'pond' ? -8 : 14, cz = kind === 'pond' ? 10 : -1;
  const ground = new THREE.PlaneGeometry(120, 120, FOREST_GROUND_SEGMENTS, FOREST_GROUND_SEGMENTS); ground.rotateX(-Math.PI / 2); ground.translate(cx, -.025, cz);
  const colors: number[] = [], p = ground.attributes.position;
  const heightAt = (x: number, z: number) => forestHeightAt(kind, x, z);
  const base = new THREE.Color(kind === 'pond' ? 0x648646 : 0x789449), shade = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z));
    shade.copy(base).multiplyScalar(.91 + .07 * Math.sin(x * .8 + z * .3) + r() * .14); colors.push(shade.r, shade.g, shade.b);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); ground.computeVertexNormals();
  const groundUv = ground.attributes.uv; for (let i = 0; i < groundUv.count; i++) groundUv.setXY(i, groundUv.getX(i) * 50, groundUv.getY(i) * 50);
  const neutralMap = new THREE.DataTexture(new Uint8Array([217, 217, 217, 255]), 1, 1, THREE.RGBAFormat); neutralMap.colorSpace = THREE.SRGBColorSpace; neutralMap.needsUpdate = true;
  const normalMap = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat); normalMap.needsUpdate = true;
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: neutralMap, normalMap }); groundMat.color.setRGB(1.44, 1.44, 1.44); groundMat.normalScale.set(.22, .22); groundMat.userData.setOwned = true;
  groundMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
vec2 rotRemoteGroundUv(vec2 uv, float a, vec2 off) {
  float c = cos(a), s = sin(a);
  return vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + off;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
    #ifdef USE_MAP
    {
      vec2 gUv2 = rotRemoteGroundUv(vMapUv * 0.37, 0.73, vec2(0.37, 0.71));
      float gMix = 0.42 + 0.18 * (0.5 + 0.5 * sin(vMapUv.x * 0.31 + sin(vMapUv.y * 0.27) * 1.3));
      vec3 blendedTex = mix(texture2D(map, vMapUv).rgb, texture2D(map, gUv2).rgb, gMix);
      vec3 baseColor = diffuseColor.rgb / max(sampledDiffuseColor.rgb, vec3(0.01));
      diffuseColor.rgb = mix(baseColor * blendedTex, baseColor * 0.694, 0.45);
    }
    #endif`)
      .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_OBJECTSPACE
  normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = - normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN1 = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  vec2 nUv2 = rotRemoteGroundUv(vNormalMapUv * 0.37, 0.73, vec2(0.37, 0.71));
  vec3 mapN2 = texture2D( normalMap, nUv2 ).xyz * 2.0 - 1.0;
  float nc = cos(-0.73), ns = sin(-0.73);
  mapN2.xy = vec2(nc * mapN2.x - ns * mapN2.y, ns * mapN2.x + nc * mapN2.y);
  float nMix = 0.42 + 0.18 * (0.5 + 0.5 * sin(vNormalMapUv.x * 0.31 + sin(vNormalMapUv.y * 0.27) * 1.3));
  vec3 mapN = normalize(mix(mapN1, mapN2, nMix));
  #if defined( USE_PACKED_NORMALMAP )
    mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
  #endif
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`);
  };
  groundMat.customProgramCacheKey = () => `remote-ground-anti-tile-v2`;
  const groundMesh = new THREE.Mesh(ground, groundMat); groundMesh.name = `set:location:${kind}:ground`; groundMesh.receiveShadow = true; root.add(groundMesh);
  root.userData.groundMaterial = groundMat;
  root.userData.groundPlaceholders = { map: neutralMap, normalMap };
  // Light, worn sand leads to the pond. The ambulance has two interrupted wheel tracks.
  const trail = (points: [number, number][], width: number) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, .008, z)));
    const ps = curve.getPoints(70), verts: number[] = [], uvs: number[] = [], indices: number[] = [];
    let dist = 0;
    for (let i = 0; i < ps.length; i++) {
      if (i > 0) dist += ps[i].distanceTo(ps[i - 1]);
      const a = ps[Math.max(0, i - 1)], c = ps[Math.min(ps.length - 1, i + 1)], dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz) || 1;
      const w = width * (.9 + .08 * Math.sin(i * 1.2));
      verts.push(ps[i].x - dz / len * w, ps[i].y, ps[i].z + dx / len * w, ps[i].x + dz / len * w, ps[i].y, ps[i].z - dx / len * w);
      uvs.push(-w / 1.2, dist / 1.2, w / 1.2, dist / 1.2);
      if (i) indices.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals();
    paint(g, kind === 'pond' ? 0xc2ab76 : 0x8b925d, { jitter: .035 });
    b.addPainted(kind === 'pond' ? 'soil' : 'foliage', g);
  };
  if (kind === 'pond') {
    trail([[-6, 8], [-3.5, 6.2], [-1.3, 4.1], [.5, 1.7], [2, -5], [1, -13]], .70);
    // Rough plank bench seen by the water in the reference episode, separate from the pier.
    const bench = POND_BENCH_SPEC;
    b.add('bark', new THREE.CylinderGeometry(.22, .24, bench.width, 14, 1, false, 0, Math.PI), 0x6b6450, xf([bench.center[0], .39, bench.center[1]], [0, 0, Math.PI / 2]), { jitter: .08 });
    b.add('wood', new THREE.BoxGeometry(bench.width, bench.thickness, bench.depth), 0xa99e7e, xf([bench.center[0], bench.topY, bench.center[1]]), { jitter: .08 });
    for (const x of bench.postXs) b.add('bark', new THREE.CylinderGeometry(.17, .21, bench.postHeight, 10), 0x67533b, xf([x, bench.postHeight / 2, bench.center[1]]));
    const stump = POND_STUMP_SPEC;
    b.add('bark', new THREE.CylinderGeometry(stump.radius - 0.04, stump.radius + 0.04, stump.height, 13), 0x6b6550, xf([stump.pos[0], .19, stump.pos[1]]), { capColor: 0xa69875, capAxis: 'y' });
  } else {
    for (const offset of [-.6, .6]) trail([[14 + offset, 1], [13 + offset, 3.5], [11 + offset, 6], [10 + offset, 10], [11 + offset, 15]], .14);
    // Repair yard: quiet storytelling details, explicitly an adaptation rather than episode-exact props.
    for (const [x, z, angle] of WOLVES_LOGS_SPEC) {
      b.add('bark', new THREE.CylinderGeometry(.21, .27, 2.05, 12), 0x796041, xf([x, .25, z], [Math.PI / 2, 0, angle]), { capColor: 0xc3a16c, capAxis: 'y' });
    }
    const crates = WOLVES_CRATES_SPEC;
    const [cw, ch, cd] = crates.size;
    for (let k = 0; k < crates.count; k++) {
      const x = crates.startX + k * crates.stepX, z = crates.z;
      b.add('wood', new THREE.BoxGeometry(cw, ch, cd), 0x9c7f54, xf([x, ch / 2, z]), { jitter: .1 });
      for (const y of [.07, .4]) b.add('wood', new THREE.BoxGeometry(cw + .03, .05, cd + .04), 0x6b5a40, xf([x, y, z]));
    }
  }
  const staticGroup = b.build(mats, `set:location:${kind}:dressing`); b.dispose(); root.add(staticGroup);
  // The remote scenes have their own terrain-following grass. Reusing yard tufts made
  // sparse pale spikes float on these hills and left the immediate shoreline bare.
  const grassPos: number[] = [], grassColors: number[] = [], grassIndices: number[] = [];
  const grassLow = new THREE.Color(0x668a44), grassHigh = new THREE.Color(0xafc476);
  for (let blade = 0; blade < 4; blade++) {
    const a = blade * Math.PI * .5, dx = Math.cos(a), dz = Math.sin(a), o = blade * 5;
    grassPos.push(-dz * .07, 0, dx * .07, dz * .07, 0, -dx * .07, dx * .17 - dz * .04, .58, dz * .17 + dx * .04, dx * .17 + dz * .04, .58, dz * .17 - dx * .04, dx * .35, 1, dz * .35);
    for (const k of [0, 0, .55, .55, 1]) { const col = grassLow.clone().lerp(grassHigh, k); grassColors.push(col.r, col.g, col.b); }
    grassIndices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
  }
  const grassG = new THREE.BufferGeometry(); grassG.setAttribute('position', new THREE.Float32BufferAttribute(grassPos, 3)); grassG.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3)); grassG.setIndex(grassIndices);
  const grassNormals = new Float32Array(grassPos.length); for (let i = 1; i < grassNormals.length; i += 3) grassNormals[i] = 1; grassG.setAttribute('normal', new THREE.BufferAttribute(grassNormals, 3));
  const grassM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }); grassM.userData.setOwned = true;
  const grassUniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uSunDir: { value: new THREE.Vector3(6, 13, 9).normalize() },
    uSunColor: { value: new THREE.Color(0xfff0d8) },
    uDayFade: { value: 1 },
  };
  grassM.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, grassUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uDayFade;\nvarying float vGrassTip;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal=normalize(vNormal);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 Lv=normalize((viewMatrix*vec4(uSunDir,0.0)).xyz);
  vec3 Vv=normalize(vViewPosition);
  float back=pow(clamp(dot(-Vv,Lv)*0.5+0.5,0.0,1.0),2.0);
  float tip=pow(clamp(vGrassTip,0.0,1.0),1.4);
  reflectedLight.directDiffuse+=diffuseColor.rgb*uSunColor*vec3(0.75,0.90,0.35)*(0.18+0.32*back)*tip*uDayFade;
}`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nvarying float vGrassTip;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  vec2 ip=vec2(instanceMatrix[3][0],instanceMatrix[3][2]);
  #else
  vec2 ip=vec2(0.0);
  #endif
  float hh=max(position.y,0.0);
  vGrassTip=hh;
  float ph=uTime*1.6+ip.x*0.31+ip.y*0.23;
  float gust=0.55+0.45*sin(uTime*0.37+ip.x*0.05-ip.y*0.04);
  float sw=(sin(ph)*0.7+sin(ph*2.7+ip.y)*0.3)*gust*uWind;
  transformed.x+=sw*hh*hh*0.32;
  transformed.z+=sw*hh*hh*0.12;
}`);
  };
  grassM.customProgramCacheKey = () => `remote-grass-wind-sss-v2`;
  const matrices: THREE.Matrix4[] = []; const grassRandom = rng(kind === 'pond' ? 583 : 584);
  for (let i = 0; i < 40000 && matrices.length < 18000; i++) {
    const x = cx + (grassRandom() - .5) * 30, z = cz + (grassRandom() - .5) * 30;
    const distance = Math.hypot(x - cx, z - cz), a = Math.atan2(z - cz, x - cx);
    if (kind === 'pond' && distance < (waterRadius?.(a) ?? 3.5) + .10) continue;
    if (kind === 'wolves' && x > 13 && x < 15.2 && z > -3.2 && z < 1.2) continue;
    if (kind === 'pond' && x > -6.2 && x < 2 && z < 9 && z > -2 && Math.abs(x - (-3.6 + (6 - z) * .8)) < .8) continue;
    const patch = .5 + .5 * Math.sin(x * 1.8 + Math.cos(z)) * Math.cos(z * 1.7);
    if (grassRandom() > .55 + patch * .4) continue;
    const h = .065 + grassRandom() * .09 + (kind === 'wolves' && x > 13 ? .035 : 0);
    matrices.push(xf([x, heightAt(x, z) + .028, z], [0, grassRandom() * Math.PI * 2, 0], [h * 1.2, h, h * 1.2]));
  }
  const grass = new THREE.InstancedMesh(grassG, grassM, matrices.length);
  const ic = new THREE.Color(), warm = new THREE.Color(0xc2cf78), lush = new THREE.Color(0x9ec06c), cool = new THREE.Color(0x7ca65c);
  for (let i = 0; i < matrices.length; i++) {
    grass.setMatrixAt(i, matrices[i]);
    const t = grassRandom();
    ic.copy(t < .34 ? warm : t < .68 ? lush : cool).multiplyScalar(.90 + grassRandom() * .18);
    grass.setColorAt(i, ic);
  }
  grass.instanceMatrix.needsUpdate = true; if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.computeBoundingSphere(); grass.receiveShadow = true; grass.name = `set:location:${kind}:grass`; root.add(grass);
  root.userData.grassUniforms = grassUniforms;
  // Distant misty pine-ridge ring matching the main yard's aerial-perspective horizon.
  const horizon = buildPineRidgeHorizon([
    { radius: 48, base: 3.5, amp: 4.0, color: 0x274d33, seed: kind === 'pond' ? 11 : 21 },
    { radius: 68, base: 5.5, amp: 5.2, color: 0x325849, seed: kind === 'pond' ? 12 : 22 },
  ], heightAt, cx, cz);
  horizon.mesh.name = `set:location:${kind}:horizon`;
  root.add(horizon.mesh);
  root.userData.horizonUniforms = horizon.uniforms;
  // A distinct deciduous grove: near birches, leafy understorey and deeper pine silhouettes.
  const spots = forestNatureLayout(kind, waterRadius);
  for (const [id, ss] of Object.entries(spots)) nature.add(root, id as NatureId, ss, id.startsWith('Pine') || id.startsWith('Birch'));
  root.visible = false;
  return root;
}
