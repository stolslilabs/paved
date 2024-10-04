import { getAvailableCharacters } from "@/dojo/game";
import { useMemo } from "react";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "@/hooks/useBuilder";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Character } from "../Character";

export const CharacterMenu = () => {
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

  return (
    <div className="grid col-span-2 grid-cols-3 grid-rows-2 items-center justify-items-center col-start-1 row-start-8 sm:row-span-3 sm:col-span-2 sm:flex sm:flex-col sm:items-end sm:justify-center sm:gap-4">
      {characters.map(({ status }, index) => (
        /* TODO: Refactor Character component */
        <Character key={index} index={index} enable={status} />
      ))}
      <div className="row-start-1 col-start-3 sm:hidden pointer-events-none" />
    </div>
  );
};
