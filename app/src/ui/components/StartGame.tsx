import { useDojo } from "../../dojo/useDojo";

import { Button } from "@/components/ui/button";

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";

export const StartGame = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
      systemCalls: { start_game },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);
  const builderKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]),
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  const disabled = useMemo(() => {
    const readiness =
      game && game.players === BigInt(2 ** game.player_count - 1);
    return !game || !builder || builder.index !== 0 || !readiness;
  }, [game, builder]);

  const handleClick = () => {
    start_game({
      account: account,
      game_id: gameId,
    });
  };

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Start
    </Button>
  );
};
