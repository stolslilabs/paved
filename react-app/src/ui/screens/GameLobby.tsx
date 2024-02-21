import { Games } from "@/ui/containers/Games";
import { Player } from "@/ui/containers/Player";

export const GameLobby = () => {
  return (
    <div className="flex">
      <Player />
      <Games />
    </div>
  );
};
