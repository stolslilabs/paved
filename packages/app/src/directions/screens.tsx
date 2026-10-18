import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Brand, DButton, DCard, DCardButton, DChip, DSwitch, DTitle, Icon, Muted, TileArt, useDir } from "./kit";
import { FlowShell, TabShell } from "./shells";

/*
 * The six screens of #537, written once against the kit: Home, Play, Ranks (a tab page), Settings, the board's HUD with the hand
 * panel, the score screen. The data are fixtures of this file (a Storybook proposal reads no chain). Each direction brings its
 * own navigation, cards, buttons and states through the kit.
 */

const RANKS = [
  { rank: 1, name: "cairo_kid", score: 2410 },
  { rank: 2, name: "mossy", score: 2190 },
  { rank: 3, name: "roadwarden", score: 2045 },
  { rank: 4, name: "tilesmith", score: 1880 },
  { rank: 5, name: "nightowl", score: 1760 },
  { rank: 6, name: "hexa", score: 1390 },
  { rank: 7, name: "bal7hazar", score: 1270, viewer: true },
  { rank: 8, name: "lumen", score: 1210 },
  { rank: 9, name: "pebble", score: 1105 },
  { rank: 10, name: "orchard", score: 980 },
];
const pts = (n: number) => n.toLocaleString("en-US");

function Segmented({ options, value }: { options: readonly string[]; value: string }) {
  const [v, setV] = useState(value);
  return (
    <div role="group" className="flex gap-2">
      {options.map((o) => (
        <DButton key={o} variant="secondary" size="sm" on={v === o} onClick={() => setV(o)} className="flex-1">
          {o}
        </DButton>
      ))}
    </div>
  );
}

function Stat({ icon, children, label }: { icon: string; children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Muted className="flex items-center gap-1.5">
        <Icon name={icon} size="xs" /> {label}
      </Muted>
      <span className="font-mono text-lg font-bold">{children}</span>
    </div>
  );
}

// Home

export function HomeScreen() {
  const d = useDir();
  return (
    <TabShell active="home">
      <header className="flex items-center justify-between">
        <h1 className="sr-only">Home</h1>
        <span className={d === "a" ? "desktop:invisible" : ""}>
          <Brand />
        </span>
        <Muted className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-(color:--d-accent)">
            <Icon name="cubes-stacked" size="xs" /> <span className="font-mono">1,240</span>
          </span>
          <span className="whitespace-nowrap">Day 289</span>
        </Muted>
      </header>

      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_24rem] desktop:items-start">
        <div className="flex flex-col gap-4">
          <DCard className="flex items-center gap-3 p-4">
            <TileArt index={6} className="size-12 rounded-[inherit]" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">bal7hazar</span>
              <Muted>Rank #7 today · 1,270 pts</Muted>
            </div>
            <DChip tone="accent">3 games</DChip>
          </DCard>

          <DCard className="flex items-center gap-3 p-4">
            <Icon name="play" className="text-(--d-primary)" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">Challenge #1042 in progress</span>
              <Muted>1,270 pts · 38 tiles left · 18 h left</Muted>
            </div>
            <DButton size="sm">Resume</DButton>
          </DCard>

          <DButton size="lg" className="w-full text-lg">
            Play <Icon name="chevron-right" size="md" />
          </DButton>

          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
            <DCardButton className="flex items-center gap-3 p-4">
              <Icon name="play" className="text-(--d-accent)" />
              <span className="flex flex-col">
                <span className="font-semibold">Training</span>
                <Muted>A free game, saved on this device.</Muted>
              </span>
            </DCardButton>
            <DCardButton className="flex items-center gap-3 p-4">
              <Icon name="book-open" className="text-(--d-accent)" />
              <span className="flex flex-col">
                <span className="font-semibold">Tutorial</span>
                <Muted>Learn the rules, one stage at a time.</Muted>
              </span>
            </DCardButton>
          </div>
        </div>

        <DCard className="flex flex-col gap-3 overflow-hidden p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Icon name="trophy" className="text-(--d-primary)" />
              <DTitle>Challenge</DTitle>
            </span>
            <DChip tone="primary">Daily</DChip>
          </div>
          <div className="grid grid-cols-5 gap-1" aria-hidden>
            {[2, 7, 11, 4, 15].map((i) => (
              <TileArt key={i} index={i} className="w-full" />
            ))}
          </div>
          <Muted>Today's ranked game. Beat the threshold to earn PAVED. Ends in 9 h 12 min.</Muted>
          <ul className="flex flex-col gap-1.5">
            {RANKS.slice(0, 3).map((r) => (
              <li key={r.rank} className="flex items-center gap-3 text-sm">
                <span className="w-5 font-mono text-(color:--d-primary)">{r.rank}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="font-mono">{pts(r.score)}</span>
              </li>
            ))}
          </ul>
        </DCard>
      </div>
    </TabShell>
  );
}

// Play

export function PlayScreen() {
  const [stake, setStake] = useState(25);
  return (
    <FlowShell title="Play">
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <div className="flex flex-col gap-4">
          <DCardButton on className="flex items-start gap-3 p-4">
            <Icon name="trophy" className="mt-1 text-(--d-primary)" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="flex items-center justify-between">
                <span className="font-semibold">Challenge</span>
                <DChip tone="primary">Daily</DChip>
              </span>
              <Muted>Today's ranked game: 24 h to place 72 tiles.</Muted>
            </span>
          </DCardButton>
          <DCardButton className="flex items-start gap-3 p-4">
            <Icon name="play" className="mt-1 text-(--d-accent)" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="flex items-center justify-between">
                <span className="font-semibold">Training</span>
                <DChip>Free</DChip>
              </span>
              <Muted>Saved on this device, no ranking.</Muted>
            </span>
          </DCardButton>
          <DCardButton className="flex items-center gap-3 p-4">
            <Icon name="ticket" className="text-(--d-accent)" />
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">Free game</span>
              <Muted>2 free Challenge games from your quests.</Muted>
            </span>
            <DChip tone="accent">2 left</DChip>
          </DCardButton>
        </div>

        <DCard className="flex flex-col gap-4 p-4">
          <DTitle>Stake</DTitle>
          <div role="group" aria-label="Stake" className="grid grid-cols-4 gap-2">
            {[10, 25, 50, 100].map((s) => (
              <DButton key={s} variant="secondary" size="sm" on={stake === s} onClick={() => setStake(s)} className="font-mono">
                {s}
              </DButton>
            ))}
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            {[
              ["Entry", `${stake} Cobbles`],
              ["Prize pool share", `${Math.round(stake * 0.8)} Cobbles`],
              ["Threshold to earn PAVED", "1,500 pts"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-white/10 pb-2">
                <dt className="text-(color:--d-muted)">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <DButton size="lg" className="w-full">
            Start Challenge
          </DButton>
          <DButton variant="ghost" className="w-full">
            Not now
          </DButton>
        </DCard>
      </div>
    </FlowShell>
  );
}

// Ranks

export function RanksScreen() {
  return (
    <TabShell active="ranks">
      <h1 className="font-display text-3xl tracking-wide">Ranks</h1>
      <Segmented options={["Today", "Yesterday", "All time"]} value="Today" />
      <div className="grid grid-cols-3 items-end gap-2">
        {[RANKS[1]!, RANKS[0]!, RANKS[2]!].map((r) => (
          <DCard key={r.rank} className={clsx("flex flex-col items-center gap-1 overflow-hidden p-3 text-center", r.rank === 1 && "pb-6")}>
            <TileArt index={r.rank * 3} className="size-12 rounded-[inherit]" />
            <Icon name={r.rank === 1 ? "crown" : "medal"} size="sm" className="text-(--d-primary)" />
            <span title={r.name} className="w-full truncate text-sm font-semibold">{r.name}</span>
            <span className="font-mono text-xs text-(color:--d-muted)">{pts(r.score)}</span>
          </DCard>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {RANKS.slice(3).map((r) => (
          <li key={r.rank}>
            <DCardButton on={r.viewer} className="flex w-full items-center gap-3 px-4 py-3">
              <span className="w-6 font-mono text-(color:--d-primary)">{r.rank}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              {r.viewer && <DChip tone="accent">You</DChip>}
              <span className="font-mono text-sm">{pts(r.score)}</span>
            </DCardButton>
          </li>
        ))}
      </ul>
    </TabShell>
  );
}

// Settings

export function SettingsScreen() {
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(false);
  const [theme, setTheme] = useState(0);
  return (
    <TabShell active="settings">
      <h1 className="font-display text-3xl tracking-wide">Settings</h1>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <DCard className="flex flex-col gap-4 p-4">
          <DTitle>Sound</DTitle>
          {(
            [
              ["Effects", "volume-low", sound, setSound],
              ["Music", "music", music, setMusic],
            ] as const
          ).map(([name, icon, on, set]) => (
            <div key={name} className="flex items-center gap-3">
              <Icon name={icon} className="text-(--d-accent)" fixedWidth />
              <span className="flex-1 font-medium">{name}</span>
              <DSwitch checked={on} label={name} onChange={set} />
            </div>
          ))}
        </DCard>

        <DCard className="flex flex-col gap-4 p-4">
          <DTitle>Tile theme</DTitle>
          <div role="group" aria-label="Tile theme" className="grid grid-cols-3 gap-3">
            {["Meadow", "Forest", "Dusk"].map((name, i) => (
              <DCardButton key={name} on={theme === i} onClick={() => setTheme(i)} className="flex flex-col items-center gap-2 p-2.5">
                <TileArt index={i * 6 + 1} className="w-full" />
                <span className="text-xs font-semibold">{name}</span>
              </DCardButton>
            ))}
          </div>
        </DCard>

        <DCard className="flex flex-col gap-4 p-4 desktop:col-span-2">
          <DTitle>Account</DTitle>
          <div className="flex items-center gap-3">
            <Icon name="wallet" className="text-(--d-accent)" fixedWidth />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">bal7hazar</span>
              <Muted className="font-mono">0x05f1…6e7f</Muted>
            </span>
            <DButton variant="outline" size="sm">
              <Icon name="link" size="xs" /> Copy
            </DButton>
          </div>
          <div className="flex flex-wrap gap-3">
            <DButton variant="secondary">
              <Icon name="share-nodes" size="sm" /> Share
            </DButton>
            <DButton variant="ghost">Privacy</DButton>
            <DButton variant="danger">
              <Icon name="arrow-right-from-bracket" size="sm" /> Disconnect
            </DButton>
          </div>
        </DCard>
      </div>
    </TabShell>
  );
}

// HUD

const BOARD_COLS = 7;

/**
 * C's glass over the full-strength board: a page-colour veil at 92% sits behind the card, so the glass never lies on bare tile art.
 * The same bound as the mosaic's (see `checks()`): white at most 8% over the page colour. A and B have no glass and take no veil.
 */
function Veiled({ className, children }: { className?: string; children: ReactNode }) {
  const d = useDir();
  return d === "c" ? <div className={clsx("rounded-3xl bg-(--d-bg)/92", className)}>{children}</div> : <div className={className}>{children}</div>;
}

/** The board with its HUD and the hand panel: the tiles are the app's own art laid on a grid; the free slot is the dashed one. */
export function HudScreen() {
  const d = useDir();
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-(--d-bg)">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid w-[150vw] max-w-[1100px] -translate-y-8 grid-cols-7 gap-0 desktop:w-[min(78vh,900px)] desktop:translate-y-0" aria-label="Board">
          {Array.from({ length: BOARD_COLS * BOARD_COLS }, (_, i) => {
            const slot = i === 24 || i === 17;
            const empty = [0, 1, 5, 6, 7, 13, 35, 41, 42, 43, 47, 48].includes(i);
            return slot ? (
              <div key={i} className="aspect-square border-2 border-dashed border-(color:--d-primary) bg-white/15" />
            ) : empty ? (
              <div key={i} className="aspect-square" />
            ) : (
              <TileArt key={i} index={i * 3 + 1} className="w-full" />
            );
          })}
        </div>
      </div>

      <header className="relative flex w-full max-w-xl items-center gap-2 p-3 desktop:p-6">
        <DButton variant="secondary" size="square" aria-label="Menu">
          <Icon name="gear" size="md" />
        </DButton>
        <Veiled className="flex-1">
        <DCard className="flex items-center justify-around gap-2 px-3 py-2">
          <Stat icon="crown" label="Score">
            1,270
          </Stat>
          <Stat icon="cubes-stacked" label="Left">
            38
          </Stat>
          <Stat icon="clock" label="Time">
            18:04
          </Stat>
        </DCard>
        </Veiled>
      </header>

      <div className="relative mt-auto p-3 desktop:ml-auto desktop:w-96 desktop:p-6">
        <Veiled>
        <DCard className={clsx("flex flex-col gap-3 p-4", d === "c" && "bg-white/10")}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <TileArt index={8} className="size-20 rounded-[inherit]" />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="font-display text-xl">Place tile</span>
              <Muted>Choose a slot, rotate, confirm.</Muted>
              <DChip tone="accent" className="self-start">
                +12 pts
              </DChip>
            </div>
          </div>
          <div className="flex gap-2">
            <DButton variant="secondary" size="square" aria-label="Rotate">
              <Icon name="rotate-right" size="md" />
            </DButton>
            <DButton variant="ghost" className="px-3">
              Discard
            </DButton>
            <DButton className="flex-1">
              <Icon name="check" size="sm" /> Confirm
            </DButton>
          </div>
          <DButton variant="danger" size="sm" className="self-center">
            <Icon name="flag" size="xs" /> Surrender
          </DButton>
        </DCard>
        </Veiled>
      </div>
    </div>
  );
}

// Score

export function ScoreScreen() {
  return (
    <FlowShell title="Game over">
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_24rem] desktop:items-start">
        <DCard className="flex flex-col items-center gap-2 p-6 text-center">
          <Muted className="tracking-[0.3em] uppercase">Final score</Muted>
          <span className="font-display text-7xl text-(color:--d-primary)">1,820</span>
          <DChip tone="accent">Rank #4 of 142</DChip>
          <div className="mt-3 grid w-full grid-cols-3 gap-2 border-t border-white/10 pt-4">
            <Stat icon="cubes-stacked" label="Tiles">
              72
            </Stat>
            <Stat icon="link" label="Road">
              14
            </Stat>
            <Stat icon="flag" label="Regions">
              5
            </Stat>
          </div>
        </DCard>

        <div className="flex flex-col gap-4">
          <DCard className="flex items-center gap-3 p-4">
            <Icon name="gift" size="lg" className="text-(--d-primary)" fixedWidth />
            <div className="flex flex-1 flex-col">
              <span className="font-semibold">Threshold reached</span>
              <Muted>1,500 pts: PAVED earned, claim it in the Vault.</Muted>
            </div>
            <DChip tone="primary">+25</DChip>
          </DCard>
          <DButton size="lg" className="w-full">
            Play again
          </DButton>
          <div className="grid grid-cols-2 gap-3">
            <DButton variant="outline">
              <Icon name="share-nodes" size="sm" /> Share
            </DButton>
            <DButton variant="secondary">
              <Icon name="house" size="sm" /> Home
            </DButton>
          </div>
        </div>
      </div>
    </FlowShell>
  );
}

export const SCREENS = { home: HomeScreen, play: PlayScreen, ranks: RanksScreen, settings: SettingsScreen, hud: HudScreen, score: ScoreScreen } as const;
export type ScreenName = keyof typeof SCREENS;
