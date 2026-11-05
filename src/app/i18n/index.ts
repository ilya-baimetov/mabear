import type { Lang } from "../../shared/schema";
import { en, type Strings } from "./en";
import { ru } from "./ru";

export const STRINGS: Record<Lang, Strings> = { en, ru };
export type { Strings };
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
