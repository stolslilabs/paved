/**
 * PUZZLE-FIXES (#1137): the harness of `touch-targets.e2e.ts`, served by the Vite dev server (never built). Play's modes with a
 * Challenge game still open (its Resume, `PLAY.running`) above the Inbox's Mail with a prize waiting (its Claim all, `INBOX_MAIL.one`),
 * each in a phone's 16 px gutter, as the drawer and the chat's Inbox lay them out.
 */
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { createRoot } from "react-dom/client";
import "../../src/styles/fonts.css";
import "../../src/styles/theme.css";
import { MailSection } from "../../src/components/containers/inbox-mail";
import { PlayModes } from "../../src/components/containers/play-modes";
import { INBOX_MAIL } from "../../src/mocks/puzzle";
import { PLAY } from "../../src/mocks/scenes";

const no = () => {};

createRoot(document.getElementById("root")!).render(
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">
      <div className="flex min-h-dvh flex-col gap-6 bg-background px-4 py-4 text-foreground">
        <PlayModes {...PLAY.running} onResume={no} onChallenge={no} onTraining={no} />
        <MailSection {...INBOX_MAIL.one} onClaimAll={no} onOpen={no} />
      </div>
    </MotionConfig>
  </LazyMotion>,
);
