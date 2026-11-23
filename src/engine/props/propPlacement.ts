import { MARKS } from "../../shared/bible/set";
import { HOUSE_PREP_TABLE, HOUSE_READING_TABLE } from "../../shared/houseLayout";
import { PROP_REST_HEIGHT, PROP_SLOTS, propPlacementAtMark } from "../../shared/propPlacement";
import type { MarkId, PropId, Vec3 } from "../../shared/schema";
import { restHeightAt } from "../../shared/yardLayout";
import { PROP_VISUALS, type R3 } from "./propRecipes";

export { PROP_SLOTS };

/** Rest heights the player assigns per mark (player/evaluate PROP_REST_HEIGHT); used to recognise a resting prop. */
const PLAYER_REST_Y = PROP_REST_HEIGHT;

/** If (pos) is a prop resting at a mark (as placed by the player), return that mark. Pure. */
export function restingMark(pos: Vec3): MarkId | null {
  const cupboard = PROP_SLOTS.pantry_honey!;
  if (Math.hypot(pos[0] - cupboard.pos[0], pos[1] - cupboard.pos[1], pos[2] - cupboard.pos[2]) < .01) return "cupboard";
  let best: MarkId | null = null;
  let bestD = 0.6;
  for (const id of Object.keys(MARKS) as MarkId[]) {
    if (
      id === "house_kitchen" &&
      Math.abs(pos[1] - HOUSE_PREP_TABLE.height) < .05 &&
      Math.abs(pos[0] - HOUSE_PREP_TABLE.position[0]) < HOUSE_PREP_TABLE.width / 2 &&
      Math.abs(pos[2] - HOUSE_PREP_TABLE.position[1]) < HOUSE_PREP_TABLE.depth / 2
    ) {
      return id;
    }
    const p = id === "house_kitchen" ? HOUSE_PREP_TABLE.position : id === "house_living" ? HOUSE_READING_TABLE.position : MARKS[id].pos;
    const d = Math.hypot(pos[0] - p[0], pos[2] - p[1]);
    if (d < bestD && Math.abs(pos[1] - (PLAYER_REST_Y[id] ?? 0.03)) < 0.05) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** Final resting transform for a prop given the player's position. Pure. */
export function restPlacement(id: PropId, pos: Vec3): { pos: Vec3; rot: R3 } {
  const mark = restingMark(pos);
  const slot = PROP_SLOTS[id];
  const vis = PROP_VISUALS[id];
  if (mark && slot && slot.mark === mark) return { pos: [...slot.pos] as Vec3, rot: slot.rot ?? vis.restRot ?? [0, 0, 0] };
  if (mark === "house_kitchen" || mark === "house_living") return propPlacementAtMark(id, mark);
  if (mark) {
    // resting at a non-home mark: keep the player's spread, sit on the set's real surface there
    return { pos: [pos[0], restHeightAt(pos[0], pos[2]), pos[2]], rot: vis.restRot ?? [0, 0, 0] };
  }
  return { pos: [pos[0], pos[1], pos[2]], rot: pos[1] > 0.12 ? [0, 0, 0] : vis.restRot ?? [0, 0, 0] };
}
