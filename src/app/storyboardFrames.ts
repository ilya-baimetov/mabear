import { useSyncExternalStore } from "react";

// Derived, disposable film stills. Writing and compiled versions remain canonical in the store.
let frames: Record<string, string> = {};
const listeners = new Set<() => void>();
export function publishStoryboardFrames(next: Record<string, string>): void {
  frames = next;
  listeners.forEach(listener => listener());
}
export function useStoryboardFrames(): Record<string, string> {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => frames);
}
