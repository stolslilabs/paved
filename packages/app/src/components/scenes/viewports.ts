/**
 * The options of Storybook's own Viewport toolbar, under the theme's breakpoint names (section 3.4 of
 * `v2-architecture.md`): `mobile` 360, `tablet` 640, `desktop` 1024, `wide` 1440. `Foundations/Breakpoints` pins each by key.
 * There is no default: with none picked, the story takes the full width of the preview, which is the desktop view.
 * Heights are those of a device of that width: a phone, a large phone (portrait), a tablet (landscape), a laptop.
 * `wide` stays as a fixed preview of the widest breakpoint, for a window narrower than 1440.
 */
export const TOOLBAR_VIEWPORTS = {
  mobile: { name: "mobile 360", width: 360, height: 740, type: "mobile" },
  tablet: { name: "tablet 640", width: 640, height: 900, type: "tablet" },
  desktop: { name: "desktop 1024", width: 1024, height: 768, type: "desktop" },
  wide: { name: "wide 1440", width: 1440, height: 900, type: "desktop" },
} as const;

/** The same, in the shape of `parameters.viewport.options`. */
export const VIEWPORT_OPTIONS = Object.fromEntries(
  Object.entries(TOOLBAR_VIEWPORTS).map(([key, v]) => [key, { name: v.name, styles: { width: `${v.width}px`, height: `${v.height}px` }, type: v.type }]),
);

/** An iPhone's viewport (375 x 812), the width the owner checks a screen at first: `parameters` and `globals` of a story pinned to it. */
export const PHONE_375 = {
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, phone: { name: "iPhone 375", styles: { width: "375px", height: "812px" }, type: "mobile" } } } },
  globals: { viewport: { value: "phone", isRotated: false } },
};

/** The widest breakpoint (1440 x 900): `globals` of a story pinned to it. */
export const WIDE_1440 = { globals: { viewport: { value: "wide", isRotated: false } } };
