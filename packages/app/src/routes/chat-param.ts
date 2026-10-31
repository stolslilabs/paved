// A conversation over the Social page (#955) is the URL's `/social?chat=<id>`: the Chat tab opens on it. The profile's Message,
// the Friends tab's rows and the Chat tab's list write it; the literal keeps this module out of the first load.

/** The search parameter that holds the conversation open in the Chat tab. */
export const CHAT_PARAM = "chat";

/** What an opening leaves in the history entry: Back then goes back, so the list's entry is not left twice. */
export interface ChatSheetState {
  chatSheet?: true;
}

/** The conversation ID a parameter names (its shape only: the source says whether the player may read it), or null. */
export const chatParamOf = (value: string | null): string | null => (value !== null && /^(world|guild:\d{1,15}|dm:[^:\s]{1,80}:[^:\s]{1,80})$/.test(value) ? value : null);
