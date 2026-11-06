/**
 * EDIT-PLAN (#1033): the harness of `edit-plan.e2e.ts`, served by the Vite dev server (never built). The home's stage in edit mode
 * without the 3D scene (the plan view, a device without WebGL or after the renderer failed), on the growing village with the saved
 * layouts shown, as the review measured it: `?case=view` the plan alone, `hand` a road in hand (its legal cells lit), `pending` the
 * road placed (the still bubble over the panel).
 */
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { createRoot } from "react-dom/client";
import "../../src/styles/fonts.css";
import "../../src/styles/theme.css";
import VillageStage from "../../src/components/containers/village-stage";
import { HOME_VILLAGE, INVENTORY, LAYOUT_GROWING, LAYOUT_SLOTS } from "../../src/mocks/village-v2";

const CASES = {
  view: {},
  hand: { initialHand: HOME_VILLAGE.holding.initialHand },
  pending: { initialHand: HOME_VILLAGE.placing.initialHand, initialPending: HOME_VILLAGE.placing.initialPending },
} as const;
const shown = CASES[(new URLSearchParams(location.search).get("case") ?? "view") as keyof typeof CASES] ?? CASES.view;

createRoot(document.getElementById("root")!).render(
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">
      <div className="fixed inset-0 flex flex-col bg-background text-foreground">
        <VillageStage village={LAYOUT_GROWING} inventory={INVENTORY} editable editing randomizer={null} layoutSlots={LAYOUT_SLOTS.one} {...shown} />
      </div>
    </MotionConfig>
  </LazyMotion>,
);
