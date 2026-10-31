import { socialTabOf, type SocialTab } from "../components/containers/social-tabs";

const KEY = "social-tab";

/** Kept beside `localStorage`, as `score-open` is: with storage off the choice holds for the visit. */
let memory: SocialTab | null = null;

/**
 * The Social page's last tab used on this device (#952: the page opens on it). Default, and with storage off or a value not
 * written here: Guild, the first.
 */
export function socialTabStored(): SocialTab {
  if (memory !== null) return memory;
  try {
    return socialTabOf(localStorage.getItem(KEY)) ?? "guild";
  } catch {
    return "guild";
  }
}

/** Keeps the tab. A refused write is not an error: the next visit opens on Guild. */
export function storeSocialTab(tab: SocialTab): void {
  memory = tab;
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    // Storage off: the in-memory choice above is all there is.
  }
}

/** For the tests: forget the in-memory choice. */
export function resetSocialTabForTests(): void {
  memory = null;
}
