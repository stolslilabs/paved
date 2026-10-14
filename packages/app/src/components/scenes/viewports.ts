/**
 * Two vocabularies for the same four widths. The Storybook toolbar (the Viewport addon, which `Foundations/Breakpoints`
 * pins by key) uses the theme's breakpoint names (section 3.4 of `v2-architecture.md`): `mobile` 360, `tablet` 640,
 * `desktop` 1024, `wide` 1440. The `viewport` arg (the radio in Controls) uses the PM's names, one step down:
 * `small-mobile` 360, `mobile` 640, `tablet` 1024, `desktop` 1440. `TOOLBAR_KEY` maps the arg to the toolbar's key.
 * Heights are those of a device of that width: a phone, a large phone (portrait), a tablet (landscape), a laptop.
 */
export const TOOLBAR_VIEWPORTS = {
  mobile: { name: "mobile 360", width: 360, height: 740, type: "mobile" },
  tablet: { name: "tablet 640", width: 640, height: 900, type: "tablet" },
  desktop: { name: "desktop 1024", width: 1024, height: 768, type: "desktop" },
  wide: { name: "wide 1440", width: 1440, height: 900, type: "desktop" },
} as const;
export type ToolbarViewport = keyof typeof TOOLBAR_VIEWPORTS;

export const TOOLBAR_KEY = {
  "small-mobile": "mobile",
  mobile: "tablet",
  tablet: "desktop",
  desktop: "wide",
} as const satisfies Record<string, ToolbarViewport>;
export type ViewportName = keyof typeof TOOLBAR_KEY;
export const VIEWPORT_NAMES = Object.keys(TOOLBAR_KEY) as ViewportName[];
export const DEFAULT_VIEWPORT: ViewportName = "mobile";

/** The radio's labels: the arg's name and the width it frames. */
export const VIEWPORT_LABELS: Record<ViewportName, string> = Object.fromEntries(
  VIEWPORT_NAMES.map((v) => [v, `${v.replace("-", " ")} ${TOOLBAR_VIEWPORTS[TOOLBAR_KEY[v]].width}`]),
) as Record<ViewportName, string>;

/** The frame of a `viewport` arg value. */
export const frameOf = (viewport: ViewportName) => TOOLBAR_VIEWPORTS[TOOLBAR_KEY[viewport]];

/** Scenes and containers are framed unless their story says `viewportFrame: false`; every other story only if it says `true`. */
export function isFramed(title: string, viewportFrame: boolean | undefined): boolean {
  return viewportFrame ?? (title.startsWith("Scenes/") || title.startsWith("Containers/"));
}

/** The value of the Viewport addon's global. */
export type ViewportGlobal = { value: string | undefined; isRotated?: boolean } | undefined;

/**
 * What the decorator does to the toolbar's global, as a pure step. The rule: **the radio wins.** On a framed story the
 * global follows the arg, so a width the reader picks in the toolbar snaps back to the arg's (the frame and the iframe
 * never disagree). On an unframed story the decorator touches the global only to undo its own earlier setting, back to the
 * story's own value (`initial`: a pinned `globals.viewport`, or none); a reader's own toolbar choice there is kept.
 * `owned` is whether the decorator set the global and has not yet given it back.
 */
export function syncViewportGlobal(input: { framed: boolean; viewport: ViewportName; current: ViewportGlobal; initial: ViewportGlobal; owned: boolean }): { set?: ViewportGlobal; owned: boolean } {
  const { framed, viewport, current, initial, owned } = input;
  if (framed) {
    const want = TOOLBAR_KEY[viewport];
    return current?.value === want && !current.isRotated ? { owned: true } : { set: { value: want, isRotated: false }, owned: true };
  }
  return owned ? { set: initial ?? { value: undefined, isRotated: false }, owned: false } : { owned: false };
}
