import { chatTabOf, type ChatTab } from "./chat-param";

const KEY = "chat-tab";

/** Kept beside `localStorage`, as `score-open` is: with storage off the choice holds for the visit. */
let memory: ChatTab | null = null;

/**
 * The chat page's last tab used on this device (#973: the page opens on it), or null the first time (the page then opens on
 * Guild for a member, on the World for anyone else), with storage off, or for a value not written here.
 */
export function chatTabStored(): ChatTab | null {
  if (memory !== null) return memory;
  try {
    return chatTabOf(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Keeps the tab. A refused write is not an error: the next visit opens on the first time's tab. */
export function storeChatTab(tab: ChatTab): void {
  memory = tab;
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    // Storage off: the in-memory choice above is all there is.
  }
}

/** For the tests: forget the in-memory choice. */
export function resetChatTabForTests(): void {
  memory = null;
}
