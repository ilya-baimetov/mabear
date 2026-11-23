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
  pantry_honey:{id:'pantry_honey',name:{en:'cupboard honey jar',ru:'банка мёда в шкафу'},edible:true,home:'cupboard',description:'One lidded honey jar in Bear’s upper kitchen cupboard. Open the cupboard before taking it; the shelf stays empty afterwards. Separate from the outdoor honey_pot.'},
  jam_jar: { id: "jam_jar", name: { en: "jam jar", ru: "банка варенья" }, edible: true, home: "table", description: "A jar of raspberry jam (Masha's favourite)" },
  honey_pot: { id: "honey_pot", name: { en: "honey pot", ru: "горшок мёда" }, edible: true, home: "beehive", description: "A clay pot of honey from Bear's hives" },
  pancakes: { id: "pancakes", name: { en: "pancakes", ru: "блины" }, edible: true, home: "hidden", description: "A stack of pancakes (appear after cooking)" },
  frying_pan: { id: "frying_pan", name: { en: "frying pan", ru: "сковородка" }, edible: false, home: "table", description: "Bear's frying pan for pancakes" },
  ball: { id: "ball", name: { en: "ball", ru: "мяч" }, edible: false, home: "clearing", description: "A striped rubber ball" },
  fishing_rod: { id: "fishing_rod", name: { en: "fishing rod", ru: "удочка" }, edible: false, home: "pier", description: "Bear's bamboo fishing rod" },
  fish: { id: "fish", name: { en: "fish", ru: "рыба" }, edible: true, home: "hidden", description: "A fish (appears when caught)" },
  lollipop: { id: "lollipop", name: { en: "lollipop", ru: "леденец" }, edible: true, home: "hidden", description: "A swirly lollipop" },
  flowers: { id: "flowers", name: { en: "flowers", ru: "цветы" }, edible: false, home: "garden", description: "A bunch of wildflowers" },
  carrot: { id: "carrot", name: { en: "carrot number 1", ru: "морковка номер 1" }, edible: true, home: "garden", description: "Carrot 1 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_2: { id: "carrot_2", name: { en: "carrot number 2", ru: "морковка номер 2" }, edible: true, home: "garden", description: "Carrot 2 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_3: { id: "carrot_3", name: { en: "carrot number 3", ru: "морковка номер 3" }, edible: true, home: "garden", description: "Carrot 3 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_4: { id: "carrot_4", name: { en: "carrot number 4", ru: "морковка номер 4" }, edible: true, home: "garden", description: "Carrot 4 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_5: { id: "carrot_5", name: { en: "carrot number 5", ru: "морковка номер 5" }, edible: true, home: "garden", description: "Carrot 5 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_6: { id: "carrot_6", name: { en: "carrot number 6", ru: "морковка номер 6" }, edible: true, home: "garden", description: "Carrot 6 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_7: { id: "carrot_7", name: { en: "carrot number 7", ru: "морковка номер 7" }, edible: true, home: "garden", description: "Carrot 7 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_8: { id: "carrot_8", name: { en: "carrot number 8", ru: "морковка номер 8" }, edible: true, home: "garden", description: "Carrot 8 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  carrot_9: { id: "carrot_9", name: { en: "carrot number 9", ru: "морковка номер 9" }, edible: true, home: "garden", description: "Carrot 9 of 9 in the front garden bed, counted left to right from the yard. One persistent object: planted, picked, held or placed; never refills." },
  broom: { id: "broom", name: { en: "broom", ru: "метла" }, edible: false, home: "porch", description: "A twig broom" },
  book: { id: "book", name: { en: "book", ru: "книжка" }, edible: false, home: "bench", description: "A picture book" },
  pillow: { id: "pillow", name: { en: "pillow", ru: "подушка" }, edible: false, home: "hammock", description: "A soft pillow (the only acceptable 'weapon': pillow bonks)" },
  bucket: { id: "bucket", name: { en: "bucket", ru: "ведро" }, edible: false, home: "pier", description: "A tin bucket" },
  watering_can: { id: "watering_can", name: { en: "watering can", ru: "лейка" }, edible: false, home: "garden", description: "A green watering can" },
  flour_bag: { id: "flour_bag", name: { en: "flour bag", ru: "мешок муки" }, edible: false, home: "table", description: "A bag of flour (makes a big white cloud)" },
  cake: { id: "cake", name: { en: "cake", ru: "торт" }, edible: true, home: "hidden", description: "A birthday cake" },
  teapot: { id: "teapot", name: { en: "teapot", ru: "чайник" }, edible: false, home: "table", description: "The samovar teapot on the table" },
};
