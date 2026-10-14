import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

/** The feature set loads after the first paint (section 3.2): `m` components animate once it arrives. */
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/** `LazyMotion` + `m` + `domAnimation`, and one switch for reduced motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
