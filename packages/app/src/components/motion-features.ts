/**
 * The Motion feature set, in its own module so that the bundler splits it into a chunk that loads after paint.
 * `domMax` (animation, gestures, layout): the tab highlight's shared `layoutId` and the animated list's `layout` need
 * the layout features that `domAnimation` lacks (F3b, `docs/client/v2-architecture.md` section 3.2).
 */
export { domMax as default } from "motion/react";
