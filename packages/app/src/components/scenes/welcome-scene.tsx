import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { BoardHero } from "../elements/board-hero";
import { Wordmark } from "../elements/wordmark";
import { PageHeader } from "../containers/top-bar";

export interface WelcomeSceneProps {
  /** The controller's window is open. */
  connecting?: boolean;
  /** The last connect failed. */
  error?: string | null;
  /** That failure's detail for support (`InlineError`). */
  errorDetail?: ErrorDetail;
  onConnect?: () => void;
  onTraining?: () => void;
  /** Back, at the top left (#760): to the village, the home, as a guest. */
  onBack?: () => void;
}

const POINTS: { icon: string; title: string; text: string }[] = [
  { icon: "table-cells-large", title: "Lay tiles", text: "One tile at a time, on a board that grows." },
  { icon: "castle", title: "Close structures", text: "Cities, roads, forests: closing one scores it." },
  { icon: "trophy", title: "Beat the day", text: "A daily Challenge, with a reward above the threshold." },
];

/**
 * The first visit (`/welcome`, section 6.1): what the game is, connect, or play Training without a wallet. Its header is every
 * page's (`PageHeader`, ONE-HEADER #781): Back at the top left to the village, the title; no balances (#855: the welcome uses none).
 * No document fade under it (`document` off): the hero fits a phone's height.
 */
export function WelcomeScene({ connecting, error, errorDetail, onConnect, onTraining, onBack }: WelcomeSceneProps) {
  return (
    // Clipped sideways, not `overflow: hidden`: a scroll container would hold the sticky header in place of the document.
    <main className="relative flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
      <BoardHero shade="veil" />
      <PageHeader title="Welcome" onBack={onBack} />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-8 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] desktop:max-w-4xl desktop:flex-row desktop:items-center desktop:justify-between desktop:gap-16">
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

        <div data-slot="card" className="flex flex-col gap-4 rounded-xl border border-border bg-card/95 p-5 shadow-xl backdrop-blur desktop:w-96">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl font-semibold">Welcome to Paved</h2>
            <p className="text-sm text-muted-foreground">Connect to enter the daily Challenge, or try a game first: Training needs no wallet.</p>
          </div>
          <InlineError title="Could not connect" message={error} detail={errorDetail} />
          <Button size="lg" onClick={onConnect} loading={connecting}>
            <Icon name="wallet" size="sm" /> {connecting ? "Connecting…" : "Connect"}
          </Button>
          <Button size="lg" variant="outline" onClick={onTraining} disabled={connecting}>
            <Icon name="play" size="sm" /> Play Training
          </Button>
          <p className="text-center text-xs text-muted-foreground">Training is free.</p>
        </div>
      </div>
    </main>
  );
}
