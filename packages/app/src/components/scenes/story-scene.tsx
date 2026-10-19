import {
  campaignRequirement,
  campaignStars,
  campaignUnlocked,
  levelProgress,
  levelUnlocked,
  type StoryCampaign,
  type StoryProgress,
} from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Notice } from "../elements/notice";
import { StarRow } from "../elements/star-row";
import { TopBar } from "../containers/top-bar";
import { Icon } from "../ui/icon";

export interface StorySceneProps {
  campaigns: readonly StoryCampaign[];
  progress: StoryProgress;
  /** The device refused to save the progress: it lasts for this visit only. */
  storageOff?: boolean;
  onBack?: () => void;
  onLevel?: (campaignId: number, levelIndex: number) => void;
}

/**
 * Story mode (`/story`, #546): the campaigns, each with its levels, their stars and locks. A level opens once the one before
 * it is finished; a campaign once the campaigns before it hold 2 stars per level on average. One column on a phone, the
 * levels in a grid of three from `tablet` up.
 */
export function StoryScene({ campaigns, progress, storageOff, onBack, onLevel }: StorySceneProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Story" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-2 pb-8 tablet:max-w-3xl">
        {storageOff && (
          <Notice tone="warning" title="Storage is off">
            This browser refuses local storage: your stars last until the page closes.
          </Notice>
        )}
        {campaigns.map((campaign) => {
          const open = campaignUnlocked(progress, campaigns, campaign);
          const held = campaignStars(progress, campaign);
          const requirement = campaignRequirement(campaigns, campaign);
          return (
            <section key={campaign.id} aria-labelledby={`campaign-${campaign.id}`} data-campaign={campaign.id} data-locked={!open || undefined} className="flex flex-col gap-3">
              <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 id={`campaign-${campaign.id}`} className="font-display text-lg font-semibold wrap-anywhere">
                    {campaign.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{campaign.summary}</p>
                </div>
                <span className="numeric flex items-center gap-1 text-sm text-muted-foreground" aria-label={`${held} of ${campaign.levels.length * 3} stars`}>
                  <Icon name="star" size="sm" className="text-primary" />
                  {held} / {campaign.levels.length * 3}
                </span>
              </header>
              {!open && (
                <Notice title="Locked" icon="lock">
                  Earn {requirement.needed} stars over the campaigns before this one (2 per level on average) to open it. You have {requirement.held(progress)}.
                </Notice>
              )}
              <ol className="grid grid-cols-1 gap-2 tablet:grid-cols-3">
                {campaign.levels.map((level) => {
                  const unlocked = levelUnlocked(progress, campaigns, campaign, level.id);
                  const done = levelProgress(progress, campaign.id, level.id);
                  return (
                    <li key={level.id}>
                      <button
                        type="button"
                        disabled={!unlocked}
                        onClick={() => onLevel?.(campaign.id, level.id)}
                        data-level={level.id}
                        aria-label={`Level ${level.id}, ${level.title}${unlocked ? "" : ", locked"}${done ? `, ${done.stars} of 3 stars` : ""}`}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left text-card-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          unlocked ? "state-layer cursor-pointer border-border" : "cursor-not-allowed border-border/60 opacity-60",
                        )}
                      >
                        <span className="numeric flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-base font-semibold">
                          {unlocked ? level.id : <Icon name="lock" size="sm" />}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm font-semibold wrap-anywhere">{level.title}</span>
                          <span className="numeric text-xs text-muted-foreground">{level.deck.length + 1} tiles</span>
                        </span>
                        <StarRow stars={done?.stars ?? 0} size="xs" className="shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <p className="text-xs text-muted-foreground">Two more campaigns are on the way: full games of 38 tiles, then games of the whole 72-tile deck.</p>
      </main>
    </div>
  );
}
