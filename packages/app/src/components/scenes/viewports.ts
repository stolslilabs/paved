/**
 * The widths a scene or container story is told at: the values of the `viewport` arg, a radio in Controls
 * (`.storybook/preview.tsx`). Heights are those of a device of that width: a phone, a large phone (portrait), a tablet
 * (landscape), a laptop. The names are not the theme's breakpoint names (section 3.4 of `v2-architecture.md`):
 * 640 is `mobile` here and `tablet` in `theme.css`, 1024 is `tablet` here and `desktop` there, 1440 `desktop` and `wide`.
 */
export const VIEWPORT_FRAMES = {
  "small-mobile": { label: "small mobile 360", width: 360, height: 740 },
  mobile: { label: "mobile 640", width: 640, height: 900 },
  tablet: { label: "tablet 1024", width: 1024, height: 768 },
  desktop: { label: "desktop 1440", width: 1440, height: 900 },
} as const;
export type ViewportName = keyof typeof VIEWPORT_FRAMES;
export const VIEWPORT_NAMES = Object.keys(VIEWPORT_FRAMES) as ViewportName[];
export const DEFAULT_VIEWPORT: ViewportName = "mobile";

/** Scenes and containers are framed unless their story says `viewportFrame: false`; every other story only if it says `true`. */
export function isFramed(title: string, viewportFrame: boolean | undefined): boolean {
  return viewportFrame ?? (title.startsWith("Scenes/") || title.startsWith("Containers/"));
}
