import { useDojo } from "../../dojo/useDojo";

import { useState } from "react";
import { Button } from "@/components/ui/button";

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo, useEffect } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";

export const LeaveGame = () => {
  const { gameId } = useQueryParams();
  const [disabled, setDisabled] = useState(false);

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
      systemCalls: { leave_game },
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

  useEffect(() => {
    setDisabled(
      !game || !builder || !builder.order || game.host === builder.player_id
    );
  }, [game, builder]);

  const handleClick = () => {
    leave_game({
      account: account,
      game_id: gameId,
    });
  };

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Leave
    </Button>
  );
};
