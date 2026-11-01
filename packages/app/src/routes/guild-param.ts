// A guild's page (#953) is the URL's `/guild?guild=<id>` (#973; `/social?guild=` before, which lands there): the guild page opens
// it in a sheet. The profiles' guild line (`useOpenGuild`) and the guild cards write it; the literal keeps this module out of the
// first load.

/** The search parameter that holds the guild whose page is open. */
export const GUILD_PARAM = "guild";

/** What an opening leaves in the history entry: Close then goes Back, so the entry before is not left twice. */
export interface GuildSheetState {
  guildSheet?: true;
}

/** The guild ID a parameter names, or null. */
export const guildParamOf = (value: string | null): number | null => (value !== null && /^\d{1,12}$/.test(value) ? Number(value) : null);
