/**
 * Loader and reader of the Font Awesome Pro scripts (docs/client/v2-architecture.md, section 8).
 *
 * The three files in `public/fontawesome/js` are Font Awesome's "SVG with JavaScript" build. By default they
 * rewrite the DOM (`<i>` to `<svg>`) and watch it for changes, outside React. Here `FontAwesomeConfig` turns both
 * off before they run, so they only fill a library: the `Icon` component asks `FontAwesome.icon()` for the SVG
 * tree of one icon and React renders it.
 *
 * The scripts are 2 MB (`solid.min.js`) and parsed at load, so they are injected after the first render, with a low
 * fetch priority, rather than blocking the app's module in the head. `Icon` shows an empty box of its size until
 * they are ready.
 */
import { useSyncExternalStore } from "react";

/** A node of Font Awesome's abstract tree: what `FontAwesome.icon()` returns in `abstract`. */
export interface FaNode {
  tag: string;
  attributes: Record<string, string>;
  children?: Array<FaNode | string>;
}

interface FaApi {
  icon(
    definition: { prefix: string; iconName: string },
    params?: { classes?: string[]; attributes?: Record<string, string> },
  ): { abstract: FaNode[] } | undefined;
}

declare global {
  interface Window {
    FontAwesome?: FaApi;
    FontAwesomeConfig?: Record<string, unknown>;
  }
}

/** The two styles the owner's files hold: `solid.min.js` registers `fas`, `thin.min.js` registers `fat`. */
export type FaVariant = "solid" | "thin";
const PREFIX: Record<FaVariant, string> = { solid: "fas", thin: "fat" };

/** Core first: the scripts run in this order (`async = false`), and the last one's load event ends the wait. */
export const FA_FILES = ["fontawesome.min.js", "solid.min.js", "thin.min.js"] as const;

/** No DOM rewriting, no mutation observer: React stays in charge of the DOM. */
export const FA_CONFIG = { autoReplaceSvg: false, observeMutations: false } as const;

export type FaState = "idle" | "loading" | "ready" | "failed";

let state: FaState = "idle";
const listeners = new Set<() => void>();

function setState(next: FaState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Inject the scripts once. Safe to call again: only the first call does anything. */
export function loadFontAwesome(base: string = import.meta.env.BASE_URL): void {
  if (state !== "idle" || typeof document === "undefined") return;
  if (window.FontAwesome) return setState("ready");
  setState("loading");
  window.FontAwesomeConfig = { ...window.FontAwesomeConfig, ...FA_CONFIG };
  FA_FILES.forEach((file, i) => {
    const script = document.createElement("script");
    script.src = `${base}fontawesome/js/${file}`;
    script.async = false;
    script.fetchPriority = "low";
    script.addEventListener("error", () => setState("failed"));
    if (i === FA_FILES.length - 1) script.addEventListener("load", () => setState(state === "failed" ? state : "ready"));
    document.head.append(script);
  });
}

/** Load once the browser has painted the first frame (and is idle, where it can tell). */
export function loadFontAwesomeWhenIdle(): void {
  const start = () => loadFontAwesome();
  requestAnimationFrame(() => (typeof requestIdleCallback === "function" ? requestIdleCallback(start) : setTimeout(start, 0)));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The loader's state, as React state. */
export function useFontAwesomeState(): FaState {
  return useSyncExternalStore(subscribe, () => state, () => "idle" as FaState);
}

/** The SVG tree of one icon, or `undefined` before the scripts are ready or when the file has no such icon. */
export function faIconTree(variant: FaVariant, name: string, classes: string[] = []): FaNode | undefined {
  return window.FontAwesome?.icon({ prefix: PREFIX[variant], iconName: name }, { classes })?.abstract[0];
}

/** Test seam: forget the loader's state. */
export function resetFontAwesomeForTests(): void {
  state = "idle";
  listeners.clear();
}
