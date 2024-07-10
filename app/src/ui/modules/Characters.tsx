import { Character } from "../components/Character";
import { getAvailableCharacters } from "@/dojo/game";
import { useMemo } from "react";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "@/hooks/useBuilder";
import { isMobile } from "react-device-detect";

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
    <footer
      className={`z-20 flex flex-col-reverse items-start absolute bottom-2 left-2 pointer-events-none
                   ${!isMobile && "md:flex-row md:justify-between md:items-center md:bottom-4 md:left-1/2 md:-translate-x-1/2"}`}
    >
      <div
        className={`flex flex-col-reverse items-start gap-4
                  ${!isMobile && "md:flex-row md:flex-wrap md:justify-center md:items-center md:grow md:gap-4 lg:gap-8"}`}
      >
        {characters.map(({ status }, index) => (
          <Character key={index} index={index} enable={status} />
        ))}
      </div>
    </footer>
  );
};
