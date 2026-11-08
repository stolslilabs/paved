import { GuildScene } from "../../components/scenes/guild-scene";
import { useDrawerRoute } from "../drawer-route";
import { useBack } from "../ref";
import { GuildContent } from "../social/guild-content";
import { ProfilesBelowDesktop } from "../social/profiles-below-desktop";

/**
 * Another guild's page at `?guild=` on any page (DRAWER-NAV-IN-PLACE, `page-views-host.tsx`), loaded with this page's chunk: a chunk of
 * its own split the guild's page (`guild-view.tsx`) out of it, three more names in the first load's preload map.
 */
export { GuildView } from "../social/guild-view-host";

/**
 * `/guild` (#973, PvP v2 step 1 on the mock): the guild page, in place of the Social page's Guild tab. The finder for a player in
 * no guild, the player's guild for a member (#953); another guild's page in a sheet over it at `?guild=<id>` (the profiles'
 * guild line and the guild cards open it); the old `/social?guild=` links land here (`router.tsx`). Its own chunk.
 * GUILD-PAGE: drawn in the HUD's drawer over the home at every width (`PageDef.drawer`, `home-hosts.tsx`); the players' profiles
 * (#952) are the home's host's, the home mounted under the drawer, as the League's rivals'. Drawn alone (no home under it: a test's
 * plain route), the page hosts them itself below `desktop`, as before.
 */
export default function Page() {
  // The HUD's drawer over the home (`home-hosts.tsx`), shown while its route is the current one; alone (a story's route), open, its
  // Back up to the village.
  const drawer = useDrawerRoute();
  const back = useBack();
  return (
    <>
      <GuildScene open={drawer?.open ?? true} onBack={drawer?.onClose ?? back} returnFocus={drawer?.returnFocus}>
        <GuildContent />
      </GuildScene>
      {!drawer && <ProfilesBelowDesktop />}
    </>
  );
}
