import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { formatPoints } from "../src/components/elements/score";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
export const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** Points as the Score writes them. */
export const pts = (n: number) => formatPoints(n);

/** The scenes' lazy chunks, awaited by each file's `afterAll` (`lazy-chunks.ts`). */
export { settleBoardChunks, settleHomeChunks, settleOverChunks } from "./lazy-chunks";
