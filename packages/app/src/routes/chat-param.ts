// A conversation (#955) is the URL's `/chat?chat=<id>` (#973; `/social?chat=` before, which lands there): the chat page opens on
// it. The profile's Message, the friends' rows and the chat's list write it; the literal keeps this module out of the first load.

/** The search parameter that holds the conversation open on the chat page. */
export const CHAT_PARAM = "chat";

/** What an opening leaves in the history entry: Back then goes back, so the list's entry is not left twice. */
export interface ChatSheetState {
  chatSheet?: true;
}

/** The conversation ID a parameter names (its shape only: the source says whether the player may read it), or null. */
export const chatParamOf = (value: string | null): string | null => (value !== null && /^(world|guild:\d{1,15}|dm:[^:\s]{1,80}:[^:\s]{1,80})$/.test(value) ? value : null);
