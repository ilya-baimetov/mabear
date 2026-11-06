import type { ActorId } from "../../shared/schema";
export const PORTRAITS: Record<ActorId, string> = {
  masha: new URL("./assets/masha.webp", import.meta.url).href,
  bear: new URL("./assets/bear.webp", import.meta.url).href,
  wolf_a: new URL("./assets/wolf_a.webp", import.meta.url).href,
  wolf_b: new URL("./assets/wolf_b.webp", import.meta.url).href,
  lady_bear: new URL("./assets/lady_bear.webp", import.meta.url).href,
  hare: new URL("./assets/hare.webp", import.meta.url).href,
  rosie: new URL("./assets/rosie.webp", import.meta.url).href,
  squirrel: new URL("./assets/squirrel.webp", import.meta.url).href,
  rival_bear: new URL("./assets/rival_bear.webp", import.meta.url).href,
};
