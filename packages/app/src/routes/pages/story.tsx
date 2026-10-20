import { useEffect, useRef } from "react";
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
 * campaign opened since the last visit is chosen instead, so its card is in view while it plays its unlock, once.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const [params, setParams] = useSearchParams();
  const { progress, saved } = useStoryProgress();
  const justUnlocked = useCampaignUnlocks(CAMPAIGNS, progress);
  const renders = useTileRenders(RENDERER_ASSETS);
  const asked = Number(params.get("campaign"));
  // A campaign just opened comes first, over one remembered in the address: its unlock plays once, so its card must be the one in view.
  const campaignId = justUnlocked[0] ?? (CAMPAIGNS.some((c) => c.id === asked) ? asked : undefined);
  // The address follows, once on arrival, so Back from one of its levels lands on it again; a later pick is the player's.
  const followed = useRef(false);
  useEffect(() => {
    if (followed.current) return;
    followed.current = true;
    if (justUnlocked[0] != null && params.get("campaign") !== String(justUnlocked[0])) setParams({ campaign: String(justUnlocked[0]) }, { replace: true });
  }, [justUnlocked, params, setParams]);
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
