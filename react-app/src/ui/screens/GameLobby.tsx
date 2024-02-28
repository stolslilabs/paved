import { Games } from "@/ui/containers/Games";
import { Player } from "@/ui/containers/Player";
import { Header } from "@/ui/containers/Header";

export const GameLobby = () => {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex grow">
        <Player />
        <Games />
      </div>
    </div>
  );
};
