import type { Lang } from "../../shared/schema";
import { en, type Strings } from "./en";
import { ru } from "./ru";

export const STRINGS: Record<Lang, Strings> = { en, ru };
export type { Strings };
const russianScenePlural = new Intl.PluralRules("ru");
export function sceneCount(count: number, lang: Lang): string {
  const form = russianScenePlural.select(count);
  const word = lang === "en" ? (count === 1 ? "scene" : "scenes")
    : form === "one" ? "сцена" : form === "few" ? "сцены" : "сцен";
  return `${count} ${word}`;
}
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
