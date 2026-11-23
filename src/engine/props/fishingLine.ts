import * as THREE from "three";
import { FISHING_WATER_TARGET, MARKS } from "../../shared/bible/set";
import { smooth } from "../../shared/math";
import type { Vec3 } from "../../shared/schema";
import type { ActorFrame } from "../api";
import { cyl, sph } from "./propRecipes";

const _up = new THREE.Vector3(0, 1, 0);
const _tipWorld = new THREE.Vector3();
const _baseWorld = new THREE.Vector3();
const _hangWorld = new THREE.Vector3();
const _launchWorld = new THREE.Vector3();
const _waterTarget = new THREE.Vector3();
const _reelStartWorld = new THREE.Vector3();
const _endWorld = new THREE.Vector3();
const _floatWorld = new THREE.Vector3();
const _invLineMat = new THREE.Matrix4();

function bobberOnWaterAt(time: number, uVal: number, out: THREE.Vector3): { pulse: number; bite: number } {
  const w = THREE.MathUtils.clamp((uVal - 0.30) / 0.32, 0, 1);
  const impact = -0.025 * Math.exp(-w * 18) * Math.sin(w * 24);
  const ambient = 0.007 * Math.sin(time * 2.8) * Math.min(1, w * 8);
  let bite = 0;
  for (const [center, depth] of [[0.30, 0.042], [0.62, 0.052], [0.88, 0.068]] as const) {
    const d = (w - center) / 0.055;
    bite += depth * Math.exp(-d * d);
  }
  const jitter = bite > 0.005 ? Math.sin(time * 22) * 0.008 * Math.min(1, bite * 20) : 0;
  const ramp = Math.min(1, w * 6);
  const bobY = Math.max(0.016, FISHING_WATER_TARGET[1] + impact + ambient - bite * 0.45 + jitter);
  out.set(
    FISHING_WATER_TARGET[0] + 0.012 * Math.sin(time * 1.1) * ramp,
    bobY,
    FISHING_WATER_TARGET[2] + 0.010 * Math.cos(time * 0.9) * ramp,
  );
  const splashPulse = Math.exp(-w * 10) * 0.9;
  const bitePulse = Math.min(1, bite / 0.055);
  const idleRipple = 0.18 + 0.08 * (0.5 + 0.5 * Math.sin(time * 2.8));
  return { pulse: THREE.MathUtils.clamp(Math.max(idleRipple, splashPulse, bitePulse), 0, 1), bite };
}

/** Attach catenary fishing line + water-contact float to `rod` and update them per frame. */
export function createFishingLine(rod: THREE.Object3D): {
  update(actor: ActorFrame | undefined, attached: boolean): void;
  dispose(): void;
} {
  const lineSagUniform = { value: new THREE.Vector3() };
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe9dfc8 });
  lineMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSagVec = lineSagUniform;
    if (sh.vertexShader.includes("#include <common>") && sh.vertexShader.includes("#include <begin_vertex>")) {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uSagVec;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  float pin = abs(position.y) >= 0.499 ? 0.0 : 1.0;
  float uLine = clamp(position.y + 0.5, 0.0, 1.0);
  float cat = 4.0 * uLine * (1.0 - uLine) * pin;
  transformed += uSagVec * cat;
}`,
        );
    }
  };
  lineMat.customProgramCacheKey = () => "prop:fishing-line-catenary-v1";
  const line = new THREE.Mesh(cyl(0.0025, 0.0025, 1, 6, 16), lineMat);
  line.name = "fishing-line";
  line.userData.sagUniform = lineSagUniform;
  const float = new THREE.Mesh(sph(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8283a, roughness: 0.8 }));
  float.name = "fishing-float";
  rod.add(line, float);

  const tip = new THREE.Vector3(0, 1.5, 0);
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();

  return {
    update(actor, attached) {
      rod.updateWorldMatrix(true, false);
      const atPier = !!(actor && Math.hypot(actor.pos[0] - MARKS.pier.pos[0], actor.pos[2] - MARKS.pier.pos[1]) < 1.3);
      const hasAction = !!(actor && actor.action);
      let sagMeters = 0;
      let bobberPulse = 0;

      if (!attached) {
        // Resting unattached: check if horizontal on pier/surface and drape gently under gravity along -Y
        _baseWorld.set(0, 0, 0).applyMatrix4(rod.matrixWorld);
        _tipWorld.copy(tip).applyMatrix4(rod.matrixWorld);
        const horizontal = Math.abs(_tipWorld.y - _baseWorld.y) < 0.25;
        if (horizontal) {
          end.set(0.08, 0.62, -0.025);
          sagMeters = 0.032;
        } else {
          end.set(0, 0.62, 0.3);
        }
      } else if (!hasAction) {
        // Strict restFrame invariant (< 1e-10 chord & 0 sag when !actor.action)
        if (atPier && (actor!.verb === "fish" || actor!.posture === "sit")) {
          end.fromArray(FISHING_WATER_TARGET);
          rod.worldToLocal(end);
        } else {
          end.set(0, 0.62, 0.3);
        }
        sagMeters = 0;
      } else if (atPier && actor!.verb === "fish" && actor!.action!.duration > 0) {
        const dur = actor!.action!.duration;
        const t = Math.max(0, actor!.action!.time);
        const u = THREE.MathUtils.clamp(t / dur, 0, 1);
        _hangWorld.set(0, 0.62, 0.3).applyMatrix4(rod.matrixWorld);
        _tipWorld.copy(tip).applyMatrix4(rod.matrixWorld);
        _waterTarget.set(FISHING_WATER_TARGET[0], FISHING_WATER_TARGET[1], FISHING_WATER_TARGET[2]);
        if (u < 0.08) {
          const w0 = smooth(u / 0.08);
          _endWorld.copy(_hangWorld).lerp(_tipWorld, 0.12 * w0);
          _endWorld.y -= 0.06 * (1 - w0);
          sagMeters = 0.05;
        } else if (u < 0.30) {
          _launchWorld.copy(_hangWorld).lerp(_tipWorld, 0.12);
          const s = (u - 0.08) / 0.22;
          _endWorld.copy(_launchWorld).lerp(_waterTarget, s);
          _endWorld.y += 1.15 * 4 * s * (1 - s);
          sagMeters = 0.05 + 0.06 * Math.sin(Math.PI * s);
        } else if (u < 0.62) {
          const res = bobberOnWaterAt(t, u, _endWorld);
          bobberPulse = res.pulse;
          sagMeters = THREE.MathUtils.lerp(0.16, 0.035, Math.min(1, res.bite / 0.05));
        } else if (u < 0.70) {
          bobberOnWaterAt(0.62 * dur, 0.62, _reelStartWorld);
          const s = smooth((u - 0.62) / 0.08);
          _endWorld.copy(_reelStartWorld).lerp(_hangWorld, s);
          _endWorld.y += 0.16 * 4 * s * (1 - s);
          bobberPulse = (1 - smooth((u - 0.62) / 0.025)) * 0.35;
          sagMeters = (1 - s) * 0.02;
        } else {
          _endWorld.copy(_hangWorld);
          sagMeters = 0.03;
        }
        end.copy(_endWorld);
        rod.worldToLocal(end);
      } else if (atPier && (actor!.verb === "fish" || actor!.posture === "sit")) {
        end.fromArray(FISHING_WATER_TARGET);
        rod.worldToLocal(end);
        sagMeters = actor!.action!.duration > 0 ? 0.14 : 0;
      } else {
        end.set(0, 0.62, 0.3);
        sagMeters = actor!.action!.duration > 0 ? 0.045 : 0;
      }

      float.position.copy(end);
      direction.copy(end).sub(tip);
      const len = direction.length();
      line.position.copy(tip).add(end).multiplyScalar(0.5);
      line.scale.y = len;
      if (len > 1e-6) line.quaternion.setFromUnitVectors(_up, direction.normalize());
      else line.quaternion.identity();

      if (sagMeters > 0 && len > 1e-4) {
        line.updateWorldMatrix(true, false);
        _invLineMat.copy(line.matrixWorld).invert();
        _invLineMat.elements[12] = 0;
        _invLineMat.elements[13] = 0;
        _invLineMat.elements[14] = 0;
        lineSagUniform.value.set(0, -sagMeters, 0).applyMatrix4(_invLineMat);
      } else {
        lineSagUniform.value.set(0, 0, 0);
      }

      _floatWorld.copy(float.position).applyMatrix4(rod.matrixWorld);
      rod.userData.bobberWorld = [_floatWorld.x, _floatWorld.y, _floatWorld.z] as Vec3;
      rod.userData.bobberPulse = bobberPulse;
      rod.userData.lineSag = sagMeters;
    },
    dispose() {
      line.material.dispose();
      float.material.dispose();
    },
  };
}
