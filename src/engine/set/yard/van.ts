import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { xf } from "../../look";
import { rng } from "../../math/rng";
import { V, beam, box, cyl, mergeTransformedParts, sph, type BuildCtx } from "./geometry";

export function buildVan(c: BuildCtx): void {
  const b = c.bag;
  const cream = 0xc9cec3, trim = 0xb0b7ac, rubber = 0x333a35, red = 0xb25f47;
  // Chipped enamel is a surface treatment, not brown geometry stuck to the body.
  // Remap shell + nose bulge into non-overlapping atlas quadrants so side and front red-cross markings sit cleanly.
  const shellRaw = new RoundedBoxGeometry(2.06, 1.72, 4.22, 5, 0.19);
  const noseRaw = new RoundedBoxGeometry(1.94, 0.84, 0.39, 4, 0.13);
  noseRaw.translate(0, -0.30, 2.03);
  const shellNon = shellRaw.index ? shellRaw.toNonIndexed() : shellRaw; if (shellNon !== shellRaw) shellRaw.dispose();
  const noseNon = noseRaw.index ? noseRaw.toNonIndexed() : noseRaw; if (noseNon !== noseRaw) noseRaw.dispose();
  for (const g of [shellNon, noseNon]) {
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  }
  const bodyGeo = mergeGeometries([shellNon, noseNon], false)!;
  shellNon.dispose(); noseNon.dispose();
  {
    const pos = bodyGeo.attributes.position, nor = bodyGeo.attributes.normal, uv = bodyGeo.attributes.uv;
    for (let i = 0; i < pos.count; i += 3) {
      const nx = (nor.getX(i) + nor.getX(i + 1) + nor.getX(i + 2)) / 3;
      const ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3;
      const nz = (nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2)) / 3;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        const x = pos.getX(idx), y = pos.getY(idx), z = pos.getZ(idx);
        if (ax >= ay && ax >= az) {
          uv.setXY(idx, 0.02 + ((z + 2.11) / 4.22) * 0.46, 0.05 + ((y + 0.86) / 1.72) * 0.90);
        } else if (az >= ay) {
          const u0 = nz > 0 ? 0.52 : 0.76;
          uv.setXY(idx, u0 + ((x + 1.03) / 2.06) * 0.22, 0.52 + ((y + 0.86) / 1.72) * 0.44);
        } else {
          uv.setXY(idx, 0.52 + ((x + 1.03) / 2.06) * 0.46, 0.04 + ((z + 2.11) / 4.22) * 0.42);
        }
      }
    }
    uv.needsUpdate = true;
  }

  let bodyMaterial: THREE.MeshStandardMaterial | undefined;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const random = rng(452); ctx.fillStyle = "#cdd1c7"; ctx.fillRect(0, 0, 1024, 512);
      // Classic red-cross side marking (below side belt at z ≈ -0.25, y_world ≈ 0.96) and front nose marking (x = 0, y_world ≈ 1.34).
      const drawCross = (cx: number, cy: number, arm: number, thick: number) => {
        ctx.fillStyle = "#d4d6cc";
        ctx.fillRect(cx - arm * 1.18, cy - arm * 1.18, arm * 2.36, arm * 2.36);
        ctx.fillStyle = "#ad4536";
        ctx.fillRect(cx - thick / 2, cy - arm, thick, arm * 2);
        ctx.fillRect(cx - arm, cy - thick / 2, arm * 2, thick);
      };
      drawCross(230, 355, 24, 9);
      drawCross(Math.round(0.63 * 1024), Math.round((1 - 0.734) * 512), 16, 6);

      for (let i = 0; i < 750; i++) {
        const x = random() * 1024, y = random() * 512, w = 4 + random() * 50, h = 2 + random() * 15;
        ctx.fillStyle = `rgba(82,94,82,${.008 + random() * .045})`; ctx.fillRect(x, y, w, h);
      }
      for (let i = 0; i < 2400; i++) {
        const x = random() * 1024, y = random() * 512, edge = Math.min(y, 512 - y);
        if (edge > 35 && random() > .3) continue;
        const w = .4 + random() * (edge < 35 ? 8 : 3), h = .5 + random() * (edge < 35 ? 12 : 7);
        ctx.fillStyle = i % 5 === 0 ? "#8d8e77" : i % 3 ? "#68756c" : "#a3a99e";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h * .2); ctx.lineTo(x + w * .6, y + h); ctx.lineTo(x - w * .3, y + h * .55); ctx.closePath(); ctx.fill();
        if (i % 11 === 0) { ctx.strokeStyle = "rgba(75,85,76,.16)"; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + 1, y + h + random() * 24); ctx.stroke(); }
      }
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
      bodyMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .86, color: 0xffffff });
      bodyMaterial.userData.setOwned = true;
      c.extra.disposables.push(texture, bodyMaterial);
    }
  }
  // The old loaf-shaped ambulance has a rounded cab/nose and a shallower roof, not a modern bus box.
  if (bodyMaterial) { const body = new THREE.Mesh(bodyGeo, bodyMaterial); body.name = "set:van:weathered-enamel"; body.position.y = 1.35; body.castShadow = true; body.receiveShadow = true; c.dyn.push(body); }
  else b.add("paint", bodyGeo, cream, xf([0, 1.35, 0]), { aoBottom: .25, jitter: .025 });
  b.add("paint", new RoundedBoxGeometry(2.075, .075, 4.23, 4, .035), 0xb8bfb2, xf([0, 2.225, -.015]));
  // Flush painted belt; front belt leaves a clean center gap for the classic nose red-cross badge.
  for (const side of [-1, 1]) {
    b.add("paint", box(.006, .19, 3.99), red, xf([side * 1.035, 1.34, -.02]), { jitter: .08 });
    b.add("paint", box(.71, .19, .008), red, xf([side * .59, 1.34, 2.181]), { jitter: .09 });
  }
  b.add("paint", box(1.89, .19, .008), red, xf([0, 1.34, -2.116]), { jitter: .09 });

  const glassParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const rubberParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const chromeParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];

  // Rubber seals, dark tinted reflective twin windscreens & side windows, and chrome bezels/trim.
  for (const side of [-1, 1]) {
    const x = side * .457;
    rubberParts.push({ g: new RoundedBoxGeometry(.87, .64, .035, 3, .075), m: xf([x, 1.79, 2.16], [-.15, 0, 0]) });
    glassParts.push({ g: new RoundedBoxGeometry(.78, .55, .028, 3, .065), m: xf([x, 1.79, 2.185], [-.15, 0, 0]) });
    const wiper = beam(V(x - .23, 1.55, 2.24), V(x + .16, 1.69, 2.22), .011, .011, 5);
    b.add("metal", wiper.g, rubber, wiper.m);
    for (const [zz, len] of [[1.29, .68], [-.2, .89], [-1.35, .62]]) {
      rubberParts.push({ g: new RoundedBoxGeometry(.024, .63, len + .08, 3, .035), m: xf([side * 1.035, 1.79, zz]) });
      glassParts.push({ g: new RoundedBoxGeometry(.015, .575, len + .025, 3, .025), m: xf([side * 1.052, 1.79, zz]) });
    }
    // Individual cab door and rear compartment seams, recessed lower panels and handles.
    for (const zz of [.72, -.84, -1.94]) b.add("paint", box(.013, 1.37, .015), 0x7d897b, xf([side * 1.044, 1.24, zz]));
    // Thin panel creases leave the weathered enamel visible instead of covering it with clean slabs.
    for (const y of [.61, 1.11]) b.add("paint", box(.008, .009, .86), 0xa0aa9d, xf([side * 1.042, y, 1.22]));
    for (const zz of [.85, -.76]) b.add("metal", new RoundedBoxGeometry(.035, .045, .19, 2, .02), rubber, xf([side * 1.07, 1.36, zz]));
    // Thin metal side mirror on a visible stalk.
    const arm = beam(V(side * 1.02, 1.55, 1.65), V(side * 1.23, 1.72, 1.82), .018, .018, 6); b.add("metal", arm.g, 0x686f65, arm.m);
    b.add("metal", new RoundedBoxGeometry(.12, .22, .035, 2, .025), rubber, xf([side * 1.23, 1.77, 1.84], [0, side * .2, 0]));
    // Matte pneumatic tyres, pressed steel hubs, chrome center caps and painted wheel-arch lips.
    for (const zz of [1.36, -1.39]) {
      rubberParts.push({ g: cyl(.375, .375, .19, 24), m: xf([side * 1.0, .28, zz], [0, 0, Math.PI / 2]) });
      b.add("metal", cyl(.20, .20, .205, 20), 0x737b6e, xf([side * 1.0, .28, zz], [0, 0, Math.PI / 2]));
      chromeParts.push({ g: cyl(.08, .08, .22, 14), m: xf([side * 1.0, .28, zz], [0, 0, Math.PI / 2]) });
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; b.add("metal", sph(.018, 6, 4), 0x48524a, xf([side * 1.112, .28 + Math.sin(a) * .14, zz + Math.cos(a) * .14])); }
      b.add("paint", new THREE.TorusGeometry(.385, .024, 7, 24, Math.PI), trim, xf([side * 1.06, .28, zz], [0, Math.PI / 2, 0]));
    }
    // Circular headlights in chrome bezels and amber indicators.
    rubberParts.push({ g: cyl(.17, .17, .045, 20), m: xf([side * .65, .96, 2.223], [Math.PI / 2, 0, 0]) });
    chromeParts.push({ g: new THREE.TorusGeometry(.14, .025, 8, 24), m: xf([side * .65, .96, 2.251]) });
    b.add("paint", cyl(.12, .12, .028, 20), 0xe8e2b5, xf([side * .65, .96, 2.265], [Math.PI / 2, 0, 0]));
    b.add("paint", new RoundedBoxGeometry(.19, .075, .035, 2, .025), 0xd9a14e, xf([side * .67, 1.14, 2.22]));
  }
  // Recessed grille, chrome slats, proud bumper and plate create depth on the compact rounded face.
  rubberParts.push({ g: new RoundedBoxGeometry(.64, .27, .035, 2, .045), m: xf([0, .96, 2.228]) });
  for (let i = 0; i < 4; i++) chromeParts.push({ g: box(.53, .018, .02), m: xf([0, .87 + i * .055, 2.255]) });
  b.add("metal", new RoundedBoxGeometry(2.1, .14, .19, 3, .045), 0x687165, xf([0, .55, 2.24]));
  b.add("metal", new RoundedBoxGeometry(2.07, .13, .16, 3, .04), 0x687165, xf([0, .55, -2.16]));
  chromeParts.push({ g: box(1.96, .024, .02), m: xf([0, .55, 2.332]) });
  b.add("paint", new RoundedBoxGeometry(.46, .13, .025, 2, .015), 0xc9c9ac, xf([0, .65, 2.35]));
  // Rear split doors and two tinted reflective windows, matching the compact utility body.
  b.add("paint", box(.025, 1.59, .018), 0x59675b, xf([0, 1.31, -2.126]));
  for (const side of [-1, 1]) {
    for (const x of [side * .07, side * .91]) b.add("paint", box(.025, 1.58, .022), 0x677266, xf([x, 1.31, -2.13]));
    for (const y of [.535, 2.085]) b.add("paint", box(.85, .025, .022), 0x677266, xf([side * .49, y, -2.13]));
    rubberParts.push({ g: new RoundedBoxGeometry(.70, .56, .025, 3, .035), m: xf([side * .47, 1.78, -2.132]) });
    glassParts.push({ g: new RoundedBoxGeometry(.64, .50, .02, 3, .028), m: xf([side * .47, 1.79, -2.151]) });
    b.add("paint", box(.08, .15, .035), red, xf([side * .88, .79, -2.12]));
    b.add("metal", box(.06, .14, .035), rubber, xf([side * .08, 1.19, -2.14]));
    for (const y of [.8, 1.7]) b.add("metal", box(.11, .075, .04), 0x7b8476, xf([side * .92, y, -2.15]));
  }
  const glassGeo = mergeTransformedParts(glassParts);
  if (glassGeo) {
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b282e, roughness: 0.12, metalness: 0.18, envMapIntensity: 1.4 });
    glassMat.userData.setOwned = true; c.extra.disposables.push(glassMat);
    const gm = new THREE.Mesh(glassGeo, glassMat); gm.name = "set:van:glass"; gm.castShadow = false; gm.receiveShadow = true; c.dyn.push(gm);
  }
  const rubberGeo = mergeTransformedParts(rubberParts);
  if (rubberGeo) {
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x232724, roughness: 0.92, metalness: 0.0 });
    rubberMat.userData.setOwned = true; c.extra.disposables.push(rubberMat);
    const rm = new THREE.Mesh(rubberGeo, rubberMat); rm.name = "set:van:rubber"; rm.castShadow = true; rm.receiveShadow = true; c.dyn.push(rm);
  }
  const chromeGeo = mergeTransformedParts(chromeParts);
  if (chromeGeo) {
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dedc, roughness: 0.16, metalness: 0.88, envMapIntensity: 1.3 });
    chromeMat.userData.setOwned = true; c.extra.disposables.push(chromeMat);
    const cm = new THREE.Mesh(chromeGeo, chromeMat); cm.name = "set:van:chrome"; cm.castShadow = false; cm.receiveShadow = true; c.dyn.push(cm);
  }
  // Restrained weathering around wheel arches and the lower sill, not raised decorative spots.
  const r = rng(188);
  for (let i = 0; i < 140; i++) {
    const side = i % 2 ? 1 : -1, zz = -1.8 + r() * 3.6, y = .56 + r() * .31;
    b.add("paint", box(.002, .008 + r() * .048, .005 + r() * .025), i % 3 ? 0x69766a : 0x8c8c72, xf([side * 1.043, y, zz], [r() * .5, 0, 0]));
  }
  // Emergency number seen on the source vehicle. Unbranded, with a faded red ink treatment.
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#d4c6ad"; ctx.font = "bold condensed 64px sans-serif"; ctx.textAlign = "center"; ctx.fillText("МЕДИЦИНСКАЯ ПОМОЩЬ", 512, 84);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide });
      for (const side of [-1, 1]) { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .15), material); mesh.position.set(side * 1.047, 1.34, -.4); mesh.rotation.y = side * Math.PI / 2; c.dyn.push(mesh); c.extra.disposables.push(mesh.geometry); }
      c.extra.disposables.push(texture, material);
      const back = document.createElement("canvas"); back.width = 128; back.height = 64; const backCtx = back.getContext("2d");
      if (backCtx) {
        backCtx.fillStyle = "#a35b43"; backCtx.font = "bold 50px sans-serif"; backCtx.textAlign = "center"; backCtx.fillText("03", 64, 54);
        const backTexture = new THREE.CanvasTexture(back); backTexture.colorSpace = THREE.SRGBColorSpace;
        const backMat = new THREE.MeshStandardMaterial({ map: backTexture, transparent: true, depthWrite: false, roughness: 1 });
        const number = new THREE.Mesh(new THREE.PlaneGeometry(.49, .25), backMat); number.position.set(.48, 1.28, -2.164); number.rotation.y = Math.PI; c.dyn.push(number);
        c.extra.disposables.push(number.geometry, backTexture, backMat);
      }
    }
  }
}
