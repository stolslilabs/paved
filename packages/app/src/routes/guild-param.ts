// A guild's page over the Social page (#953) is the URL's `/social?guild=<id>`: the Guild tab opens on it. The profiles' guild
// line (`useOpenGuild`) and the Guild tab's cards write it; the literal keeps this module out of the first load.

/** The search parameter that holds the guild whose page is open. */
export const GUILD_PARAM = "guild";

/** What an opening leaves in the history entry: Close then goes Back, so the entry before is not left twice. */
export interface GuildSheetState {
  guildSheet?: true;
}

/** The guild ID a parameter names, or null. */
export const guildParamOf = (value: string | null): number | null => (value !== null && /^\d{1,12}$/.test(value) ? Number(value) : null);
