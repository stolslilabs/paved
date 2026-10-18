import { CreditsScene } from "../../components/scenes/credits-scene";
import { TRACKS, trackTitle } from "../../lib/music/tracks";
import { useBack, useTabNavigate } from "../ref";

const TITLES = TRACKS.map(trackTitle);

/** `/settings/credits`: the notices of the third-party work the client uses (D-15), reached from Settings › More. */
export default function Page() {
  const back = useBack();
  const onNavigate = useTabNavigate();
  return <CreditsScene tracks={TITLES} onBack={back} onNavigate={onNavigate} />;
}
