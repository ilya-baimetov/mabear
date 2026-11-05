// Props (spec §6.1). Default locations for the set's initial state.
import type { PropId, PropLocation } from "../schema";

export interface PropDef {
  id: PropId;
  name: { en: string; ru: string };
  edible: boolean;
  home: PropLocation;
  description: string;
}

export const PROPS: Record<PropId, PropDef> = {
  jam_jar: { id: "jam_jar", name: { en: "jam jar", ru: "банка варенья" }, edible: true, home: "table", description: "A jar of raspberry jam (Masha's favourite)" },
  honey_pot: { id: "honey_pot", name: { en: "honey pot", ru: "горшок мёда" }, edible: true, home: "beehive", description: "A clay pot of honey from Bear's hives" },
  pancakes: { id: "pancakes", name: { en: "pancakes", ru: "блины" }, edible: true, home: "hidden", description: "A stack of pancakes (appear after cooking)" },
  frying_pan: { id: "frying_pan", name: { en: "frying pan", ru: "сковородка" }, edible: false, home: "table", description: "Bear's frying pan for pancakes" },
  ball: { id: "ball", name: { en: "ball", ru: "мяч" }, edible: false, home: "clearing", description: "A striped rubber ball" },
  fishing_rod: { id: "fishing_rod", name: { en: "fishing rod", ru: "удочка" }, edible: false, home: "pier", description: "Bear's bamboo fishing rod" },
  fish: { id: "fish", name: { en: "fish", ru: "рыба" }, edible: true, home: "hidden", description: "A fish (appears when caught)" },
  lollipop: { id: "lollipop", name: { en: "lollipop", ru: "леденец" }, edible: true, home: "hidden", description: "A swirly lollipop" },
  flowers: { id: "flowers", name: { en: "flowers", ru: "цветы" }, edible: false, home: "garden", description: "A bunch of wildflowers" },
  carrot: { id: "carrot", name: { en: "carrot", ru: "морковка" }, edible: true, home: "garden", description: "A carrot from Bear's garden bed" },
  broom: { id: "broom", name: { en: "broom", ru: "метла" }, edible: false, home: "porch", description: "A twig broom" },
  book: { id: "book", name: { en: "book", ru: "книжка" }, edible: false, home: "bench", description: "A picture book" },
  pillow: { id: "pillow", name: { en: "pillow", ru: "подушка" }, edible: false, home: "hammock", description: "A soft pillow (the only acceptable 'weapon': pillow bonks)" },
  bucket: { id: "bucket", name: { en: "bucket", ru: "ведро" }, edible: false, home: "pier", description: "A tin bucket" },
  watering_can: { id: "watering_can", name: { en: "watering can", ru: "лейка" }, edible: false, home: "garden", description: "A green watering can" },
  flour_bag: { id: "flour_bag", name: { en: "flour bag", ru: "мешок муки" }, edible: false, home: "table", description: "A bag of flour (makes a big white cloud)" },
  cake: { id: "cake", name: { en: "cake", ru: "торт" }, edible: true, home: "hidden", description: "A birthday cake" },
  teapot: { id: "teapot", name: { en: "teapot", ru: "чайник" }, edible: false, home: "table", description: "The samovar teapot on the table" },
};
