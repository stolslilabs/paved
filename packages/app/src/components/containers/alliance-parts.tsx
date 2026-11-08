import { formatInteger } from "@paved/game-core";
import type { AllianceBadge } from "../../data/social-source";
import { Button } from "../ui/button";
import { AllianceEmblem } from "../elements/alliance-emblem";
import { InlineError } from "../elements/inline-error";
import { rankingArtSources } from "../elements/ranking-art";
import { UiIcon } from "../elements/ui-icon";
import { RAISED, allianceArt, useAllianceActions } from "./alliance-page";

// ALLIANCES: what the Guild page shows of the alliances. A guild's alliance under its tag, the member's Alliance tile beside Chat, and
// on another guild's page what the alliance's leader may do to it (as a profile carries the guild ranks' actions).

/**
 * A guild's alliance under its tag (ALLIANCES): a small raised pill (it presses: it opens the alliance) with the alliance's emblem on its
 * laurel and its name; for a guild in none, "No alliance" written out, muted, not pressed. Left out of a page while it is read.
 */
export function AllianceLine({ badge, onOpen }: { badge: AllianceBadge | null; onOpen?: (id: number) => void }) {
  if (badge === null)
    return (
      <span data-slot="guild-alliance" data-none className="text-xs font-semibold text-muted-foreground">
        No alliance
      </span>
    );
  return (
    <button
      type="button"
      data-slot="guild-alliance"
      aria-label={`Alliance: ${badge.name}`}
      title={badge.name}
      onClick={() => onOpen?.(badge.id)}
      className="state-layer drawer-raised flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-lg pr-2.5 pl-0.5 outline-none"
    >
      <AllianceEmblem emblem={badge.emblem} size="xs" />
      <span className="text-outline min-w-0 truncate pr-0.5 text-xs leading-snug font-bold">{badge.name}</span>
    </button>
  );
}

/**
 * The member's Alliance tile beside the guild header's Chat (ALLIANCES): the same raised tile, the Leaderboard's painted Alliances icon,
 * its red count what waits for the viewer (their guild's invitations, the alliance's requests). It opens the alliance view.
 */
export function AllianceTile({ count = 0, onOpen }: { count?: number; onOpen?: () => void }) {
  return (
    <button
      type="button"
      data-slot="guild-alliance-tile"
      aria-label={count > 0 ? `Alliance, ${formatInteger(count)} waiting` : "Alliance"}
      onClick={onOpen}
      className="state-layer drawer-tile relative flex w-16 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl px-0.5 pt-2.5 pb-2 outline-none"
    >
      <img {...rankingArtSources("alliances", 44)} alt="" draggable={false} decoding="async" className="drawer-icon size-11" />
      {/* On the icon's top right corner (the dock's red square), placed on the tile so a long count stays in it. */}
      {count > 0 && (
        <span aria-hidden data-slot="alliance-tile-badge" className="numeric absolute top-1 right-1 grid h-5 min-w-5 place-items-center rounded-[0.3rem] bg-dock-badge px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background">
          {count > 99 ? "99+" : formatInteger(count)}
        </span>
      )}
      <span className="text-outline text-xs leading-tight font-bold">Alliance</span>
    </button>
  );
}

/** What the alliance's leader may do to another guild, as the route works it out with game-core's checks. */
export type AllianceGuildState =
  /** Not in the alliance: Invite (null), or why not (in another alliance, the alliance full). */
  | { kind: "invite"; refused: string | null }
  /** An invitation is out: Invited, dimmed. */
  | { kind: "invited" }
  /** A guild of the alliance: Make head and Remove. */
  | { kind: "member" };

/** The alliance's leader's actions on a guild, each one a write of the source. */
export type AllianceGuildAction = { type: "invite" } | { type: "make-head" } | { type: "remove" };

/** A raised action's word (the hud dialog's answer's): the painted icon before it, outlined. */
const ACTION = "h-11 min-w-0 gap-1.5 rounded-xl px-2 text-sm font-bold text-outline";

/**
 * On another guild's page, what the alliance's leader may do to it (ALLIANCES), as a profile carries the rank actions: under its header,
 * Invite to <alliance> (raised, its painted shield and plus; Invited dimmed once sent; why not under it); for a guild of theirs, Make head
 * and Remove side by side, each asked in the HUD's dialog first.
 */
export function AllianceGuildActions({ alliance, guild, state, onAction }: { alliance: string; guild: string; state: AllianceGuildState; onAction?: (action: AllianceGuildAction) => Promise<unknown> | void }) {
  const { run, ask, dialog, pending, error } = useAllianceActions(onAction);
  return (
    <section data-slot="alliance-guild-actions" data-state={state.kind} aria-label={alliance} className="flex flex-col gap-1.5">
      {state.kind === "member" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            style={RAISED}
            className={ACTION}
            disabled={pending}
            onClick={() => ask({ title: `Make ${guild} head?`, description: `Its leader then leads ${alliance}; your guild becomes a member guild.`, label: "Make head", art: "crown" }, { type: "make-head" })}
          >
            <UiIcon name="crown" px={24} className="drawer-icon size-6" />
            Make head
          </Button>
          <Button
            variant="ghost"
            style={RAISED}
            className={ACTION}
            disabled={pending}
            onClick={() => ask({ title: `Remove ${guild}?`, description: `It leaves ${alliance} at once. It can come back if invited.`, label: "Remove", art: "kicked", destructive: true }, { type: "remove" })}
          >
            {allianceArt("remove-guild", 24, "drawer-icon size-6")}
            Remove
          </Button>
        </div>
      ) : (
        <Button variant="ghost" style={RAISED} className={ACTION} disabled={pending || state.kind === "invited" || state.refused !== null} onClick={() => void run({ type: "invite" })}>
          {allianceArt("invite-guild", 24, "drawer-icon size-6")}
          <span className="min-w-0 truncate">{state.kind === "invited" ? "Invited" : `Invite to ${alliance}`}</span>
        </Button>
      )}
      {state.kind === "invite" && state.refused && <p className="px-1 text-xs font-semibold text-muted-foreground">{state.refused}</p>}
      <InlineError title={alliance} message={error} />
      {dialog}
    </section>
  );
}
