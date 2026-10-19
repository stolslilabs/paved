import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { formatInteger } from "@paved/game-core";
import { DButton, DCard, DCardButton, DChip, DSwitch, DTitle, Icon, Muted, NOTCH, VoxelWordmark, useLook } from "./kit";
import { RENDERS, TILES, tileRender } from "./renders";
import { FlowShell2, PageTitle, Picture, Realm, TabShell2 } from "./shells-2";

/*
 * The screens of D, E and F (#537, PR 1b), written once against the kit: Home, Play, Ranks, Settings, the HUD with the hand card,
 * the score screen, and the tile's detail sheet the mockups add. Each shows the real board or a real tile (`renders.ts`). The
 * data are fixtures of this file. Where the three part ways (the hero, the mode cards, the podium, the score's categories) the
 * screen asks the direction; everything else (buttons, cards, chips, states) comes from the kit.
 */

const pts = (n: number) => formatInteger(n);

const RANKS = [
  { rank: 1, name: "cairo_kid", score: 2410, tile: TILES.wonder.key },
  { rank: 2, name: "mossy", score: 2190, tile: TILES.forest.key },
  { rank: 3, name: "roadwarden", score: 2045, tile: TILES.road.key },
  { rank: 4, name: "tilesmith", score: 1880, tile: TILES.city.key },
  { rank: 5, name: "nightowl", score: 1760, tile: TILES.stop.key },
  { rank: 6, name: "hexa", score: 1390, tile: TILES.straight.key },
  { rank: 7, name: "bal7hazar", score: 1270, tile: TILES.cityRoad.key, viewer: true },
  { rank: 8, name: "lumen", score: 1210, tile: TILES.road.key },
  { rank: 9, name: "pebble", score: 1105, tile: TILES.forest.key },
  { rank: 10, name: "orchard", score: 980, tile: TILES.city.key },
];

/** The score's categories, as the over screen names them (`elements/category.tsx`): icon, closings and points. */
const CATEGORIES = [
  { icon: "city", label: "Cities", closed: 3, points: 640 },
  { icon: "road", label: "Roads", closed: 7, points: 420 },
  { icon: "tree", label: "Forests", closed: 4, points: 380 },
  { icon: "landmark-dome", label: "Wonders", closed: 1, points: 380 },
];

const MODES = [
  { id: "challenge", icon: "trophy", name: "Challenge", line: "Today's ranked game: 72 tiles, 24 h.", chip: "Daily", art: RENDERS.modeChallenge },
  { id: "training", icon: "play", name: "Training", line: "A free game, saved on this device.", chip: "Free", art: RENDERS.modeTraining },
  { id: "tutorial", icon: "graduation-cap", name: "Tutorial", line: "Learn the rules, one stage at a time.", chip: "5 stages", art: RENDERS.modeTutorial },
] as const;

/** A render in its frame: a well on D, standing free on E (no frame, its own shadow), a notched slot on F. */
function Art({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const is = useLook();
  return (
    <span className={clsx("relative block shrink-0 overflow-hidden", is.d && "rounded-lg bg-(--d-raised)", is.e && "overflow-visible", is.f && clsx(NOTCH, "bg-(--d-bg)"), className)}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={clsx("size-full object-contain", is.e && "drop-shadow-[0_10px_8px_rgb(0_0_0/0.5)]")}
      />
    </span>
  );
}

/** An icon in a small square key, as the mockups set the icon of a row. */
function IconKey({ name, tone = "primary" }: { name: string; tone?: "primary" | "accent" | "plain" }) {
  const is = useLook();
  return (
    <span
      className={clsx(
        "grid size-10 shrink-0 place-items-center bg-(--d-raised)",
        is.f ? NOTCH : is.e ? "rounded-xl shadow-[0_3px_0_var(--d-shadow)]" : "rounded-lg",
        tone === "primary" ? "text-(--d-primary)" : tone === "accent" ? "text-(--d-accent)" : "text-(--d-text)",
      )}
    >
      <Icon name={name} size="md" />
    </span>
  );
}

function Segmented({ options, value, label }: { options: readonly string[]; value: string; label: string }) {
  const [v, setV] = useState(value);
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <DButton key={o} variant="secondary" size="sm" on={v === o} onClick={() => setV(o)} className="min-w-0 flex-1">
          {o}
        </DButton>
      ))}
    </div>
  );
}

// Home

/** D's hero: the board full-bleed under the voxel wordmark, fading into the page, as the mockups' first screen. */
function HeroD() {
  return (
    <div className="relative h-[23rem] w-full overflow-hidden tablet:h-[26rem] desktop:h-[24rem]">
      <Picture tall={RENDERS.heroTall} wide={RENDERS.heroWide} className="absolute inset-0" imgClassName="size-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-(--d-bg)/70 via-(--d-bg)/10 to-(--d-bg)" />
      <div className="relative mx-auto flex h-full max-w-md flex-col items-center px-4 pt-6 tablet:max-w-2xl desktop:max-w-5xl desktop:items-start desktop:justify-center desktop:px-8 desktop:pt-0">
        <VoxelWordmark className="w-72 tablet:w-96" />
        <span className="mt-1 text-xs font-semibold tracking-[0.3em] text-(color:--d-text) uppercase [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">Build · Connect · Score</span>
      </div>
    </div>
  );
}

/** E's hero: the board standing under the lamp, keyed from its backdrop, the wordmark above it. No frame. */
function HeroE() {
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 pt-4 tablet:max-w-2xl desktop:max-w-5xl desktop:flex-row desktop:items-center desktop:gap-8 desktop:px-8 desktop:pt-2">
      <div className="flex flex-col items-center gap-1 desktop:w-80 desktop:items-start">
        <VoxelWordmark className="w-60 tablet:w-72" />
        <span className="text-xs font-semibold tracking-[0.3em] text-(color:--d-muted) uppercase">Build · Connect · Score</span>
      </div>
      <Picture
        tall={RENDERS.heroTall}
        wide={RENDERS.heroWide}
        className="mt-1 block h-72 w-full desktop:mt-0 desktop:h-80 desktop:flex-1"
        imgClassName="size-full object-cover object-center drop-shadow-[0_24px_18px_rgb(0_0_0/0.55)] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_80%)]"
      />
    </div>
  );
}

/** F's hero: nothing but the wordmark, large, over the realm the shell lays behind the page. */
function HeroF() {
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 pt-10 pb-2 tablet:max-w-2xl desktop:max-w-5xl desktop:pt-16">
      <VoxelWordmark className="w-80 drop-shadow-[0_10px_14px_rgb(0_0_0/0.7)] tablet:w-[30rem] desktop:w-[38rem]" />
      <span className={clsx(NOTCH, "mt-2 bg-(--d-surface) px-3 py-1 text-xs font-bold tracking-[0.3em] uppercase")}>Build · Connect · Score</span>
    </div>
  );
}

function ResumeCard() {
  const is = useLook();
  return (
    <DCard className="flex items-center gap-3 p-3">
      <Art src={is.e ? RENDERS.modeTutorial : RENDERS.modeChallenge} className={is.e ? "-my-4 h-16 w-24" : "h-14 w-20 [&_img]:object-cover"} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">Challenge #1042</span>
        <Muted>1,270 pts · 38 tiles left · 18 h</Muted>
      </div>
      <DButton size="sm">Resume</DButton>
    </DCard>
  );
}

/** The modes on Home: D lists them as rows (icon, two lines, chevron); E stands them as plinths; F sets them as square slots. */
function HomeModes() {
  const is = useLook();
  if (is.f)
    return (
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <DCardButton key={m.id} className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1.5 p-2 text-center">
            <Icon name={m.icon} size="lg" className="text-(--d-primary)" />
            <span className="w-full truncate text-xs font-bold tracking-wide uppercase" title={m.name}>
              {m.name}
            </span>
          </DCardButton>
        ))}
      </div>
    );
  if (is.e)
    return (
      <div className="grid grid-cols-1 gap-x-3 gap-y-5 pt-4 mobile:grid-cols-2">
        {MODES.slice(1).map((m) => (
          <DCardButton key={m.id} className="flex flex-col items-center gap-1 px-3 pb-4 text-center">
            <Art src={m.art} className="-mt-8 h-24 w-36" />
            <span className="font-display text-xl">{m.name}</span>
            <Muted>{m.line}</Muted>
          </DCardButton>
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-2.5">
      {MODES.map((m) => (
        <DCardButton key={m.id} className="flex items-center gap-3 p-3">
          <IconKey name={m.icon} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{m.name}</span>
            <Muted>{m.line}</Muted>
          </span>
          <Icon name="chevron-right" size="sm" className="text-(--d-muted)" />
        </DCardButton>
      ))}
    </div>
  );
}

function DailyCard() {
  const is = useLook();
  return (
    <DCard className={clsx("flex flex-col gap-3 p-4", is.e && "mt-10 pt-0 desktop:mt-0")}>
      {is.e ? (
        <Art src={RENDERS.theme1} className="mx-auto -mt-12 h-40 w-full max-w-72" />
      ) : (
        <Art src={RENDERS.modeChallenge} className="h-36 w-full [&_img]:object-cover" />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Icon name="trophy" className="text-(--d-primary)" />
          <DTitle>Daily Challenge</DTitle>
        </span>
        <DChip tone="primary">9 h left</DChip>
      </div>
      <Muted>Today's ranked game. Beat 1,500 pts to earn PAVED.</Muted>
      <ul className="flex flex-col gap-1.5">
        {RANKS.slice(0, 3).map((r) => (
          <li key={r.rank} className="flex items-center gap-3 text-sm">
            <span className="w-5 font-mono text-(color:--d-primary)">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate" title={r.name}>
              {r.name}
            </span>
            <span className="font-mono">{pts(r.score)}</span>
          </li>
        ))}
      </ul>
    </DCard>
  );
}

export function HomeScreen2() {
  const is = useLook();
  const hero = is.d ? <HeroD /> : is.e ? <HeroE /> : <HeroF />;
  return (
    <TabShell2 active="home" hero={hero}>
      <h1 className="sr-only">Home</h1>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_24rem] desktop:items-start">
        <div className="flex flex-col gap-4">
          <DButton size="lg" className="w-full text-lg">
            Play <Icon name="chevron-right" size="md" />
          </DButton>
          <ResumeCard />
          <HomeModes />
        </div>
        <DailyCard />
      </div>
    </TabShell2>
  );
}

// Play

/** A mode to pick. D: a row with the render on its left (the mockups' Play list). E: a plinth the render stands on. F: a slab with the render as its banner. */
function ModeCard({ mode, on, onPick }: { mode: (typeof MODES)[number]; on: boolean; onPick: () => void }) {
  const is = useLook();
  if (is.d)
    return (
      <DCardButton on={on} onClick={onPick} className="flex items-center gap-3 p-3">
        <Art src={mode.art} className="h-20 w-28 [&_img]:object-cover" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{mode.name}</span>
            <DChip tone={mode.id === "challenge" ? "primary" : "plain"}>{mode.chip}</DChip>
          </span>
          <Muted>{mode.line}</Muted>
        </span>
        <Icon name="chevron-right" size="sm" className="text-(--d-muted)" />
      </DCardButton>
    );
  if (is.e)
    return (
      <DCardButton on={on} onClick={onPick} className="mt-6 flex flex-col items-center gap-1.5 px-4 pb-4 text-center">
        {/* A cropped board has hard edges; E's renders stand free, so the Challenge shows the keyed tiles instead. */}
        <Art src={mode.id === "challenge" ? RENDERS.theme1 : mode.art} className="-mt-9 h-32 w-52" />
        <span className="flex items-center gap-2">
          <span className="font-display text-2xl">{mode.name}</span>
          <DChip tone={mode.id === "challenge" ? "primary" : "plain"}>{mode.chip}</DChip>
        </span>
        <Muted>{mode.line}</Muted>
      </DCardButton>
    );
  return (
    <DCardButton on={on} onClick={onPick} className={clsx("flex flex-col overflow-hidden", on && "shadow-[inset_0_0_0_2px_var(--d-primary)]")}>
      <img src={mode.art} alt="" draggable={false} className="h-28 w-full object-cover" />
      <span className="flex items-center gap-3 p-3">
        <Icon name={mode.icon} size="lg" className="text-(--d-primary)" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-2xl leading-tight">{mode.name}</span>
          <Muted>{mode.line}</Muted>
        </span>
        <DChip tone={mode.id === "challenge" ? "primary" : "plain"}>{mode.chip}</DChip>
      </span>
    </DCardButton>
  );
}

export function PlayScreen2() {
  const [mode, setMode] = useState<string>("challenge");
  const [stake, setStake] = useState(25);
  return (
    <FlowShell2 title="Play">
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_24rem] desktop:items-start">
        <div className="flex flex-col gap-3">
          {MODES.map((m) => (
            <ModeCard key={m.id} mode={m} on={mode === m.id} onPick={() => setMode(m.id)} />
          ))}
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
    </FlowShell2>
  );
}

// Ranks

/** The podium. D: three cards in a row (the mockups' list style). E: three plinths of different heights, each player's tile standing on top. F: three square slots, the figures large. */
function Podium() {
  const is = useLook();
  const order = [RANKS[1]!, RANKS[0]!, RANKS[2]!];
  return (
    <div className={clsx("grid grid-cols-3 items-end gap-2", is.e && "pt-8")}>
      {order.map((r) => {
        const first = r.rank === 1;
        return (
          <DCard
            key={r.rank}
            className={clsx(
              "flex min-w-0 flex-col items-center gap-1 px-2 pb-3 text-center",
              is.e ? (first ? "h-44" : r.rank === 2 ? "h-36" : "h-32") : "pt-3",
              is.f && "aspect-square justify-center",
            )}
          >
            {is.e ? (
              <Art src={tileRender(r.tile)} className={clsx("-mt-10 shrink-0", first ? "size-24" : "size-20")} />
            ) : is.d ? (
              <Art src={tileRender(r.tile)} className="size-14" />
            ) : null}
            <Icon name={first ? "crown" : "medal"} size={is.f ? "lg" : "sm"} className="text-(--d-primary)" />
            <span title={r.name} className="w-full truncate text-sm font-semibold">
              {r.name}
            </span>
            <span title={pts(r.score)} className={clsx("w-full truncate font-mono", is.f ? "text-base font-bold text-(color:--d-accent)" : "text-xs text-(color:--d-muted)")}>
              {pts(r.score)}
            </span>
          </DCard>
        );
      })}
    </div>
  );
}

export function RanksScreen2() {
  const is = useLook();
  return (
    <TabShell2 active="ranks">
      <PageTitle aside={<DChip tone="accent">142 players</DChip>}>Ranks</PageTitle>
      <Segmented label="Period" options={["Today", "Yesterday", "All time"]} value="Today" />
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[22rem_minmax(0,1fr)] desktop:items-start">
        <Podium />
        {is.d ? (
          <DCard className="flex flex-col divide-y divide-(--d-line) overflow-hidden">
            {RANKS.slice(3).map((r) => (
              <RankRow key={r.rank} r={r} flat />
            ))}
          </DCard>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {RANKS.slice(3).map((r) => (
              <li key={r.rank}>
                <RankRow r={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </TabShell2>
  );
}

function RankRow({ r, flat }: { r: (typeof RANKS)[number]; flat?: boolean }) {
  const content = (
    <>
      <span className="w-6 font-mono text-(color:--d-primary)">{r.rank}</span>
      <img src={tileRender(r.tile)} alt="" draggable={false} className="size-9 shrink-0 object-contain" />
      <span className="min-w-0 flex-1 truncate font-medium" title={r.name}>
        {r.name}
      </span>
      {r.viewer && <DChip tone="accent">You</DChip>}
      <span className="font-mono text-sm">{pts(r.score)}</span>
    </>
  );
  // In D's grouped list a row is a plain button on the card (the card is the frame); elsewhere each row is its own card.
  return flat ? (
    <button
      type="button"
      data-on={r.viewer ? "true" : undefined}
      aria-pressed={r.viewer}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left [--ov:transparent] bg-[linear-gradient(var(--ov),var(--ov))] hover:[--ov:var(--d-hover)] active:[--ov:var(--d-pressed)] data-[on=true]:[--ov:var(--d-active)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--d-primary)"
    >
      {content}
    </button>
  ) : (
    <DCardButton on={r.viewer} className="flex w-full items-center gap-3 px-4 py-2.5">
      {content}
    </DCardButton>
  );
}

// Settings

function SettingRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} className="text-(--d-accent)" fixedWidth />
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      {children}
    </div>
  );
}

export function SettingsScreen2() {
  const [toggles, setToggles] = useState({ effects: true, music: false, preview: true, highlight: true });
  const set = (k: keyof typeof toggles) => (v: boolean) => setToggles((t) => ({ ...t, [k]: v }));
  const [theme, setTheme] = useState(1);
  return (
    <TabShell2 active="settings">
      <PageTitle>Settings</PageTitle>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <div className="flex flex-col gap-4">
          <DCard className="flex flex-col gap-4 p-4">
            <DTitle>Visuals</DTitle>
            <Muted>Graphics quality</Muted>
            <Segmented label="Graphics quality" options={["Low", "Medium", "High"]} value="High" />
          </DCard>
          <DCard className="flex flex-col gap-4 p-4">
            <DTitle>Sound and play</DTitle>
            <SettingRow icon="volume-low" label="Effects">
              <DSwitch checked={toggles.effects} label="Effects" onChange={set("effects")} />
            </SettingRow>
            <SettingRow icon="music" label="Music">
              <DSwitch checked={toggles.music} label="Music" onChange={set("music")} />
            </SettingRow>
            <SettingRow icon="eye" label="Tile preview">
              <DSwitch checked={toggles.preview} label="Tile preview" onChange={set("preview")} />
            </SettingRow>
            <SettingRow icon="highlighter" label="Placement highlight">
              <DSwitch checked={toggles.highlight} label="Placement highlight" onChange={set("highlight")} />
            </SettingRow>
          </DCard>
        </div>
        <div className="flex flex-col gap-4">
          <DCard className="flex flex-col gap-4 p-4">
            <DTitle>Tile theme</DTitle>
            <div role="group" aria-label="Tile theme" className="grid grid-cols-2 gap-3">
              {[
                ["Base", RENDERS.theme0],
                ["Forest", RENDERS.theme1],
              ].map(([name, art], i) => (
                <DCardButton key={name} on={theme === i} onClick={() => setTheme(i)} className="flex flex-col items-center gap-1 p-2.5">
                  <img src={art} alt="" draggable={false} className="aspect-[4/3] w-full object-contain" />
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {name}
                    {theme === i && <Icon name="check" size="xs" className="text-(--d-primary)" />}
                  </span>
                </DCardButton>
              ))}
            </div>
          </DCard>
          <DCard className="flex flex-col gap-4 p-4">
            <DTitle>Account</DTitle>
            <div className="flex items-center gap-3">
              <Icon name="wallet" className="text-(--d-accent)" fixedWidth />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">bal7hazar</span>
                <Muted className="font-mono">0x05f1…6e7f</Muted>
              </span>
              <DButton variant="outline" size="sm">
                <Icon name="copy" size="xs" /> Copy
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
      </div>
    </TabShell2>
  );
}

// HUD

function HudStat({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  const is = useLook();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Muted className="flex items-center gap-1.5">
        <Icon name={icon} size="xs" /> {label}
      </Muted>
      <span className={clsx("font-mono font-bold", is.f ? "text-2xl" : "text-lg")}>{children}</span>
    </div>
  );
}

/** The hand: the tile's render (Rotate under it, as the mockups put it), the points it would bring, Place and Discard. */
function HandCard() {
  const is = useLook();
  return (
    <DCard className={clsx("flex items-center gap-4 p-3", is.e && "pt-3")}>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <Art src={tileRender(TILES.cityRoad.key)} alt={TILES.cityRoad.name} className={is.e ? "-mt-12 size-28" : "size-24"} />
        <DButton variant="secondary" size="sm" aria-label="Rotate" className="px-3">
          <Icon name="rotate-right" size="sm" /> Rotate
        </DButton>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold" title={TILES.cityRoad.name}>
            {TILES.cityRoad.name}
          </span>
          <DChip tone="accent">+120</DChip>
        </span>
        <DButton className="w-full">
          <Icon name="check" size="sm" /> Place tile
        </DButton>
        <DButton variant="outline" className="w-full">
          <Icon name="trash" size="sm" /> Discard
        </DButton>
      </div>
    </DCard>
  );
}

/** The board in play (the real 38-tile game, its free slots and the tile placed, pending), the HUD over it and the hand card. */
export function HudScreen2() {
  const is = useLook();
  return (
    <div className="relative flex h-dvh min-h-[34rem] flex-col overflow-hidden bg-(--d-bg)">
      {is.f ? (
        <Realm tall={RENDERS.hudTall} wide={RENDERS.hudWide} veil="light" />
      ) : (
        <Picture tall={RENDERS.hudTall} wide={RENDERS.hudWide} className="pointer-events-none absolute inset-0" imgClassName="size-full object-cover" />
      )}
      {/* The bars stand on a shade of the page, so the HUD never lies on the bare board. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-(--d-bg) to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-linear-to-t from-(--d-bg) to-transparent" />

      <header className="relative flex w-full items-center gap-2 p-3 desktop:p-6">
        <DButton variant="secondary" size="square" aria-label="Back">
          <Icon name="chevron-left" size="md" />
        </DButton>
        {is.d ? (
          <>
            <span className="min-w-0 flex-1 truncate text-center font-semibold" title="Daily Challenge">
              Daily Challenge
            </span>
            <DButton variant="secondary" size="square" aria-label="Menu">
              <Icon name="gear" size="md" />
            </DButton>
          </>
        ) : (
          <DCard className="flex min-w-0 flex-1 items-center justify-around gap-2 px-3 py-2 desktop:max-w-md">
            <HudStat icon="crown" label="Score">
              1,380
            </HudStat>
            <HudStat icon="cubes-stacked" label="Left">
              38
            </HudStat>
            <HudStat icon="clock" label="Time">
              18:04
            </HudStat>
          </DCard>
        )}
      </header>
      {is.d && (
        <div className="relative grid grid-cols-2 gap-2 px-3 desktop:w-96 desktop:px-6">
          <DCard className="px-3 py-2">
            <HudStat icon="cubes-stacked" label="Tiles left">
              38
            </HudStat>
          </DCard>
          <DCard className="px-3 py-2 text-right">
            <HudStat icon="star" label="Score">
              1,380
            </HudStat>
          </DCard>
        </div>
      )}

      <div className="relative mt-auto flex flex-col gap-2 p-3 desktop:ml-auto desktop:w-[26rem] desktop:p-6">
        <HandCard />
        <Muted className="flex justify-between px-1">
          <span>Your turn</span>
          <span className="font-mono">00:42</span>
        </Muted>
      </div>
    </div>
  );
}

// Score

/** The categories. D: rows, icon, label, closings and figure (the mockups' list). E: four plinths, the figure large. F: four square slots, an inventory. */
function Categories() {
  const is = useLook();
  if (is.d)
    return (
      <DCard className="flex flex-col divide-y divide-(--d-line)">
        {CATEGORIES.map((c) => (
          <div key={c.label} className="flex items-center gap-3 px-4 py-2.5">
            <Icon name={c.icon} className="text-(--d-primary)" fixedWidth />
            <span className="min-w-0 flex-1">{c.label}</span>
            <Muted>{c.closed} closed</Muted>
            <span className="w-14 text-right font-mono font-bold">{pts(c.points)}</span>
          </div>
        ))}
      </DCard>
    );
  return (
    <div className={clsx("grid gap-2.5", is.e ? "grid-cols-2" : "grid-cols-2 tablet:grid-cols-4")}>
      {CATEGORIES.map((c) => (
        <DCard key={c.label} className={clsx("flex min-w-0 flex-col gap-1 p-3", is.f && "aspect-square items-center justify-center text-center")}>
          <span className="flex items-center gap-2">
            {is.e ? <IconKey name={c.icon} /> : <Icon name={c.icon} size="lg" className="text-(--d-primary)" />}
            {is.e && <span className="font-display text-3xl text-(color:--d-primary)">{pts(c.points)}</span>}
          </span>
          {is.f && <span className="font-display text-2xl text-(color:--d-accent)">{pts(c.points)}</span>}
          <span className="w-full truncate text-sm font-semibold" title={c.label}>
            {c.label}
          </span>
          <Muted>{c.closed} closed</Muted>
        </DCard>
      ))}
    </div>
  );
}

export function ScoreScreen2() {
  const is = useLook();
  return (
    <FlowShell2 title="Final score">
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_24rem] desktop:items-start">
        <div className="flex flex-col gap-4">
          {is.d && <Art src={RENDERS.scoreWide} className="h-40 w-full desktop:h-64 [&_img]:object-cover" />}
          {is.e && <Art src={RENDERS.scoreWide} className="-mb-2 h-44 w-full desktop:h-72" />}
          <DCard className={clsx("flex flex-col gap-2 p-4", !is.d && "items-center text-center")}>
            <Muted className="tracking-[0.2em] uppercase">Your score</Muted>
            <span className="flex items-center gap-3">
              <Icon name="crown" size={is.d ? "lg" : "xl"} className="text-(--d-primary)" />
              <span className={clsx("text-(color:--d-primary)", is.d ? "font-mono text-4xl font-bold" : "font-display", is.e && "text-6xl", is.f && "text-7xl")}>1,820</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <DChip tone="accent">New high score</DChip>
              <DChip>Rank #4 of 142</DChip>
            </span>
          </DCard>
          <Categories />
        </div>
        <div className="flex flex-col gap-4">
          <DCard className="flex flex-col gap-2 p-4">
            <span className="flex justify-between text-sm">
              <span>Tiles placed</span>
              <span className="font-mono font-bold">72</span>
            </span>
            <span className="flex justify-between text-sm">
              <span>Threshold, 1,500 pts</span>
              <span className="font-mono font-bold text-(color:--d-accent)">+21%</span>
            </span>
            <span className={clsx("mt-1 h-2.5 overflow-hidden bg-(--d-raised)", is.f ? "" : "rounded-full")} role="progressbar" aria-label="Progress to the next threshold" aria-valuenow={82} aria-valuemin={0} aria-valuemax={100}>
              <span className={clsx("block h-full w-[82%] bg-(--d-primary)", is.f ? "" : "rounded-full")} />
            </span>
          </DCard>
          <DCard className="flex items-center gap-3 p-4">
            <Icon name="gift" size="lg" className="text-(--d-primary)" fixedWidth />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">PAVED earned</span>
              <Muted>Claim it in the Vault.</Muted>
            </div>
            <DChip tone="primary">+25</DChip>
          </DCard>
          <DButton size="lg" className="w-full">
            Continue
          </DButton>
          <div className="grid grid-cols-2 gap-3">
            <DButton variant="outline">
              <Icon name="share-nodes" size="sm" /> Share
            </DButton>
            <DButton variant="secondary">
              <Icon name="rotate-right" size="sm" /> Play again
            </DButton>
          </div>
        </div>
      </div>
    </FlowShell2>
  );
}

// Tile

/** A tile's detail sheet (the mockups' "Tile details"): its render, what it holds, its sides, and the tiles that fit beside it. */
export function TileScreen2() {
  const is = useLook();
  const tile = TILES.cityRoad;
  // The plan key's spots in game-core's `SpotType` order (centre, NW, N, NE, E, SE, S, SW, W): `cccccfrfc` at orientation 1 is a
  // city on the north, east and west sides, the road out to the south, forest in the two southern corners.
  const sides = [
    { side: "North", icon: "city", label: "City" },
    { side: "East", icon: "city", label: "City" },
    { side: "South", icon: "road", label: "Road" },
    { side: "West", icon: "city", label: "City" },
  ];
  return (
    <FlowShell2 title="Tile" realm={{ tall: RENDERS.heroTall, wide: RENDERS.heroWide }}>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <DCard className={clsx("flex flex-col items-center gap-2 p-4", is.e && "mt-10")}>
          <Art src={tileRender(tile.key)} alt={tile.name} className={clsx("w-full max-w-80", is.e ? "-mt-16 aspect-square" : "aspect-square")} />
          <span className="font-display text-3xl">{tile.name}</span>
          <span className="flex flex-wrap justify-center gap-2">
            <DChip tone="primary">City</DChip>
            <DChip>Road</DChip>
            <DChip>Forest</DChip>
          </span>
          <Muted className="text-center text-sm">{tile.hint} Closing the city scores its tiles; the road leaves from its gate.</Muted>
        </DCard>
        <div className="flex flex-col gap-4">
          <DCard className="flex flex-col gap-3 p-4">
            <DTitle>Sides</DTitle>
            <dl className="grid grid-cols-2 gap-2">
              {sides.map((s) => (
                <div key={s.side} className={clsx("flex items-center gap-2 bg-(--d-raised) px-3 py-2", is.f ? NOTCH : "rounded-lg")}>
                  <Icon name={s.icon} size="sm" className="text-(--d-primary)" fixedWidth />
                  <dt className="text-xs text-(color:--d-muted)">{s.side}</dt>
                  <dd className="ml-auto text-sm font-semibold">{s.label}</dd>
                </div>
              ))}
            </dl>
          </DCard>
          <DCard className="flex flex-col gap-3 p-4">
            <DTitle>Fits beside it</DTitle>
            <div className="grid grid-cols-4 gap-2">
              {[TILES.city.key, TILES.straight.key, TILES.road.key, TILES.forest.key].map((k) => (
                <Art key={k} src={tileRender(k)} className="aspect-square w-full" />
              ))}
            </div>
            <Muted>In this game: 6 of 72 tiles are this one; 2 are left.</Muted>
          </DCard>
          <DButton size="lg" className="w-full">
            Use this tile
          </DButton>
        </div>
      </div>
    </FlowShell2>
  );
}

export const SCREENS_2 = { home: HomeScreen2, play: PlayScreen2, ranks: RanksScreen2, settings: SettingsScreen2, hud: HudScreen2, score: ScoreScreen2, tile: TileScreen2 } as const;
export type ScreenName2 = keyof typeof SCREENS_2;
