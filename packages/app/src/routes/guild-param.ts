// A guild's page (#953) is the URL's `?guild=<id>`, on any page since DRAWER-NAV-IN-PLACE (#1064): it opens in the open drawer's
// place, or in its own drawer (`page-views-host.tsx`). `/social?guild=` and the link `/guild/<id>` land on `/guild?guild=`
// (`router.tsx`). The profiles' guild line (`useOpenGuild`) and the guild cards write it; the literal keeps this module out of the
// first load.

/** The search parameter that holds the guild whose page is open. */
export const GUILD_PARAM = "guild";

/** What an opening leaves in the history entry: Close then goes Back, so the entry before is not left twice. */
export interface GuildSheetState {
  guildSheet?: true;
  /** The pages opened in a row before (`PlayerSheetState.views`). */
  views?: number;
}

/** The guild ID a parameter names, or null. */
export const guildParamOf = (value: string | null): number | null => (value !== null && /^\d{1,12}$/.test(value) ? Number(value) : null);
