import { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Finalize = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      client: { play },
      clientComponents: { Game },
    },
  } = useDojo();

  const gameEntity = getEntityIdFromKeys([BigInt(gameId)]) as Entity;
  const game = useComponentValue(Game, gameEntity);

  if (!account || !game) return <></>;

  const handleClick = () => {
    play.finalize({
      account: account,
      game_id: gameId,
    });
  };

  const className = useMemo(() => {
    return `${game.over ? "cursor-pointer" : "cursor-not-allowed opacity-25"}`;
  }, [game]);

  return (
    <Button className={className} variant={"default"} onClick={handleClick}>
      <FontAwesomeIcon icon={faSackDollar} />
    </Button>
  );
};
