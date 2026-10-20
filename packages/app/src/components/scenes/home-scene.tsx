import type { GameView } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Countdown } from "../elements/countdown";
import { Icon } from "../ui/icon";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { Wordmark } from "../elements/wordmark";
import { BoardHero } from "../elements/board-hero";
import modeChallenge from "../../assets/renders/mode-challenge.webp";
import { BalancesSlot } from "../containers/balances-context";
import { TabFrame } from "../containers/tab-frame";
import { ModeCard } from "../containers/mode-card";
import { PlayerStatus, type PlayerStatusData } from "../containers/player-status";

/** The Training save on this device: enough to offer Resume. */
export interface TrainingSave {
  score: number;
  remaining: number;
}

/** The player's Cobbles and free games (P-61, `AccountView`): provisional until CORE's gems PR 1. */
export interface HomeCobbles {
  balance: number;
  /** Free Challenge games to spend (`credits`). */
  credits: number;
}

export interface HomeSceneProps {
  /** Null: a guest (no wallet). */
  player: PlayerStatusData | null;
  /** The viewer's Challenge game still running (`GameSpawned` events, then `game(id)`); its deadline is `expiresAt`. */
  activeGame: GameView | null;
  training: TrainingSave | null;
  /** `Challenge.spawn_paused`: a purchase is refused, a started game still plays (W1i). */
  spawnPaused: boolean;
  now: number;
  connecting?: boolean;
  /** The Cobbles balance and free games; omitted for a guest or before Cobbles. */
  cobbles?: HomeCobbles | null;
  onPlay?: () => void;
  /** Spends a free game (`Challenge.spawn_free`). */
  onPlayFree?: () => void;
  onChallenge?: () => void;
  onTraining?: () => void;
  onStory?: () => void;
  onResume?: (gameId: number) => void;
  onConnect?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * Home (`/`), direction D (#537): the hero (a render of a real board under the voxel wordmark, as the mockups' first screen),
 * then Play, the player's status, the game to resume, the mode cards and the Challenge's banner card; the five tabs. No
 * podium: the ranks left the UI (#623), to come back as leagues.
 */
export function HomeScene(props: HomeSceneProps) {
  const { player, activeGame, training, spawnPaused, now, cobbles } = props;
  return (
    <TabFrame tab="home" onNavigate={props.onNavigate}>
      <header className="relative h-64 w-full tablet:h-80">
        <BoardHero />
        <h1 className="sr-only">Home</h1>
        <div className="relative mx-auto flex h-full w-full max-w-md flex-col items-center px-4 pt-4 tablet:max-w-2xl desktop:max-w-5xl desktop:items-start desktop:justify-center desktop:px-8 desktop:pt-0">
          <BalancesSlot layout="pill" className="self-end" />
          <Wordmark tagline="Build · Connect · Score" className="mt-2 desktop:mt-0 desktop:items-start [&_span]:[text-shadow:0_1px_3px_var(--color-board)]" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 pb-6 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pb-10">
        <div className="grid grid-cols-1 gap-4 wide:grid-cols-[minmax(0,1fr)_24rem] wide:items-start">
          <div className="flex flex-col gap-4">
            <Button size="lg" className="text-lg" onClick={props.onPlay}>
              Play <Icon name="chevron-right" size="md" />
            </Button>

            <PlayerStatus data={player} onConnect={props.onConnect} connecting={props.connecting} />

            {activeGame && (
              <div data-slot="card" className="flex items-center gap-3 rounded-xl border border-primary/40 bg-card p-3">
                <img src={modeChallenge} alt="" width={320} height={200} draggable={false} decoding="async" className="h-14 w-20 shrink-0 rounded-lg bg-secondary object-cover" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold wrap-anywhere">Challenge #{activeGame.id} in progress</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="numeric">{formatPoints(activeGame.score)} pts</span>
                    <span className="numeric">{activeGame.remainingCount} tiles left</span>
                    <Countdown expiresAt={activeGame.expiresAt} now={now} />
                  </span>
                </div>
                <Button size="sm" onClick={() => props.onResume?.(activeGame.id)}>Resume</Button>
              </div>
            )}

            {cobbles && cobbles.credits > 0 && (
              <ModeCard
                icon="ticket"
                title="Free game"
                description={`${cobbles.credits} free Challenge ${cobbles.credits === 1 ? "game" : "games"} from your missions.`}
                badge="Free"
                disabled={spawnPaused}
                reason="New games are paused"
                onSelect={props.onPlayFree}
              />
            )}

            {spawnPaused && (
              <Notice tone="warning" title="Purchases paused">
                New Challenge games are paused for now. A game already started still plays.
              </Notice>
            )}

            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
              <ModeCard
                icon="play"
                title="Training"
                description={training ? `Resume: ${formatPoints(training.score)} pts, ${training.remaining} tiles left` : "A free game, saved on this device."}
                badge="Free"
                onSelect={props.onTraining}
              />
              <ModeCard icon="book-open" title="Story" description="Learn the rules level by level, then go for three stars." onSelect={props.onStory} />
            </div>
          </div>

          <ModeCard
            featured
            banner={modeChallenge}
            icon="trophy"
            title="Challenge"
            description="Stake, beat the threshold, earn PAVED."
            badge="Paid"
            disabled={spawnPaused}
            reason="Purchases paused"
            onSelect={props.onChallenge}
          />
        </div>
      </main>
    </TabFrame>
  );
}
