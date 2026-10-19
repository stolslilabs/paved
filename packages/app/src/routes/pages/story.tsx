import { useSearchParams } from "react-router";
import { CAMPAIGNS } from "@paved/game-core";
import { StoryScene } from "../../components/scenes/story-scene";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { levelPath, useCampaignUnlocks, useStoryProgress } from "../../data/story";
import { useTileRenders } from "../../data/tile-renders";
import { useAppNavigate, useBack } from "../ref";

/**
 * `/story` (#546, #592): the campaigns as cards and the levels of the chosen one, with the stars and locks of this device's
 * progress. The chosen campaign is the address's `?campaign=` (replaced, not pushed), so Back from a level lands on it; a
 * campaign opened since the last visit plays its unlock once.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const [params, setParams] = useSearchParams();
  const { progress, saved } = useStoryProgress();
  const justUnlocked = useCampaignUnlocks(CAMPAIGNS, progress);
  const renders = useTileRenders(RENDERER_ASSETS);
  const asked = Number(params.get("campaign"));
  const campaignId = CAMPAIGNS.some((c) => c.id === asked) ? asked : justUnlocked[0];
  return (
    <StoryScene
      campaigns={CAMPAIGNS}
      progress={progress}
      campaignId={campaignId}
      justUnlocked={justUnlocked}
      renders={renders}
      storageOff={!saved}
      onBack={onBack}
      onCampaign={(id) => {
        if (params.get("campaign") !== String(id)) setParams({ campaign: String(id) }, { replace: true });
      }}
      onLevel={(c, l) => go(levelPath(c, l))}
    />
  );
}
