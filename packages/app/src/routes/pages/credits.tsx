import { CreditsScene } from "../../components/scenes/credits-scene";
import { SFX_CREDITS } from "../../lib/audio/sfx";
import { titleOf } from "../../lib/music/track-info";
import { TRACKS } from "../../lib/music/tracks";
import { useBack, useTabNavigate } from "../ref";

const TITLES = TRACKS.map(titleOf);

/** `/settings/credits`: the notices of the third-party work the client uses (D-15), reached from Settings › More. */
export default function Page() {
  const back = useBack();
  const onNavigate = useTabNavigate();
  return <CreditsScene tracks={TITLES} sounds={[...SFX_CREDITS]} onBack={back} onNavigate={onNavigate} />;
}
