import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";

// The pages the URL opens over any page (DRAWER-NAV-IN-PLACE, #1064): another player's public profile (#952), `?player=<id>`, and
// another guild's page (#953), `?guild=<id>`. A link opens them, and Back closes them. A tap on a player's name or avatar where the
// app lists other players (the battle logs' cards, the search's results, the guild's members, the friends and the chat) opens a
// profile (`useOpenPlayer`, `open-player.ts`), a guild's card or a profile's guild line a guild (`useOpenGuild`), and `/player/:id`
// lands on the home with it (`router.tsx`). The home mounts the host (and below `desktop` the pages that are not drawn over it); each
// page draws itself in the open drawer's place. None of it is in the shell's first load: the host (`page-views-host.tsx`), then the
// profile and the guild with their reads, are their own chunks, fetched when one is first asked for.

const Host = lazy(() => import("./page-views-host"));

/** The pages of the URL's `?player=` and `?guild=`, mounted once one is first asked for, so their chunks load only then. */
export function PlayerProfileHost() {
  const [params] = useSearchParams();
  const [asked, setAsked] = useState(false);
  // `PLAYER_PARAM` and `GUILD_PARAM` (`player-param.ts`, `guild-param.ts`), as literals: those modules stay out of the home's first load.
  if (!asked && (params.has("player") || params.has("guild"))) setAsked(true);
  return asked ? (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  ) : null;
}
