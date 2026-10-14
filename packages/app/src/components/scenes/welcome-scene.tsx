import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Notice } from "../elements/notice";
import { TileChip } from "../elements/tile-chip";
import { Wordmark } from "../elements/wordmark";

export interface WelcomeSceneProps {
  /** Plans for the decorative mosaic behind the title (a recorded board's first tiles). */
  mosaic: { plan: number; orientation: number }[];
  /** Where the board's tile art is served; without it the mosaic draws the plans' areas. */
  tileArt?: string;
  /** The controller's window is open. */
  connecting?: boolean;
  /** The last connect failed. */
  error?: string | null;
  onConnect?: () => void;
  onTraining?: () => void;
}

const POINTS: { icon: string; title: string; text: string }[] = [
  { icon: "table-cells-large", title: "Lay tiles", text: "One tile at a time, on a board that grows." },
  { icon: "city", title: "Close structures", text: "Cities, roads, forests: closing one scores it." },
  { icon: "trophy", title: "Beat the day", text: "A daily Challenge, ranked, with a reward above the threshold." },
];

/** The first visit (`/welcome`, section 6.1): what the game is, connect, or play Training without a wallet. */
export function WelcomeScene({ mosaic, tileArt, connecting, error, onConnect, onTraining }: WelcomeSceneProps) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-board text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <div className="grid -rotate-12 scale-125 grid-cols-8 gap-1 opacity-30 tablet:grid-cols-12">
          {mosaic.concat(mosaic).slice(0, 48).map((t, i) => (
            <TileChip key={i} plan={t.plan} orientation={t.orientation} artBase={tileArt} className="aspect-square size-auto w-full rounded-sm border" />
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_30%,var(--color-gold-950),transparent)] opacity-70" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-8 px-4 pt-24 pb-[max(2rem,env(safe-area-inset-bottom))] desktop:max-w-4xl desktop:flex-row desktop:items-center desktop:justify-between desktop:gap-16 desktop:pt-8">
        <div className="flex flex-col items-center gap-6 desktop:flex-1 desktop:items-start">
          <Wordmark tagline="Build · Connect · Score" className="desktop:items-start desktop:text-left" />
          <ul className="hidden flex-col gap-4 desktop:flex">
            {POINTS.map((p) => (
              <li key={p.title} className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon name={p.icon} size="md" />
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-sm text-muted-foreground">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div data-slot="card" className="flex flex-col gap-4 rounded-2xl border border-border bg-card/90 p-5 shadow-xl backdrop-blur desktop:w-96">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">Welcome to Paved</h1>
            <p className="text-sm text-muted-foreground">Connect to enter the daily Challenge, or try a game first: Training needs no wallet.</p>
          </div>
          {error && (
            <Notice tone="danger" title="Could not connect">
              {error}
            </Notice>
          )}
          <Button size="lg" onClick={onConnect} loading={connecting}>
            <Icon name="wallet" size="sm" /> {connecting ? "Connecting…" : "Connect"}
          </Button>
          <Button size="lg" variant="outline" onClick={onTraining} disabled={connecting}>
            <Icon name="play" size="sm" /> Play Training
          </Button>
          <p className="text-center text-xs text-muted-foreground">Training is free and saved on this device.</p>
        </div>
      </div>
    </main>
  );
}
