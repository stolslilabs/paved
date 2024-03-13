import { Games } from "@/ui/containers/Games";
import { Player } from "@/ui/containers/Player";
import { Header } from "@/ui/containers/Header";

export const GameLobby = () => {
  return (
    <div className="h-full flex grow">
      {/* <Header /> */}
      <Player />
      <Games />
    </div>
  );
};
