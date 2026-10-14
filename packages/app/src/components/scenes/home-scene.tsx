import type { GameView, Leaderboard } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Countdown } from "../elements/countdown";
import { Icon } from "../ui/icon";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { Wordmark } from "../elements/wordmark";
import { AppNav } from "../containers/app-nav";
import { ModeCard } from "../containers/mode-card";
import { PlayerStatus, type PlayerStatusData } from "../containers/player-status";
import { TopThree } from "../containers/top-three";

/** The Training save on this device: enough to offer Resume. */
export interface TrainingSave {
  score: number;
  remaining: number;
}

export interface HomeSceneProps {
  /** Null: a guest (no wallet). */
  player: PlayerStatusData | null;
  /** Today's leaderboard (`/v1/tournaments/:day/leaderboard`); its first three rows are the podium. */
  leaderboard: Leaderboard;
  /** The viewer's Challenge game still running (`GameSpawned` events, then `game(id)`); its deadline is `expiresAt`. */
  activeGame: GameView | null;
  training: TrainingSave | null;
  /** `Challenge.spawn_paused`: a purchase is refused, a started game still plays (W1i). */
  spawnPaused: boolean;
  now: number;
  connecting?: boolean;
  onPlay?: () => void;
  onChallenge?: () => void;
  onTraining?: () => void;
  onTutorial?: () => void;
  onResume?: (gameId: number) => void;
  onConnect?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/** Home (`/`): Play, the player's status, the game to resume, the mode cards with today's Challenge top 3; the five tabs. */
export function HomeScene(props: HomeSceneProps) {
  const { player, leaderboard, activeGame, training, spawnPaused, now } = props;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground desktop:flex-row">
      <AppNav active="home" onNavigate={props.onNavigate} className="desktop:min-h-dvh" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-6 pb-6 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pb-10">
        <header className="flex items-center justify-between">
          <Wordmark size="md" />
          <span className="text-xs text-muted-foreground">Day {leaderboard.tournamentId}</span>
        </header>

        <div className="grid gap-4 wide:grid-cols-[1fr_24rem] wide:items-start">
          <div className="flex flex-col gap-4">
            <PlayerStatus data={player} onConnect={props.onConnect} connecting={props.connecting} />

            {activeGame && (
              <div data-slot="card" className="flex items-center gap-3 rounded-xl border border-gold-800 bg-gold-950/50 p-4">
                <Icon name="play" className="text-primary" size="md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold">Challenge #{activeGame.id} in progress</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="numeric">{formatPoints(activeGame.score)} pts</span>
                    <span className="numeric">{activeGame.remainingCount} tiles left</span>
                    <Countdown expiresAt={activeGame.expiresAt} now={now} />
                  </span>
                </div>
                <Button size="sm" onClick={() => props.onResume?.(activeGame.id)}>Resume</Button>
              </div>
            )}

            <Button size="lg" className="h-14 text-lg" onClick={props.onPlay}>
              Play <Icon name="chevron-right" size="md" />
            </Button>

            {spawnPaused && (
              <Notice tone="warning" title="Purchases paused">
                New Challenge games are paused for now. A game already started still plays.
              </Notice>
            )}

            <div className="grid gap-3 tablet:grid-cols-2">
              <ModeCard
                icon="play"
                title="Training"
                description={training ? `Resume: ${formatPoints(training.score)} pts, ${training.remaining} tiles left` : "A free game, saved on this device."}
                badge="Free"
                onSelect={props.onTraining}
              />
              <ModeCard icon="book-open" title="Tutorial" description="Learn the rules, one stage at a time." onSelect={props.onTutorial} />
            </div>
          </div>

          <ModeCard
            featured
            icon="trophy"
            title="Challenge"
            description="Today's ranked game. Beat the threshold to earn $TILE."
            badge="Daily"
            disabled={spawnPaused}
            reason="Purchases paused"
            onSelect={props.onChallenge}
          >
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Today's top 3</span>
                <Countdown expiresAt={leaderboard.endTime} now={now} label="Ends in" />
              </div>
              <TopThree entries={leaderboard.entries} viewer={player?.today} />
            </div>
          </ModeCard>
        </div>
      </main>
    </div>
  );
}
