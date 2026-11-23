import { useRef, useSyncExternalStore } from "react";
import { store, type AppState } from "./store";
import { STRINGS } from "./i18n";

export function useStore(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Shallow equality helper for selector slices (primitives, arrays, plain objects). */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keysA = Object.keys(recA);
  const keysB = Object.keys(recB);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(recB, key) || !Object.is(recA[key], recB[key])) {
      return false;
    }
  }
  return true;
}

/** Subscribe to a derived slice of AppState using cached ref comparison to skip unrelated renders. */
export function useStoreSelector<T>(
  selector: (state: AppState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{
    hasValue: boolean;
    state: AppState | null;
    selector: ((state: AppState) => T) | null;
    slice: T | undefined;
  }>({
    hasValue: false,
    state: null,
    selector: null,
    slice: undefined,
  });

  const getSnapshot = () => {
    const state = store.getState();
    if (cache.current.hasValue && cache.current.state === state && cache.current.selector === selector) {
      return cache.current.slice as T;
    }
    const next = selector(state);
    if (cache.current.hasValue && isEqual(cache.current.slice as T, next)) {
      cache.current.state = state;
      cache.current.selector = selector;
      return cache.current.slice as T;
    }
    cache.current = { hasValue: true, state, selector, slice: next };
    return next;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useStrings() {
  const lang = useStoreSelector((s) => s.lang);
  return STRINGS[lang];
}
