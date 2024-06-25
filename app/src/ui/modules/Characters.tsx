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
    <footer className="z-20 flex flex-col-reverse items-start absolute bottom-2 left-2 pointer-events-none
                   sm:flex-row sm:justify-between sm:items-center sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2">
      <div className="flex flex-col-reverse items-start gap-4
                  sm:flex-row sm:flex-wrap sm:justify-center sm:items-center sm:grow sm:gap-4 lg:gap-8">
        {characters.map(({ status }, index) => (
          <Character key={index} index={index} enable={status} />
        ))}
      </div>
    </footer>
  );
};
