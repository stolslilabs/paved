import { Notice } from "../elements/notice";
import { ModeCard } from "../containers/mode-card";
import { TopBar } from "../containers/top-bar";

export interface PlaySceneProps {
  /** A wallet is connected: the Challenge can be bought. */
  connected: boolean;
  /** `Challenge.spawn_paused`. */
  spawnPaused: boolean;
  /** Free Challenge games from the quests (P-61, `AccountView.credits`); none when omitted. */
  credits?: number;
  onBack?: () => void;
  /** Spends a free game (`Challenge.spawn_free`). */
  onPlayFree?: () => void;
  onChallenge?: () => void;
  onTraining?: () => void;
  onTutorial?: () => void;
  onConnect?: () => void;
}

/** The mode choice (`/play`): Challenge, Training, Tutorial, and Multiplayer disabled ("coming soon", owner D-4). */
export function PlayScene({ connected, spawnPaused, credits = 0, onBack, onChallenge, onTraining, onTutorial, onConnect, onPlayFree }: PlaySceneProps) {
  // A guest's tap on the Challenge connects first; a pause disables it.
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Choose a mode" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-2 pb-8 tablet:max-w-2xl tablet:grid tablet:grid-cols-2 tablet:gap-4">
        <ModeCard
          featured
          icon="trophy"
          title="Challenge"
          description="A ranked game: stake 1 to 10, beat the threshold, earn PAVED."
          badge="Paid"
          disabled={spawnPaused}
          reason="Purchases are paused for now."
          onSelect={connected ? onChallenge : onConnect}
          className="tablet:col-span-2"
        >
          {!connected && !spawnPaused && <p className="text-xs text-primary">Connect a wallet to enter: tap to connect.</p>}
        </ModeCard>
        {connected && credits > 0 && (
          <ModeCard
            icon="ticket"
            title="Free Challenge"
            description={`${credits} free ${credits === 1 ? "game" : "games"} from your quests: ranked, no PAVED at stake.`}
            badge="Free"
            disabled={spawnPaused}
            reason="New games are paused for now."
            onSelect={onPlayFree}
            className="tablet:col-span-2"
          />
        )}
        <ModeCard icon="play" title="Training" description="A full game for free, saved on this device." badge="Free" onSelect={onTraining} />
        <ModeCard icon="book-open" title="Tutorial" description="Learn the basics, one stage at a time." onSelect={onTutorial} />
        <ModeCard
          icon="user-group"
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
