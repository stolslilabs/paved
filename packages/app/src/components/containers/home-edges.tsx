import { modeIconSources } from "../elements/play-art";
import * as m from "motion/react-m";
import type { CSSProperties } from "react";
import type { MissionProgress } from "../../data/mission-progress";
import { formatPoints } from "../elements/score";
import { uiFrameSources, type UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";

// HOME-EDGES (the owner's asks of 2026-11-04, after the Paved UX Book's main screen): the home's buttons on its edges, its own chunk
// (the home's first load carries their stand-ins only): the right column's four tiles, the Chat tab on the left edge, and the
// mission in progress above the dock. The owner's later asks that day: the book's blue tiles gave way to no tile at all, the icon and its
// name alone over the village on a transparent hit box (after a grey CSS face, then a carved slate, were tried); the orange Chat tab
// stays, redrawn at its new size; the mission's capsule gave way to a veil almost see-through; Collection is named Tiles (as in the
// profile).

/** A tile's side in CSS px (the right column's, square): its hit box, the icon and its name drawn in it. */
export const TILE_PX = 64;
/** The Chat tab's width in CSS px, past the safe area, and its height (its frame's, 448 x 512). */
export const TAB_PX = 56;
export const TAB_H = 64;

/** A count on a button: the dock's red square, at the button's top right. */
function Badge({ count, style }: { count: number; style?: CSSProperties }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden className="numeric absolute grid h-4 min-w-4 place-items-center rounded-[0.3rem] bg-dock-badge px-0.5 text-xs leading-none font-bold text-foreground ring-2 ring-background" style={style}>
      {count}
    </span>
  );
}

/** A button's name, with its count: "Missions, 3 waiting". */
const named = (label: string, count: number) => (count > 0 ? `${label}, ${count} waiting` : label);

/**
 * One of the right column's buttons: its icon over its name, nothing behind them (the owner's ask: no asset, no box), its 64 px square a
 * transparent hit box; its count at the icon's top right.
 */
function Tile({ art, label, badge = 0, onClick }: { art: UiIconName; label: string; badge?: number; onClick?: () => void }) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      aria-label={named(label, badge)}
      data-slot="edge-tile"
      className="relative grid size-16 shrink-0 cursor-pointer place-items-center outline-none"
    >
      <span aria-hidden className="flex flex-col items-center">
        <UiIcon name={art} px={40} className="size-10" />
        <span className="text-outline -mt-1 text-xs leading-none font-black tracking-tight">{label}</span>
      </span>
      <Badge count={badge} style={{ top: 0, right: 4 }} />
    </m.button>
  );
}

export interface EdgeTilesProps {
  missions?: number;
  friends?: number;
  onMissions?: () => void;
  onVault?: () => void;
  onFriends?: () => void;
  onTiles?: () => void;
  /** The Conquest's button, at the column's top (the season's finale): the requests the player can answer; null or omitted, no button. */
  conquest?: number | null;
  onConquest?: () => void;
  className?: string;
}

/** The right column (the book's): Missions, Vault, Friends and Tiles (the skins owned, `/tiles`; its icon the pile of tiles, `tile-stack`, the user's ask of 2026-11-07), one under the other, each with its count. */
export function EdgeTiles({ missions = 0, friends = 0, onMissions, onVault, onFriends, onTiles, conquest = null, onConquest, className }: EdgeTilesProps) {
  return (
    <nav aria-label="Village" className={className}>
      {conquest !== null && (
        <m.button type="button" onClick={onConquest} whileTap={{ scale: 0.92 }} aria-label={named("Conquest", conquest)} title="The Conquest: your allegiance's world, its orders and its requests" data-slot="edge-tile" data-conquest className="relative grid size-16 shrink-0 cursor-pointer place-items-center outline-none">
          <span aria-hidden className="flex flex-col items-center">
            <img {...modeIconSources("conquest", 40)} alt="" draggable={false} decoding="async" className="size-10" />
            <span className="text-outline -mt-1 text-xs leading-none font-black tracking-tight">Conquest</span>
          </span>
          <Badge count={conquest} style={{ top: 0, right: 4 }} />
        </m.button>
      )}
      <Tile art="missions" label="Missions" badge={missions} onClick={onMissions} />
      <Tile art="vault" label="Vault" onClick={onVault} />
      <Tile art="friends" label="Friends" badge={friends} onClick={onFriends} />
      <Tile art="tile-stack" label="Tiles" onClick={onTiles} />
    </nav>
  );
}

/**
 * The Chat tab on the screen's left edge (the book's): orange, its left side cut straight off the screen, the safe area (a notch held
 * sideways) inside it; the chat's icon over its name, its count at its top right.
 */
export function ChatTab({ badge = 0, onClick }: { badge?: number; onClick?: () => void }) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-label={named("Chat", badge)}
      data-bubble-avoid
      className="relative grid shrink-0 cursor-pointer place-items-center outline-none"
      style={{ width: `calc(${TAB_PX}px + env(safe-area-inset-left))`, height: TAB_H, paddingLeft: "env(safe-area-inset-left)" }}
    >
      <img {...uiFrameSources("chat-tab", TAB_PX)} alt="" draggable={false} className="absolute inset-0 size-full" />
      <span aria-hidden className="relative flex flex-col items-center">
        <UiIcon name="chat" px={32} className="size-8" />
        <span className="text-outline text-xs leading-none font-black">Chat</span>
      </span>
      {/* Inside the tab, as on the tiles: nothing of its text leaves the button (the wrap sweep's rule). */}
      <Badge count={badge} style={{ top: 2, right: 2 }} />
    </m.button>
  );
}

/**
 * The bottom left's lower two (the home draws the dial above them): the Chat tab on the edge, then the mission in progress, the HUD's
 * inset off the edge, just above the dock. One component, one lazy import on the home (its first load).
 */
export function ChatAndMission({ chat, mission, onChat, onMissions }: { chat?: number; mission?: MissionProgress | null; onChat?: () => void; onMissions?: () => void }) {
  return (
    <>
      <ChatTab badge={chat} onClick={onChat} />
      {mission && (
        <div data-bubble-avoid className="max-w-full pl-(--hud-inset-left)">
          <MissionTab mission={mission} onClick={onMissions} />
        </div>
      )}
    </>
  );
}

/** The mission's ring: its share made in gold around the hammer, the rest a faint grey track. */
const ring = (share: number): CSSProperties => ({
  background: `conic-gradient(var(--medal-1) ${Math.round(share * 360)}deg, color-mix(in oklab, var(--muted-foreground) 35%, transparent) 0)`,
});

/**
 * The mission's veil (the owner's ask of 2026-11-04: almost see-through, blurred, its edges faded): a quarter of the background's
 * colour and the HUD's blur, a little wider than the pill, masked by an ellipse that fades from its middle to nothing at its edges
 * (a mask reads only its colour's alpha). Inline: no rule of its own in the one stylesheet.
 */
const FADE = "radial-gradient(closest-side, var(--foreground) 55%, transparent)";
const VEIL: CSSProperties = {
  inset: "-6px -16px",
  backgroundColor: "color-mix(in oklab, var(--background) 25%, transparent)",
  maskImage: FADE,
  WebkitMaskImage: FADE,
};

/**
 * The mission in progress above the dock, at the left (the owner's asks of 2026-11-04): no border, a veil almost see-through with
 * its edges faded (the village shows through it, blurred), the hammer in a thin ring that fills with the mission, its title and its
 * counts ("4/8", close), its task under them (one line, cut with an ellipsis; the ring tells the progress, no bar). 18 rem wide, less
 * on a narrow phone: it stops 5.5 rem short of the screen's right edge, clear of the Camera button (56 px and the insets). A tap opens
 * Missions.
 */
export function MissionTab({ mission, onClick }: { mission: MissionProgress; onClick?: () => void }) {
  const share = mission.total > 0 ? Math.min(1, mission.done / mission.total) : 0;
  return (
    <m.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      aria-label={`${mission.title}, ${formatPoints(mission.done)} of ${formatPoints(mission.total)}`}
      // The task cut with an ellipsis on a narrow phone: its whole text on hover (the wrap sweep's rule for an ellipsis).
      title={mission.task || undefined}
      data-slot="mission-tab"
      className="relative isolate flex max-w-full shrink-0 cursor-pointer items-center gap-2 py-1 pr-3 pl-1 text-left outline-none"
      style={{ width: "min(18rem, 100vw - 5.5rem)" }}
    >
      <span aria-hidden data-slot="mission-veil" className="pointer-events-none absolute -z-10 backdrop-blur-sm" style={VEIL} />
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full" style={ring(share)}>
        <span className="grid size-7 place-items-center rounded-full bg-hud-card">
          <UiIcon name="hammer" px={20} className="size-5" />
        </span>
      </span>
      <span aria-hidden className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-outline truncate text-xs leading-tight font-bold">{mission.title}</span>
          <span data-slot="mission-count" className="text-outline shrink-0 text-xs leading-tight font-bold tracking-tight tabular-nums">
            {formatPoints(mission.done)}/{formatPoints(mission.total)}
          </span>
        </span>
        {mission.task && <span className="text-outline truncate text-xs leading-tight font-medium text-muted-foreground">{mission.task}</span>}
      </span>
    </m.button>
  );
}
