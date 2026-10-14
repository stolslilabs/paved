import { Notice } from "../elements/notice";
import { ModeCard } from "../containers/mode-card";
import { TopBar } from "../containers/top-bar";

export interface PlaySceneProps {
  /** A wallet is connected: the Challenge can be bought. */
  connected: boolean;
  /** `Challenge.spawn_paused`. */
  spawnPaused: boolean;
  onBack?: () => void;
  onChallenge?: () => void;
  onTraining?: () => void;
  onTutorial?: () => void;
  onConnect?: () => void;
}

/** The mode choice (`/play`): Challenge, Training, Tutorial, and Multiplayer disabled ("coming soon", owner D-4). */
export function PlayScene({ connected, spawnPaused, onBack, onChallenge, onTraining, onTutorial, onConnect }: PlaySceneProps) {
  const challengeReason = spawnPaused ? "Purchases are paused for now." : !connected ? "Connect a wallet to enter." : undefined;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Choose a mode" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-2 pb-8 tablet:max-w-2xl tablet:grid tablet:grid-cols-2 tablet:gap-4">
        <ModeCard
          featured
          icon="trophy"
          title="Challenge"
          description="The daily ranked game: stake 1 to 10, beat the threshold, earn $TILE."
          badge="Paid"
          disabled={!!challengeReason}
          reason={challengeReason}
          onSelect={onChallenge}
          className="tablet:col-span-2"
        >
          {!connected && !spawnPaused && (
            <button type="button" onClick={onConnect} className="cursor-pointer text-sm font-semibold text-primary underline-offset-4 hover:underline">
              Connect
            </button>
          )}
        </ModeCard>
        <ModeCard icon="play" title="Training" description="A full game for free, saved on this device." badge="Free" onSelect={onTraining} />
        <ModeCard icon="book" title="Tutorial" description="Learn the basics, one stage at a time." onSelect={onTutorial} />
        <ModeCard
          icon="users"
          title="Multiplayer"
          description="Play with your friends in real time."
          badge="Coming soon"
          disabled
          className="tablet:col-span-2"
        />
        {spawnPaused && (
          <Notice tone="warning" className="tablet:col-span-2">
            New Challenge games are paused. Training and the Tutorial stay open.
          </Notice>
        )}
      </main>
    </div>
  );
}
