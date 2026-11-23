// Grounded actor contact shadow discs (one instanced draw call).
import * as THREE from "three";
import { ACTOR_IDS, type ActorId } from "../../shared/schema";
import type { CharacterRig, FrameState } from "../api";

export const ACTOR_SHADOW_RADIUS: Record<ActorId, number> = {
  bear: 0.72,
  rival_bear: 0.78,
  lady_bear: 0.68,
  wolf_a: 0.44,
  wolf_b: 0.42,
  masha: 0.30,
  rosie: 0.36,
  hare: 0.28,
  squirrel: 0.24,
};

export function createContactShadows() {
  let texture: THREE.CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0.0, "rgba(255,255,255,0.68)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.34)");
      grad.addColorStop(0.8, "rgba(255,255,255,0.08)");
      grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
    }
  }
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const alphas = new Float32Array(ACTOR_IDS.length);
  const alphaAttr = new THREE.InstancedBufferAttribute(alphas, 1);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aShadowAlpha", alphaAttr);

  const material = new THREE.MeshBasicMaterial({
    color: 0x161c15,
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    if (shader.vertexShader.includes("#include <common>") && shader.vertexShader.includes("#include <begin_vertex>")) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aShadowAlpha;\nvarying float vShadowAlpha;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShadowAlpha = aShadowAlpha;");
    }
    if (shader.fragmentShader.includes("#include <common>") && shader.fragmentShader.includes("#include <map_fragment>")) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vShadowAlpha;")
        .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a *= vShadowAlpha;");
    }
  };
  material.customProgramCacheKey = () => "stage:contact-shadows-v1";

  const mesh = new THREE.InstancedMesh(geometry, material, ACTOR_IDS.length);
  mesh.name = "stage:contact-shadows";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  mesh.visible = false;

  const dummy = new THREE.Object3D();
  return {
    mesh,
    update(rigs: Record<ActorId, CharacterRig>, frame: FrameState, location: string, stars: number, lifts: Partial<Record<ActorId, number>>) {
      if (!texture) {
        mesh.visible = false;
        return;
      }
      material.color.setHex(location === "house" ? 0x241a12 : 0x161e14);
      const baseStrength = location === "house" ? 0.36 : Math.max(0.20, 0.44 - 0.18 * stars);
      let count = 0;
      for (const id of ACTOR_IDS) {
        const a = frame.actors?.[id];
        const rig = rigs[id];
        if (!a || !rig || !rig.root.visible || a.posture === "offstage") continue;
        const supportY = a.pos[1] + (lifts[id] ?? 0);
        const extraAir = Math.max(0, rig.root.position.y - supportY) + (a.verb === "jump" ? Math.max(0, a.hipsOffset[1]) : 0);
        const heightFade = Math.max(0, 1 - extraAir / 0.75);
        const alpha = baseStrength * THREE.MathUtils.clamp(a.opacity, 0, 1) * heightFade;
        if (alpha <= 0.01) continue;
        const r = ACTOR_SHADOW_RADIUS[id] * (a.posture === "sit" || a.posture === "sleep" ? 1.15 : 1.0) * (1 - 0.25 * Math.min(1, extraAir));
        dummy.position.set(rig.root.position.x, supportY + 0.005, rig.root.position.z);
        dummy.rotation.set(0, a.yaw, 0);
        dummy.scale.set(r * 2.1, 1, r * 1.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(count, dummy.matrix);
        alphas[count] = alpha;
        count++;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        alphaAttr.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}
