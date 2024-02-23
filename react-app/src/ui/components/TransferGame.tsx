import { useDojo } from "../../dojo/useDojo";

import { useState } from "react";
import { Button } from "@/components/ui/button";

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo, useEffect } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useLobbyStore } from "@/store";
import { Entity } from "@dojoengine/recs";

export const TransferGame = () => {
  const { gameId } = useQueryParams();
  const { playerEntity } = useLobbyStore();
  const [disabled, setDisabled] = useState(false);

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Player, Builder },
      systemCalls: { transfer_game },
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
  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const host = useComponentValue(Player, playerEntity || playerKey);

  useEffect(() => {
    setDisabled(
      !game ||
        !builder ||
        !host ||
        game.host !== builder.player_id ||
        host.id === builder.player_id
    );
  }, [game, builder, playerEntity, host]);

  const handleClick = () => {
    if (!host) return;
    transfer_game({
      account: account,
      game_id: gameId,
      host_id: host.id,
    });
  };

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Transfer
    </Button>
  );
};
