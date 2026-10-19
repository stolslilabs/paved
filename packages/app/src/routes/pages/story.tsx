import { CAMPAIGNS } from "@paved/game-core";
import { StoryScene } from "../../components/scenes/story-scene";
import { levelPath, useStoryProgress } from "../../data/story";
import { useAppNavigate, useBack } from "../ref";

/** `/story` (#546): the campaigns and their levels, with the stars and locks of this device's progress. */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const { progress, saved } = useStoryProgress();
  return <StoryScene campaigns={CAMPAIGNS} progress={progress} storageOff={!saved} onBack={onBack} onLevel={(c, l) => go(levelPath(c, l))} />;
}
