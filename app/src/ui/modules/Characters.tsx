import { Character } from "../components/Character";
import { getAvailableCharacters } from "@/dojo/game";
import { useMemo } from "react";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "@/hooks/useBuilder";

export const Characters = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  const characters = useMemo(
    () => getAvailableCharacters(builder ? builder.characters : 0),
    [builder],
  );

  if (!account || !builder) return <></>;

  return (
    <footer className="z-20 flex justify-between items-center absolute bottom-2 md:bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-none">
      <div className="flex flex-wrap justify-center items-center grow gap-4 lg:gap-8">
        {characters.map(({ status }, index) => (
          <Character key={index} index={index} enable={status} />
        ))}
      </div>
    </footer>
  );
};
