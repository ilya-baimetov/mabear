import * as THREE from "three";
import type { ActorFrame } from "../api";
import { GeoBag } from "../look";
import { lathe } from "./propRecipes";

/** Attach the flipping pancake mesh inside the frying pan and animate it deterministically during `cook`. */
export function createCookingPancake(panMesh: THREE.Object3D, matteFood: THREE.Material): {
  update(actor?: ActorFrame): void;
  hide(): void;
} {
  const bag = new GeoBag();
  const colorFn = (p: THREE.Vector3, n: THREE.Vector3, o: THREE.Color) => {
    const r = Math.hypot(p.x, p.z);
    if (Math.abs(n.y) > 0.65 && r < 0.078) o.lerp(new THREE.Color(0xc46e22), 0.55);
    else if (r > 0.084) o.lerp(new THREE.Color(0xf4cb78), 0.45);
  };
  const baseProf: [number, number][] = [
    [0, -0.007], [0.086, -0.007], [0.094, -0.003], [0.095, 0.002], [0.088, 0.006], [0, 0.006],
  ];
  bag.add("paint", lathe(baseProf, 20), 0xe6a147, undefined, { colorFn });
  const topLayer: [number, number][] = [
    [0, 0.004], [0.070, 0.004], [0.076, 0.0065], [0.070, 0.009], [0, 0.009],
  ];
  bag.add("paint", lathe(topLayer, 20), 0xedb359, undefined, { colorFn });
  const geo = bag.merged().get("paint")!;
  bag.dispose();
  const cookingPancake = new THREE.Mesh(geo, matteFood);
  cookingPancake.name = "pan:cooking-pancake";
  cookingPancake.castShadow = false;
  cookingPancake.receiveShadow = true;
  cookingPancake.visible = false;
  cookingPancake.position.set(0, 0.015, 0);
  panMesh.add(cookingPancake);

  return {
    hide() {
      cookingPancake.visible = false;
    },
    update(actor) {
      const active = !!(actor && actor.verb === "cook" && actor.action && actor.posture !== "offstage" && actor.opacity > 0);
      cookingPancake.visible = active;
      if (!active) {
        cookingPancake.position.set(0, 0.015, 0);
        cookingPancake.rotation.set(0, 0, 0);
        return;
      }
      const lt = Math.max(0, actor.action!.time);
      const cycle = Math.floor(lt / 1.6);
      const flipT = (lt % 1.6) / 1.6;
      const start = 0.55;
      const endT = 0.95;
      if (flipT >= start && flipT <= endT) {
        const s = (flipT - start) / (endT - start);
        const height = 0.32;
        cookingPancake.position.set(0, 0.015 + 4 * height * s * (1 - s), 0);
        cookingPancake.rotation.set((cycle + s) * Math.PI, 0, 0);
      } else {
        const flipsDone = flipT > endT ? cycle + 1 : cycle;
        cookingPancake.position.set(0, 0.015, 0);
        cookingPancake.rotation.set(flipsDone * Math.PI, 0, 0);
      }
    },
  };
}
