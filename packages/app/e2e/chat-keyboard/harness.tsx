/**
 * CHAT-DRAWER-KEYBOARD (#1025): the harness of `chat-keyboard.e2e.ts`, served by the Vite dev server (never built). `?tab=world`
 * or `?tab=guild` draws the chat page's drawer (`ChatScene`) with that tab's conversation (`ChatConversation fill`), the mocks'
 * messages, as the chat route draws it.
 */
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { createRoot } from "react-dom/client";
import "../../src/styles/fonts.css";
import "../../src/styles/theme.css";
import { ChatConversation } from "../../src/components/containers/chat-conversation";
import { ChatScene } from "../../src/components/scenes/chat-scene";
import { CHAT_BADGES, CHAT_CONVERSATION } from "../../src/mocks/chat";

const no = () => {};
const done = async () => {};
const tab = new URLSearchParams(location.search).get("tab") === "guild" ? "guild" : "world";

createRoot(document.getElementById("root")!).render(
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">
      <ChatScene tab={tab} badges={CHAT_BADGES.conversations} onBack={no} onTabChange={no}>
        <ChatConversation {...CHAT_CONVERSATION[tab]} fill onSend={done} onAction={done} onAnswer={done} onOpenPlayer={no} />
      </ChatScene>
    </MotionConfig>
  </LazyMotion>,
);
