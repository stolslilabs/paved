import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";

export const JoinGame = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      systemCalls: { join_game },
    },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({ gameId, playerId: account.address });

  const disabled = useMemo(
    () => !game || (!!builder && builder.index < game.player_count),
    [game, builder],
  );

  const handleClick = async () => {
    if (!game) return;
    if (
      (!builder || builder.index >= game.player_count) &&
      game.start_time === 0 &&
      !game.over
    ) {
      await join_game({
        account: account,
        game_id: game.id,
      });
    }
  };

  if (!game) return null;

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Join
    </Button>
  );
};
