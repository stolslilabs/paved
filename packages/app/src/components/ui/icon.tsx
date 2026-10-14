import { createElement, useEffect, useMemo, type ReactNode } from "react";
import { faIconTree, loadFontAwesome, useFontAwesomeState, type FaNode, type FaVariant } from "../../lib/font-awesome";

/** Literal classes, so Tailwind sees them. Font Awesome sizes an icon at 1em, so the size is the font size. */
const SIZES = {
  xs: "text-[0.75rem]",
  sm: "text-[1rem]",
  md: "text-[1.25rem]",
  lg: "text-[1.5rem]",
  xl: "text-[2rem]",
} as const;

export type IconSize = keyof typeof SIZES;

export interface IconProps {
  /** The Font Awesome name without `fa-`: "house", "sack-dollar". */
  name: string;
  /** Which of the owner's files: `solid` (`solid.min.js`, every solid icon) or `thin` (`thin.min.js`, one icon so far). */
  variant?: FaVariant;
  /** 12, 16, 20, 24 or 32 px. Default `md`. */
  size?: IconSize;
  /** The accessible name. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  /** A fixed 1.25em width, so a column of icons lines up and the icon does not shift the text when it replaces its box. */
  fixedWidth?: boolean;
  className?: string;
}

/** Font Awesome's tree to React elements: the SVG is React's, not a string set into the DOM. */
function toElement(node: FaNode | string, key: number, extra: Record<string, unknown> = {}): ReactNode {
  if (typeof node === "string") return node;
  const { class: className, ...attributes } = node.attributes;
  return createElement(node.tag, { ...attributes, className, ...extra, key }, ...(node.children ?? []).map((c, i) => toElement(c, i)));
}

/**
 * An icon from the Font Awesome Pro files (section 8), as an inline SVG that `currentColor` paints.
 * The scripts load after the first render, so until they are ready (or if they fail) it is an empty box 1em high.
 * Its width is exact only with `fixedWidth` (1.25em, as the drawn icon); otherwise the drawn icon takes its width
 * from its viewBox (0.125em, "pipe", to 1.25em, "user-group"; "house" is 1.125em), so text beside it can
 * move by up to 0.875em (narrow icons) or 0.25em (wide ones) when the scripts arrive. Use `fixedWidth` where that must not happen.
 */
export function Icon({ name, variant = "solid", size = "md", label, fixedWidth, className }: IconProps) {
  useEffect(() => loadFontAwesome(), []);
  const ready = useFontAwesomeState() === "ready";
  const tree = useMemo(
    () => (ready ? faIconTree(variant, name, fixedWidth ? ["fa-fw"] : []) : undefined),
    [ready, variant, name, fixedWidth],
  );
  const classes = [SIZES[size], className].filter(Boolean).join(" ");
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  if (!tree) return <span {...a11y} data-icon={name} style={{ width: fixedWidth ? "1.25em" : "1em" }} className={`inline-block h-[1em] align-[-0.125em] ${classes}`} />;

  // Font Awesome's own `aria-hidden`, `role` and `focusable` give way to ours; its class keeps the sizing CSS it injects.
  const { "aria-hidden": _hidden, role: _role, focusable: _focusable, ...attributes } = tree.attributes;
  const extra = { ...a11y, focusable: "false", "data-icon": name, className: `${attributes.class} ${classes}` };
  return toElement({ ...tree, attributes }, 0, extra);
}
