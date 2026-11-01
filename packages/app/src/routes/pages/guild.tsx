import { GuildScene } from "../../components/scenes/guild-scene";
import { useBack, useTabNavigate } from "../ref";
import { GuildContent } from "../social/guild-content";
import { ProfilesBelowDesktop } from "../social/profiles-below-desktop";

/**
 * `/guild` (#973, PvP v2 step 1 on the mock): the guild page, in place of the Social page's Guild tab. The finder for a player in
 * no guild, the player's guild for a member (#953); another guild's page in a sheet over it at `?guild=<id>` (the profiles'
 * guild line and the guild cards open it); the old `/social?guild=` links land here (`router.tsx`). Its own chunk.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  return (
    <>
      <GuildScene onBack={onBack} onNavigate={onNavigate}>
        <GuildContent />
      </GuildScene>
      <ProfilesBelowDesktop />
    </>
  );
}
