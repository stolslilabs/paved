/** The four Storybook viewports (`.storybook/preview.tsx`, the named breakpoints of section 3.4). */
export const VIEWPORTS = ["mobile", "tablet", "desktop", "wide"] as const;
export type Viewport = (typeof VIEWPORTS)[number];

/** A scene story pinned to one viewport: every state of a scene is told at the four breakpoints. */
export function at<S extends { globals?: Record<string, unknown> }>(viewport: Viewport, story: S): S {
  return { ...story, globals: { ...story.globals, viewport: { value: viewport, isRotated: false } } };
}
