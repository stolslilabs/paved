import { useCallback, useEffect, useState } from "react";
import {
  PlanType,
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
import type { TileRenders } from "../elements/tile-render";
import { CampaignCard, type CampaignStatus } from "../containers/story-panels";
import { TopBar } from "../containers/top-bar";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import { Icon } from "../ui/icon";

/**
 * How the campaign cards are laid out (#592): `carousel` swipes one card nearly full width on a phone, its neighbour peeking,
 * and turns into the grid from `tablet` up; `grid` wraps the cards at every width (one a row on a phone).
 */
export type CampaignLayout = "carousel" | "grid";

export interface StorySceneProps {
  campaigns: readonly StoryCampaign[];
  progress: StoryProgress;
  /** The campaign whose levels show first; unset: the last one open. */
  campaignId?: number;
  /** Campaigns opened since the device last showed the list: their cards play the unlock once. */
  justUnlocked?: readonly number[];
  /** The build-time tile renders the cards' backgrounds draw from. */
  renders?: TileRenders;
  layout?: CampaignLayout;
  /** The device refused to save the progress: it lasts for this visit only. */
  storageOff?: boolean;
  onBack?: () => void;
  onCampaign?: (campaignId: number) => void;
  onLevel?: (campaignId: number, levelIndex: number) => void;
}

const PLAN_IDS = Object.values(PlanType);

/** A campaign's background: the distinct plans of its decks in draw order, as chain ids. */
const coverPlans = (campaign: StoryCampaign): number[] => [...new Set(campaign.levels.flatMap((l) => l.deck))].map((p) => PLAN_IDS.indexOf(p));

function statusOf(progress: StoryProgress, campaigns: readonly StoryCampaign[], campaign: StoryCampaign, fresh: boolean): CampaignStatus {
  if (!campaignUnlocked(progress, campaigns, campaign)) return "locked";
  if (fresh) return "unlocking";
  return campaign.levels.every((l) => levelProgress(progress, campaign.id, l.id)) ? "complete" : "open";
}

/**
 * Story mode (`/story`, #546, #592): the campaigns as cards (their tiles behind, their stars, a lock and a blur until they
 * open), and the levels of the chosen one. A level opens once the one before it is finished; a campaign once the campaigns
 * before it hold 2 stars per level on average. On a phone the cards swipe (the chosen one is the one in view); from `tablet`
 * up they sit in a grid and a press picks one. The levels: one column on a phone, two from `tablet`, three from `desktop`,
 * each title on one line.
 */
export function StoryScene({ campaigns, progress, campaignId, justUnlocked = [], renders, layout = "carousel", storageOff, onBack, onCampaign, onLevel }: StorySceneProps) {
  const [chosen, setChosen] = useState(() => campaignId ?? [...campaigns].reverse().find((c) => campaignUnlocked(progress, campaigns, c))?.id ?? campaigns[0]?.id);
  const [api, setApi] = useState<CarouselApi>();
  const campaign = campaigns.find((c) => c.id === chosen) ?? campaigns[0];

  const choose = useCallback(
    (id: number) => {
      setChosen(id);
      onCampaign?.(id);
    },
    [onCampaign],
  );

  // A swipe chooses the card it lands on; a press on a card brings it into view.
  useEffect(() => {
    if (!api) return;
    const follow = () => {
      const landed = campaigns[api.selectedScrollSnap()];
      if (landed) choose(landed.id);
    };
    api.on("select", follow);
    return () => {
      api.off("select", follow);
    };
  }, [api, campaigns, choose]);

  const start = Math.max(0, campaigns.findIndex((c) => c.id === chosen));
  const carousel = layout === "carousel";
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Story" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-2 pb-8 tablet:max-w-3xl desktop:max-w-5xl">
        {storageOff && (
          <Notice tone="warning" title="Storage is off">
            This browser refuses local storage: your stars last until the page closes.
          </Notice>
        )}
        <Carousel
          aria-label="Campaigns"
          setApi={setApi}
          opts={{ startIndex: start, active: carousel, breakpoints: { "(min-width: 40rem)": { active: false } } }}
        >
          <CarouselContent className={cn(carousel ? "tablet:flex-wrap tablet:gap-y-4" : "flex-wrap gap-y-4")}>
            {campaigns.map((c, index) => {
              const { needed, held } = campaignRequirement(campaigns, c);
              return (
                <CarouselItem key={c.id} className={cn(carousel ? "basis-[86%]" : "basis-full", "tablet:basis-1/2 desktop:basis-1/3")}>
                  <CampaignCard
                    id={c.id}
                    name={c.name}
                    summary={c.summary}
                    levels={c.levels.length}
                    stars={campaignStars(progress, c)}
                    status={statusOf(progress, campaigns, c, justUnlocked.includes(c.id))}
                    missing={Math.max(0, needed - held(progress))}
                    plans={coverPlans(c)}
                    renders={renders}
                    selected={c.id === campaign?.id}
                    onSelect={() => {
                      choose(c.id);
                      api?.scrollTo(index);
                    }}
                  />
                </CarouselItem>
              );
            })}
            <CarouselItem className={cn(carousel ? "basis-[86%]" : "basis-full", "tablet:basis-full desktop:basis-1/3")}>
              <div className="flex aspect-[16/10] w-full tablet:aspect-auto tablet:flex-row tablet:py-3 desktop:aspect-[16/10] desktop:flex-col flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                <Icon name="hourglass" size="md" />
                Two more campaigns are on the way: full games of 38 tiles, then games of the whole 72-tile deck.
              </div>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
        {carousel && (
          <div aria-hidden className="-mt-3 flex justify-center gap-1.5 tablet:hidden">
            {campaigns.map((c) => (
              <span key={c.id} className={cn("h-1.5 rounded-full transition-all", c.id === campaign?.id ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40")} />
            ))}
          </div>
        )}
        {campaign && <CampaignLevels campaigns={campaigns} campaign={campaign} progress={progress} onLevel={onLevel} />}
      </main>
    </div>
  );
}

function CampaignLevels({ campaigns, campaign, progress, onLevel }: { campaigns: readonly StoryCampaign[]; campaign: StoryCampaign; progress: StoryProgress; onLevel?: StorySceneProps["onLevel"] }) {
  const open = campaignUnlocked(progress, campaigns, campaign);
  const held = campaignStars(progress, campaign);
  const requirement = campaignRequirement(campaigns, campaign);
  return (
    <section aria-labelledby={`campaign-${campaign.id}`} data-campaign={campaign.id} data-locked={!open || undefined} className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <h2 id={`campaign-${campaign.id}`} className="min-w-0 truncate font-display text-lg font-semibold">
          {campaign.name}
        </h2>
        <span className="numeric flex shrink-0 items-center gap-1 text-sm text-muted-foreground" aria-label={`${held} of ${campaign.levels.length * 3} stars`}>
          <Icon name="star" size="sm" className="text-primary" />
          {held} / {campaign.levels.length * 3}
        </span>
      </header>
      {!open && (
        <Notice title="Locked" icon="lock">
          Earn {requirement.needed} stars over the campaigns before this one (2 per level on average) to open it. You have {requirement.held(progress)}.
        </Notice>
      )}
      <ol className="grid grid-cols-1 gap-2 tablet:grid-cols-2 desktop:grid-cols-3">
        {campaign.levels.map((level) => {
          const unlocked = levelUnlocked(progress, campaigns, campaign, level.id);
          const done = levelProgress(progress, campaign.id, level.id);
          return (
            <li key={level.id} className="min-w-0">
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => onLevel?.(campaign.id, level.id)}
                data-level={level.id}
                title={level.title}
                aria-label={`Level ${level.id}, ${level.title}${unlocked ? "" : ", locked"}${done ? `, ${done.stars} of 3 stars` : ""}`}
                className={cn(
                  "flex h-16 w-full items-center gap-3 rounded-xl border bg-card px-3 text-left text-card-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  unlocked ? "state-layer cursor-pointer border-border" : "cursor-not-allowed border-border/60 opacity-60",
                )}
              >
                <span className="numeric flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-base font-semibold">
                  {unlocked ? level.id : <Icon name="lock" size="sm" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span data-testid="level-title" className="truncate text-sm font-semibold">
                    {level.title}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="numeric text-xs text-muted-foreground">{level.deck.length + 1} tiles</span>
                    <StarRow stars={done?.stars ?? 0} size="xs" className="shrink-0" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
