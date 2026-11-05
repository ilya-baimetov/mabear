import { useSyncExternalStore } from "react";
import { store, type AppState } from "./store";
import { STRINGS } from "./i18n";

export function useStore(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
export function useStrings() {
  const { lang } = useStore();
  return STRINGS[lang];
}
